// QQQ·QLD 적립식 오케스트레이터. 순서 불변식:
//   ① LIVE 체결 정산(토스 대조) → ② 잔액 반영 → ③ 적립 → ④ peak 갱신 → ⑤ 종목 선택
//   → ⑤' 이전 거래일 미해결 주문 가드 → ⑥ 주문 접수 창 확인 → ⑦ 주문 금액 계산 → ⑧ 기록·제출
// ①·②(장부 따라잡기)는 status·killed 검사보다 **앞**에 있다. 주문을 내는 ⑥~⑧은 뒤에 있다.
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

/**
 * 주문이 생기지 않은 이유. blocked(보류·재시도 대기)와 달리 **정상 종료** 경로를 구분한다.
 * 호출자가 계좌 note를 되읽어 사유를 추측하지 않아도 되도록 결과에 실어 보낸다.
 *   - window_closed: 금액 기반 주문 접수 시간(정규장 종료 1시간 전) 경과.
 *     사전 확인(⑥)뿐 아니라 제출이 422로 거절된 경우도 여기로 온다.
 *   - below_min_amount: 잔액 환산액이 1센트 미만
 *   - already_ordered: 같은 거래일 주문이 이미 존재
 *   - rejected: 브로커가 확실히 거절 — 주문이 생성되지 않았고 잔액도 정확하다(사람 확인 불필요)
 *   - submit_unknown: 제출했으나 결과 미확인 (주문 행은 남아 있고 사람이 확인해야 함)
 */
export type DcaNoOrderReason =
  | "window_closed"
  | "below_min_amount"
  | "already_ordered"
  | "rejected"
  | "submit_unknown";

export interface DcaRunResult {
  /** LIVE 실제 제출 건수 */
  placed: number;
  /** dryRun 기록 건수 */
  simulated: number;
  symbol: string | null;
  drawdownPct: number | null;
  accrued: boolean;
  blocked: string | null;
  /** placed·simulated가 0인 정상 종료의 사유. 주문이 났으면 null. */
  noOrderReason: DcaNoOrderReason | null;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * 제출 결과를 사람이 닫아야만 풀리는 상태들. 이 상태의 행이 **이전 거래일에** 남아 있으면
 * 그 주문이 체결됐는지 알 수 없고, 체결됐다면 cashKrw가 아직 차감되지 않았다는 뜻이다.
 * settleLiveOrders는 `submitted`만 보고 CLOSED 목록에서 못 찾으면 그냥 넘어가므로,
 * 세 상태 모두 "그날 안에는 자동으로 해소되지 않는다".
 */
const UNRESOLVED_STATUSES = ["submitting", "submitted", "submit_unknown"] as const;

/**
 * 제출 예외를 "확실한 거절"과 "결과 미확인"으로 가른다.
 *
 * tossFetch가 모든 호출에 10초 타임아웃을 걸기 때문에 예외가 곧 실패는 아니다 — 브로커가
 * 접수한 주문의 응답이 늦기만 해도 예외로 온다. 그래서 기본값은 보수적인 submit_unknown이다.
 * 다만 토스가 HTTP 400/422로 되돌려준 응답은 "주문이 만들어지지 않았음"이 확정이다
 * (400 = 요청 자체가 유효하지 않음: invalid-request·금액 최소/최대 위반 등,
 *  422 = 처리 불가: 대표적으로 amount-order-outside-regular-hours). 이때는 cashKrw가
 * 정확하고 사람이 브로커에서 확인할 것이 없다. 이것까지 submit_unknown으로 적으면
 * 거래정지 종목 같은 결정적 400이 매 거래일 "브로커를 확인하라" 경고를 만들고,
 * 이전 거래일 미해결 가드에 걸려 있지도 않은 주문 때문에 매일 주문이 막힌다.
 * 그 밖의 상태(타임아웃·401·403·5xx·429 등)는 주문이 생겼을 수 있으므로 미확인으로 남긴다.
 *
 * TossApiError를 값으로 import하지 않고 형태로 판별한다 — run-dca는 DcaRunDeps 뒤에서
 * 브로커 구현을 모르는 순수 오케스트레이터이고, client.ts는 import만으로 undici Agent를
 * 만드는 모듈이라 테스트 모듈 그래프에 끌어들이지 않는 편이 낫다.
 */
export type DcaSubmitFailure =
  | { definite: true; window: boolean; reason: string }
  | { definite: false };

export function classifySubmitFailure(e: unknown): DcaSubmitFailure {
  if (!(e instanceof Error) || e.name !== "TossApiError") return { definite: false };
  const { status, code } = e as Error & { status?: unknown; code?: unknown };
  if (status !== 400 && status !== 422) return { definite: false };
  const codeText = typeof code === "string" && code ? code : null;
  return {
    definite: true,
    window: codeText === "amount-order-outside-regular-hours",
    reason: `${e.message}${codeText ? ` (${codeText})` : ""}`,
  };
}

/**
 * 토스 멱등성 키. 같은 계좌·같은 거래일이면 **항상 같은 값**이어야 한다 — 워커와 "지금 실행"이
 * 서로 다른 프로세스에서 동시에 제출해도 토스가 10분 안에는 앞선 주문 결과를 그대로 되돌려주므로,
 * 이 안정성이 곧 중복 실주문 방어다. 결과는 항상 36자 이하이고 [A-Za-z0-9-_]만 쓴다.
 * 계좌 id는 하이픈을 걷어낸 앞 16자(64비트)를 쓴다 — 8자(32비트)면 충돌 확률이 무시할 수준은
 * 아닌데, 충돌하면 다른 계좌의 주문 결과가 그대로 돌아와 사지도 않은 매수가 차감된다.
 * 결과는 항상 29자 이하라 토스의 36자 상한 안에 든다.
 * 예: ("a1b2c3d4-e5f6-7890-…", "2026-08-28") → "dca-a1b2c3d4e5f67890-20260828"
 */
export function makeClientOrderId(accountId: string, tradeDate: string): string {
  return `dca-${accountId.replace(/-/g, "").slice(0, 16)}-${tradeDate.replace(/-/g, "")}`;
}

// ① LIVE — 제출된 주문을 토스 CLOSED 목록과 대조해 체결/만료 확정.
// 대상은 status: "submitted"뿐이다. submitting·submit_unknown은 tossOrderId를 모르거나
// 없어서 대조할 수 없고, CLOSED에서 못 찾은 submitted도 그냥 넘어간다 — 그렇게 남는 행은
// runDca의 ⑤' 가드가 "이전 거래일 미해결"로 잡아 신규 주문을 막는다.
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

