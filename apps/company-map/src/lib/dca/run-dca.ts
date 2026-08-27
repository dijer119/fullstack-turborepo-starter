// QQQ·QLD 적립식 오케스트레이터. 순서 불변식:
//   ① LIVE 체결 정산(토스 대조) → ② 잔액 반영 → ③ 적립 → ④ peak 갱신 → ⑤ 종목 선택
//   → ⑥ 주문 접수 창 확인 → ⑦ 주문 금액 계산 → ⑧ 기록·제출
// 주문은 금액 기반 시장가라 dryRun은 ⑧에서 즉시 체결로 기록하고 같은 실행 안에서 차감한다
// (이전 LOC 모델의 "다음 거래일 일봉으로 판정" 단계가 없어졌다).
// blocked 시 lastRunDate를 갱신하지 않아 다음 폴에서 자동 재시도된다 (run-vr.ts와 동일 패턴).
// 적립은 lastAccrualDate로 별도 멱등을 보장하므로 재시도 시에도 중복되지 않는다.
import type { PrismaClient } from "@prisma-clients/company-map";
import { pickSymbol, updatePeak } from "./peak";
import { estimateQuantity, planAmountBuy } from "./sizing";
import { accrue, applyFills } from "./state";

export interface DcaClosedOrder {
  orderId: string;
  filledQuantity: number;
  averageFilledPrice: number | null;
}

export interface DcaRunDeps {
  getDefaultAccountSeq(): Promise<number>;
  getPrevTradeClose(symbol: string, before: string): Promise<{ date: string; close: number } | null>;
  getCurrentPrice(symbol: string): Promise<number>;
  getUsdKrw(): Promise<number>;
  getBuyingPowerUsd(accountSeq: number): Promise<number>;
  getClosedOrders(accountSeq: number, symbol: string, from: string): Promise<DcaClosedOrder[]>;
  /** 금액 기반 주문 접수 창(정규장 시작~종료 1시간 전)이 열려 있는지 */
  isAmountOrderWindowOpen(): Promise<boolean>;
  submitOrder(
    accountSeq: number,
    o: { amountUsd: number; clientOrderId: string },
    symbol: string,
  ): Promise<{ tossOrderId: string }>;
}