  // 브로커 주문 하나는 주문 행 하나만 정산할 수 있다. clientOrderId 멱등성 때문에 뮤텍스를
  // 놓친 동시 제출 두 건이 토스에서 **같은 tossOrderId**로 합쳐질 수 있는데, 그대로 두면 두
  // 행이 같은 체결에 각각 매칭돼 한 번의 매수가 두 번 차감된다. 이미 소비된 주문번호는 두
  // 번째 행에 내주지 않는다. 앞선 폴에서 정산이 끝난 행이 물고 있는 번호까지 미리 담아,
  // 두 행이 서로 다른 폴에 걸쳐 정산되는 경우도 막는다.
  const settled = await db.dcaOrder.findMany({
    where: { accountId: account.id, dryRun: false, status: "filled" },
    select: { tossOrderId: true },
  });
  const consumed = new Set(
    settled.map((o) => o.tossOrderId).filter((id): id is string => id != null),
  );

  const cache = new Map<string, DcaClosedOrder[]>();
  for (const o of pending) {
    if (!cache.has(o.symbol)) {
      cache.set(o.symbol, await deps.getClosedOrders(accountSeq, o.symbol, from));
    }
    const closed = cache.get(o.symbol)!.find((c) => c.orderId === o.tossOrderId);
    if (!closed) continue; // 아직 CLOSED 아님 — 다음 폴에서 재시도
    if (o.tossOrderId != null && consumed.has(o.tossOrderId)) {
      // 앞선 행이 이 체결을 이미 가져갔다 — 중복 제출이 합쳐진 행이므로 차감 없이 닫는다.
      await db.dcaOrder.update({
        where: { id: o.id },
        data: {
          status: "expired",
          error: "중복 제출이 같은 브로커 주문으로 합쳐짐 (clientOrderId 멱등) — 차감 제외",
        },
      });
      continue;
    }
    if (closed.filledQuantity > 0) {
      if (o.tossOrderId != null) consumed.add(o.tossOrderId);
      await db.dcaOrder.update({
        where: { id: o.id },
        data: {
          status: "filled",
          filledQty: closed.filledQuantity,
          filledPrice: closed.averageFilledPrice ?? o.price,
          filledAt: o.tradeDate,
        },
      });
    } else {
      // 취소·거부는 차감이 없으므로 주문번호를 소비하지 않는다.
      await db.dcaOrder.update({ where: { id: o.id }, data: { status: "expired" } });
    }
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
  // applyFills가 건너뛸 행에는 stateApplied를 세우지 않는다. 세워버리면 차감 없이 "반영 완료"로
  // 굳어 그 금액이 영구히 잔액에서 누락되고 재시도 기회도 사라진다(조용한 자금 어긋남).
  // 보류로 남겨 두면 값이 채워지는 순간 다음 폴이 그대로 처리한다.
  // 조건은 state.ts의 applyFills가 건너뛰는 조건과 일치해야 한다.
  const applicable = pending.filter(
    (o) =>
      o.filledQty != null &&
      o.filledPrice != null &&
      Number.isFinite(o.filledQty) &&
      Number.isFinite(o.filledPrice) &&
      Number.isFinite(o.fxRate) &&
      o.fxRate > 0,
  );
  if (applicable.length === 0) return;

  // 위 조회 → 계좌 조회 → 쓰기 사이에 다른 실행(워커 ↔ "지금 실행")이 끼면 같은 체결이
  // 두 번 차감된다. 마커를 **조건부 updateMany**로 먼저 세우고 실제로 세워진 행(count === 1)만
  // 차감해, 뒤늦게 들어온 실행의 쓰기가 무동작이 되게 한다. 청구(마커)와 차감을 한
  // 인터랙티브 트랜잭션에 묶어 두므로, 차감이 실패하면 마커도 함께 롤백된다 — 마커만 남으면
  // 그 금액이 영구히 잔액에서 누락된다(조용한 자금 어긋남).
  await db.$transaction(async (tx) => {
    const claimed: typeof applicable = [];
    for (const o of applicable) {
      const r = await tx.dcaOrder.updateMany({
        where: { id: o.id, OR: [{ stateApplied: false }, { stateApplied: null }] },
        data: { stateApplied: true },
      });
      if (r.count === 1) claimed.push(o);
    }
    if (claimed.length === 0) return;

    const acc = await tx.dcaAccount.findUniqueOrThrow({ where: { id: accountId } });
    const nextCash = applyFills(
      acc.cashKrw,
      claimed.map((o) => ({
        filledQty: o.filledQty,
        filledPrice: o.filledPrice,
        fxRate: o.fxRate,
      })),
    );
    await tx.dcaAccount.update({
      where: { id: accountId },
      data: { cashKrw: { decrement: acc.cashKrw - nextCash } },
    });
  });
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
    noOrderReason: null,
  };