export interface DcaRunResult {
  /** LIVE 실제 제출 건수 */
  placed: number;
  /** dryRun 기록 건수 */
  simulated: number;
  symbol: string | null;
  drawdownPct: number | null;
  accrued: boolean;
  blocked: string | null;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * 토스 멱등성 키. 같은 계좌·같은 거래일이면 **항상 같은 값**이어야 한다 — 워커와 "지금 실행"이
 * 서로 다른 프로세스에서 동시에 제출해도 토스가 10분 안에는 앞선 주문 결과를 그대로 되돌려주므로,
 * 이 안정성이 곧 중복 실주문 방어다. 결과는 항상 36자 이하이고 [A-Za-z0-9-_]만 쓴다.
 * 예: ("a1b2c3d4-…", "2026-08-28") → "dca-a1b2c3d4-20260828"
 */
export function makeClientOrderId(accountId: string, tradeDate: string): string {
  return `dca-${accountId.slice(0, 8)}-${tradeDate.replace(/-/g, "")}`;
}

// ① LIVE — 제출된 주문을 토스 CLOSED 목록과 대조해 체결/만료 확정.
async function settleLiveOrders(
  db: PrismaClient,
  deps: DcaRunDeps,
  account: { id: string; accountSeq: number | null },
): Promise<void> {
  const pending = await db.dcaOrder.findMany({
    where: { accountId: account.id, dryRun: false, status: "submitted" },
    orderBy: { tradeDate: "asc" },
  });
  if (pending.length === 0) return;
  const accountSeq = account.accountSeq ?? (await deps.getDefaultAccountSeq());
  const from = pending[0].tradeDate;
  const cache = new Map<string, DcaClosedOrder[]>();
  for (const o of pending) {
    if (!cache.has(o.symbol)) {
      cache.set(o.symbol, await deps.getClosedOrders(accountSeq, o.symbol, from));
    }
    const closed = cache.get(o.symbol)!.find((c) => c.orderId === o.tossOrderId);
    if (!closed) continue; // 아직 CLOSED 아님 — 다음 폴에서 재시도
    await db.dcaOrder.update({
      where: { id: o.id },
      data:
        closed.filledQuantity > 0
          ? {
              status: "filled",
              filledQty: closed.filledQuantity,
              filledPrice: closed.averageFilledPrice ?? o.price,
              filledAt: o.tradeDate,
            }
          : { status: "expired" },
    });
  }
}

// ② 미반영 체결을 cashKrw에서 차감. stateApplied 마커로 멱등. 한 트랜잭션으로 원자 처리.
async function applyPendingFills(db: PrismaClient, accountId: string): Promise<void> {
  const pending = await db.dcaOrder.findMany({
    where: {
      accountId,
      status: { in: ["simulated_filled", "filled"] },
      OR: [{ stateApplied: false }, { stateApplied: null }],
    },
    orderBy: { tradeDate: "asc" },
  });
  if (pending.length === 0) return;
  const acc = await db.dcaAccount.findUniqueOrThrow({ where: { id: accountId } });
  const nextCash = applyFills(
    acc.cashKrw,
    pending.map((o) => ({ filledQty: o.filledQty, filledPrice: o.filledPrice, fxRate: o.fxRate })),
  );
  await db.$transaction([
    db.dcaAccount.update({
      where: { id: accountId },
      data: { cashKrw: { decrement: acc.cashKrw - nextCash } },
    }),
    ...pending.map((o) =>
      db.dcaOrder.update({ where: { id: o.id }, data: { stateApplied: true } }),
    ),
  ]);
}

export async function runDca(
  db: PrismaClient,
  deps: DcaRunDeps,
  accountId: string,
  tradeDate: string,
  killed: boolean,
): Promise<DcaRunResult> {
  const none: DcaRunResult = {
    placed: 0,
    simulated: 0,
    symbol: null,
    drawdownPct: null,
    accrued: false,
    blocked: null,
  };

  let acc = await db.dcaAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (acc.status !== "active") return { ...none, blocked: "not_active" };
  if (acc.lastRunDate === tradeDate) return { ...none, blocked: "already_ran" };
  // killed면 아무것도 하지 않고 즉시 반환 — LIVE 계좌에 시뮬레이션 행을 남기면 실제로
  // 사지 않은 주식이 잔액에서 차감되고(applyPendingFills는 행의 dryRun을 보지 않는다)
  // 보유·평가액 표시와도 어긋난다. lastRunDate를 건드리지 않으므로 킬 스위치가 풀리면
  // 다음 폴에서 그대로 재시도된다.
  if (killed) return { ...none, blocked: "disabled" };

  const block = async (reason: string, accrued: boolean): Promise<DcaRunResult> => {
    await db.dcaAccount.update({ where: { id: accountId }, data: { note: reason } });
    return { ...none, accrued, blocked: reason };
  };

  // ① 체결 정산 — 대상은 계좌 모드가 아니라 "주문 행"의 dryRun으로 갈린다(where절).
  // 계좌의 dryRun으로 분기하면 LIVE → dryRun 전환 후 남아 있던 submitted 행이 어느 정산도
  // 받지 못해 얼어붙으므로 계좌 모드와 무관하게 항상 돌린다. dryRun 주문은 생성 시점에
  // 즉시 체결로 기록되므로 여기서 볼 것이 없다. 실패해도 blocked로 다음 폴에서 재시도된다.
  try {
    await settleLiveOrders(db, deps, acc);
  } catch (e) {
    return block(`체결 동기화 실패: ${msg(e)}`, false);
  }

  // ② 잔액 반영
  try {
    await applyPendingFills(db, acc.id);
  } catch (e) {
    return block(`잔액 반영 실패: ${msg(e)}`, false);
  }

  // ③ 적립 (lastAccrualDate 멱등 — 이후 단계가 보류돼도 재적립되지 않음)
  acc = await db.dcaAccount.findUniqueOrThrow({ where: { id: accountId } });
  const a = accrue({
    cashKrw: acc.cashKrw,
    lastAccrualDate: acc.lastAccrualDate,
    tradeDate,
    dailyAmountKrw: acc.dailyAmountKrw,
  });
  if (a.accrued) {
    acc = await db.dcaAccount.update({
      where: { id: accountId },
      data: { cashKrw: { increment: a.cashKrw - acc.cashKrw }, lastAccrualDate: tradeDate },
    });
  }

  // ④ peak 갱신 (base 종목의 직전 거래일 종가 기준)
  let prev: { date: string; close: number } | null;
  try {
    prev = await deps.getPrevTradeClose(acc.baseSymbol, tradeDate);
  } catch (e) {
    return block(`전일 종가 조회 실패: ${msg(e)}`, a.accrued);
  }
  if (prev == null) return block("전일 종가 미확보 — 재시도 대기", a.accrued);

  const newPeak = updatePeak(acc.peakPrice, prev.close);
  if (newPeak !== acc.peakPrice) {
    acc = await db.dcaAccount.update({
      where: { id: accountId },
      data: { peakPrice: newPeak, peakDate: prev.date },
    });
  }

  // ⑤ 종목 선택
  const pick = pickSymbol({
    prevClose: prev.close,
    peak: newPeak,
    thresholdPct: acc.thresholdPct,
    baseSymbol: acc.baseSymbol,
    leverSymbol: acc.leverSymbol,
  });
  const picked = { ...none, symbol: pick.symbol, drawdownPct: pick.drawdownPct, accrued: a.accrued };

  // 같은 거래일 중복 주문 방지 — "지금 실행"이 lastRunDate 가드를 우회하는 경로 대비.
  // note는 지우지 않는다 — 직전 실행이 남긴 "제출 결과 미확인" 같은 경고가 이 경로에서
  // 조용히 사라지면 화면에 그 신호가 아예 남지 않는다.
  const alreadyToday = await db.dcaOrder.count({ where: { accountId, tradeDate } });
  if (alreadyToday > 0) {
    await db.dcaAccount.update({ where: { id: accountId }, data: { lastRunDate: tradeDate } });
    return picked;
  }

  // ⑥ 주문 접수 창 — 금액 기반 주문은 정규장 종료 1시간 전에 마감된다. 창이 닫혔으면 그날은
  // 재시도가 무의미하므로 lastRunDate를 소진시킨다. 정산(①)·적립(③)은 이미 끝났다.
  if (!(await deps.isAmountOrderWindowOpen())) {
    await db.dcaAccount.update({
      where: { id: accountId },
      data: {
        lastRunDate: tradeDate,
        note: "금액 기반 주문 접수 시간(정규장 종료 1시간 전) 경과 — 적립만 반영",
      },
    });
    return picked;
  }

  // ⑦ 주문 금액 계산. 시세는 지정가가 아니라 예상 수량·dryRun 체결가·감사용 참조가로 쓴다.
  let price: number;
  let fx: number;
  try {
    [price, fx] = await Promise.all([deps.getCurrentPrice(pick.symbol), deps.getUsdKrw()]);
  } catch (e) {
    return block(`시세·환율 조회 실패: ${msg(e)}`, a.accrued);
  }
  if (!(price > 0) || !(fx > 0)) return block("시세·환율 비정상 — 재시도 대기", a.accrued);

  const plan = planAmountBuy({ cashKrw: acc.cashKrw, fxRate: fx });
  if (!plan) {
    // 1센트 미만 — 적립만 하고 종료. 잔액은 그대로 이월된다.
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: null },
    });
    return picked;
  }

  const estQty = estimateQuantity(plan.amountUsd, price);
  const orderData = {
    accountId,
    tradeDate,
    symbol: pick.symbol,
    side: "BUY",
    kind: "loc_buy",
    orderType: "MARKET",
    tif: null,
    price, // 지정가가 아니라 주문 시점 참조 시세(감사용)
    quantity: estQty, // 예상 수량 — 실제 수량은 체결 시 토스가 정한다
    amountUsd: plan.amountUsd,
    amountKrw: plan.amountKrw,
    fxRate: fx,
    drawdownPct: pick.drawdownPct,
  };

  // LIVE 예수금 확인은 재확인 카운트보다 먼저 끝낸다 — 재확인과 주문 행 생성 사이에
  // 네트워크 왕복이 끼면 중복 주문 창이 그만큼 다시 넓어진다. 예수금 부족으로 보류할 때
  // 주문 행이 아직 없어야 같은 거래일 안에 재시도가 가능하다는 점도 이 순서에 달려 있다.
  const simulate = acc.dryRun;
  let accountSeq = 0; // LIVE 경로에서만 쓴다
  if (!simulate) {
    accountSeq = acc.accountSeq ?? (await deps.getDefaultAccountSeq());
    let buyingPower: number;
    try {
      buyingPower = await deps.getBuyingPowerUsd(accountSeq);
    } catch (e) {
      return block(`매수가능금액 조회 실패: ${msg(e)}`, a.accrued);
    }
    // fail-closed — 응답 필드 누락·개편으로 NaN이 오면 `NaN < amountUsd`가 false여서
    // 검사 없이 통과해버린다. 비교를 뒤집어 유한하지 않은 값은 항상 막는다.
    if (!(buyingPower >= plan.amountUsd)) {
      const have = Number.isFinite(buyingPower) ? `$${buyingPower.toFixed(2)}` : "확인 불가";
      return block(
        `USD 예수금 부족: 필요 $${plan.amountUsd.toFixed(2)} / 보유 ${have}`,
        a.accrued,
      );
    }
  }

  // 재확인 — 위 alreadyToday 체크 이후 창 확인·시세·환율·예수금 조회(네트워크 왕복) 동안
  // 동시 실행이 끼어들 여지가 있다. 같은 로직을 주문 기록 직전에 한 번 더 태워, 재확인과
  // 주문 행 생성 사이를 로컬 SQLite 쓰기 1회로 좁힌다. (note는 위와 같은 이유로 지우지 않는다)
  const alreadyTodayRecheck = await db.dcaOrder.count({ where: { accountId, tradeDate } });
  if (alreadyTodayRecheck > 0) {
    await db.dcaAccount.update({ where: { id: accountId }, data: { lastRunDate: tradeDate } });
    return picked;
  }

  // ⑧ 기록·제출. killed는 위에서 이미 걸러졌으므로 여기서는 계좌의 dryRun만 본다.
  if (simulate) {
    // 시장가는 즉시 체결되므로 시뮬레이션도 그 자리에서 체결로 적는다. 체결가는 사이징에
    // 쓴 그 시세다.
    await db.dcaOrder.create({
      data: {
        ...orderData,
        dryRun: true,
        status: "simulated_filled",
        clientOrderId: null,
        filledQty: estQty,
        filledPrice: price,
        filledAt: tradeDate,
        stateApplied: null, // 바로 아래 차감이 이 마커를 세운다
        error: null,
      },
    });
    // 같은 실행 안에서 차감까지 끝낸다. 차감액의 권위는 state.ts의 applyFills
    // (filledPrice × filledQty × fxRate)이고 amountKrw와는 센트 절삭 수준의 오차만 난다.
    try {
      await applyPendingFills(db, acc.id);
    } catch (e) {
      // 행은 남아 있으므로 다음 폴의 ②단계가 그대로 이어받아 차감한다.
      return block(`잔액 반영 실패: ${msg(e)}`, a.accrued);
    }
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: null },
    });
    return { ...picked, simulated: 1 };
  }

  // 제출 전에 주문 행을 먼저 만들어 그 행 자체를 뮤텍스로 쓴다. 제출 후에 만들면 왕복
  // 동안 다른 프로세스(워커 ↔ "지금 실행")가 같은 거래일 주문을 또 낼 수 있다.
  // clientOrderId는 그 방어의 2선 — 뮤텍스를 놓친 동시 제출도 토스가 같은 주문으로 합쳐준다.
  const clientOrderId = makeClientOrderId(accountId, tradeDate);
  const row = await db.dcaOrder.create({
    data: { ...orderData, dryRun: false, status: "submitting", clientOrderId, error: null },
  });

  try {
    const r = await deps.submitOrder(
      accountSeq,
      { amountUsd: plan.amountUsd, clientOrderId },
      pick.symbol,
    );
    await db.dcaOrder.update({
      where: { id: row.id },
      data: { status: "submitted", tossOrderId: r.tossOrderId },
    });
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: null },
    });
    return { ...picked, placed: 1 };
  } catch (e) {
    // 실패로 단정하지 않는다 — tossFetch는 모든 호출에 10초 타임아웃을 걸므로 브로커가
    // 접수한 주문의 응답이 늦기만 해도 여기로 온다. failed로 적으면 settleLiveOrders가
    // submitted만 보므로 체결분이 영구히 cashKrw에서 차감되지 않는다. 사람이 확인해야
    // 하는 상태로 남기고 lastRunDate는 갱신한다 — 자동 재시도가 진짜 이중 매수를 만든다.
    await db.dcaOrder.update({
      where: { id: row.id },
      data: { status: "submit_unknown", error: msg(e) },
    });
    await db.dcaAccount.update({
      where: { id: accountId },
      data: {
        lastRunDate: tradeDate,
        note: `주문 제출 결과 미확인 — 토스 앱에서 체결 여부를 직접 확인하세요: ${msg(e)}`,
      },
    });
    return picked;
  }
}