  const block = async (reason: string, accrued: boolean): Promise<DcaRunResult> => {
    await db.dcaAccount.update({ where: { id: accountId }, data: { note: reason } });
    return { ...none, accrued, blocked: reason };
  };

  let acc = await db.dcaAccount.findUniqueOrThrow({ where: { id: accountId } });

  // ①·②는 **장부 따라잡기**이지 거래가 아니다. 계좌 상태·킬 스위치 검사보다 앞에 둔다 —
  // 뒤에 두면 체결이 submitted로 떠 있는 채 계좌를 일시정지하고 설정 폼에서 cashKrw를 손으로
  // 보정한 뒤 재개하는 순간, 정산이 그 체결을 한 번 더 차감한다(폼 라벨이 그 보정을 권한다).
  // 킬 스위치는 '주문'을 멈추는 장치지 장부를 멈추는 장치가 아니다. 주문 경로는 아래
  // status·killed 검사 뒤에 그대로 있으므로 멈춘 계좌에 주문이 나갈 일은 없다.
  // (한계: 워커 루프는 status: "active" 계좌만 폴하므로 일시정지 상태의 자동 정산은
  //  "지금 실행"에서만 일어난다. 킬 스위치 경로는 워커에서도 그대로 정산된다.)

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

  if (acc.status !== "active") return { ...none, blocked: "not_active" };
  if (acc.lastRunDate === tradeDate) return { ...none, blocked: "already_ran" };
  // killed면 적립·주문 어느 것도 하지 않고 즉시 반환 — LIVE 계좌에 시뮬레이션 행을 남기면
  // 실제로 사지 않은 주식이 잔액에서 차감되고(applyPendingFills는 행의 dryRun을 보지 않는다)
  // 보유·평가액 표시와도 어긋난다. lastRunDate를 건드리지 않으므로 킬 스위치가 풀리면
  // 다음 폴에서 그대로 재시도된다.
  if (killed) return { ...none, blocked: "disabled" };

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

  // 이전 거래일의 미해결 LIVE 주문 가드. 세 멱등 가드(lastAccrualDate·stateApplied·당일 주문
  // 수)는 전부 "그 거래일 안"에서만 작동해, 어제 제출 결과를 모르는 주문이 남아 있어도 오늘
  // 주문은 그대로 나간다. 그 주문이 실제로 체결됐다면 cashKrw가 아직 차감되지 않은 상태라
  // 오늘 주문이 이틀치 잔액으로 나간다(1회분 과매수 — 그 행이 정산되면 잔액은 다시 수렴한다).
  // 적립·peak 갱신은 위에서 이미 끝났으므로 여기서 막는 것은 '주문'뿐이다. block(...)이라
  // lastRunDate를 소진하지 않고, note를 매 폴마다 다시 세운다 — 장부와 브로커가 어긋났다는
  // 유일한 화면 신호인 그 note가 다음 성공·창닫힘 실행에 지워지지 않게 하는 효과도 있다.
  const unresolved = await db.dcaOrder.findMany({
    where: {
      accountId,
      dryRun: false,
      tradeDate: { lt: tradeDate },
      status: { in: [...UNRESOLVED_STATUSES] },
    },
    orderBy: { tradeDate: "asc" },
  });
  if (unresolved.length > 0) {
    const head = unresolved[0];
    const more = unresolved.length > 1 ? ` 외 ${unresolved.length - 1}건` : "";
    return block(
      `이전 거래일 주문 미해결(${head.tradeDate} ${head.status})${more} — 토스 앱에서 체결 여부를 ` +
        `확인하고 cashKrw를 보정한 뒤 해당 주문 상태를 정리하세요. 그때까지 신규 주문을 막습니다`,
      a.accrued,
    );
  }

  // 같은 거래일 중복 주문 방지 — "지금 실행"이 lastRunDate 가드를 우회하는 경로 대비.
  // note는 지우지 않는다 — 직전 실행이 남긴 "제출 결과 미확인" 같은 경고가 이 경로에서
  // 조용히 사라지면 화면에 그 신호가 아예 남지 않는다.
  const alreadyToday = await db.dcaOrder.count({ where: { accountId, tradeDate } });
  if (alreadyToday > 0) {
    await db.dcaAccount.update({ where: { id: accountId }, data: { lastRunDate: tradeDate } });
    return { ...picked, noOrderReason: "already_ordered" };
  }

  // ⑥ 주문 접수 창 — 금액 기반 주문은 정규장 종료 1시간 전에 마감된다.
  // "창이 닫혔다"와 "확인하지 못했다"를 반드시 구분한다. 전자는 그날 재시도가 무의미하므로
  // lastRunDate를 소진시키지만, 후자까지 소진시키면 캘린더 조회 실패 한 번이 그날 매수를
  // 통째로 날리고 이후 폴은 already_ran으로 막혀버린다(토스 토큰은 활성 1개뿐이라 일시적
  // 조회 실패는 이 코드베이스의 알려진 모드다). 조회 실패는 block으로 넘겨 재시도를 남긴다.
  let windowOpen: boolean;
  try {
    windowOpen = await deps.isAmountOrderWindowOpen();
  } catch (e) {
    return block(`주문 접수 창 확인 실패 — 재시도 대기: ${msg(e)}`, a.accrued);
  }
  if (!windowOpen) {
    await db.dcaAccount.update({
      where: { id: accountId },
      data: {
        lastRunDate: tradeDate,
        note: "금액 기반 주문 접수 시간(정규장 종료 1시간 전) 경과 — 적립만 반영",
      },
    });
    return { ...picked, noOrderReason: "window_closed" };
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
    return { ...picked, noOrderReason: "below_min_amount" };
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
    return { ...picked, noOrderReason: "already_ordered" };
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
    // 확실한 거절(HTTP 400/422)은 미확인과 자금 함의가 정반대다 — 주문이 생성되지 않았고
    // cashKrw도 정확하므로 사람이 확인할 것이 없다. rejected는 settleLiveOrders(submitted만
    // 조회)의 대상도, 이전 거래일 미해결 가드(UNRESOLVED_STATUSES)의 대상도 아니다.
    const c = classifySubmitFailure(e);
    if (c.definite) {
      await db.dcaOrder.update({
        where: { id: row.id },
        data: { status: "rejected", error: c.reason },
      });
      await db.dcaAccount.update({
        where: { id: accountId },
        data: {
          lastRunDate: tradeDate,
          note: c.window
            ? `금액 기반 주문 접수 시간 경과로 브로커가 거절 — 적립만 반영: ${c.reason}`
            : `브로커가 주문을 거절(주문 미생성, 잔액 영향 없음): ${c.reason}`,
        },
      });
      // 접수 창 경과는 ⑥의 사전 확인과 같은 사건이다 — 호출자 안내도 같은 문구로 맞춘다.
      return { ...picked, noOrderReason: c.window ? "window_closed" : "rejected" };
    }

    // 그 밖의 예외는 실패로 단정하지 않는다 — tossFetch는 모든 호출에 10초 타임아웃을 걸므로
    // 브로커가 접수한 주문의 응답이 늦기만 해도 여기로 온다. failed로 적으면 settleLiveOrders가
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
    return { ...picked, noOrderReason: "submit_unknown" };
  }
}
