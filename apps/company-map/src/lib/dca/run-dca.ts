// QQQ·QLD 적립식 오케스트레이터. 순서 불변식:
//   ① 체결 정산(dryRun: 일봉 판정 / LIVE: 토스 대조) → ② 잔액 반영 → ③ 적립
//   → ④ peak 갱신 → ⑤ 종목 선택 → ⑥ 주문 계산 → ⑦ 기록·제출
// blocked 시 lastRunDate를 갱신하지 않아 다음 폴에서 자동 재시도된다 (run-vr.ts와 동일 패턴).
// 적립은 lastAccrualDate로 별도 멱등을 보장하므로 재시도 시에도 중복되지 않는다.
import type { PrismaClient } from "@prisma-clients/company-map";
import { judgeDryFill, type DryCandle } from "@/lib/infinite-buy/dry-fill";
import { pickSymbol, updatePeak } from "./peak";
import { planBuy } from "./sizing";
import { accrue, applyFills } from "./state";

export interface DcaClosedOrder {
  orderId: string;
  filledQuantity: number;
  averageFilledPrice: number | null;
}

export interface DcaRunDeps {
  getDefaultAccountSeq(): Promise<number>;
  getDailyCandle(symbol: string, date: string): Promise<DryCandle | null>;
  getPrevTradeClose(symbol: string, before: string): Promise<{ date: string; close: number } | null>;
  getCurrentPrice(symbol: string): Promise<number>;
  getUsdKrw(): Promise<number>;
  getBuyingPowerUsd(accountSeq: number): Promise<number>;
  getClosedOrders(accountSeq: number, symbol: string, from: string): Promise<DcaClosedOrder[]>;
  submitOrder(
    accountSeq: number,
    o: { price: number; quantity: number },
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

// ① dryRun — 과거 거래일의 simulated 주문을 그 날 일봉으로 판정.
async function settleDryOrders(
  db: PrismaClient,
  deps: DcaRunDeps,
  accountId: string,
  tradeDate: string,
): Promise<void> {
  const pending = await db.dcaOrder.findMany({
    where: { accountId, dryRun: true, status: "simulated", tradeDate: { lt: tradeDate } },
    orderBy: { tradeDate: "asc" },
  });
  const cache = new Map<string, DryCandle | null>();
  for (const o of pending) {
    const key = `${o.symbol}:${o.tradeDate}`;
    if (!cache.has(key)) cache.set(key, await deps.getDailyCandle(o.symbol, o.tradeDate));
    const candle = cache.get(key);
    if (!candle) continue; // 일봉 미확보 — 다음 폴에서 재시도
    const r = judgeDryFill(
      { side: "BUY", orderType: o.orderType, tif: o.tif, price: o.price },
      candle,
    );
    await db.dcaOrder.update({
      where: { id: o.id },
      data: r.filled
        ? {
            status: "simulated_filled",
            filledQty: o.quantity,
            filledPrice: r.fillPrice,
            filledAt: o.tradeDate,
          }
        : { status: "expired" },
    });
  }
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
    db.dcaAccount.update({ where: { id: accountId }, data: { cashKrw: nextCash } }),
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

  const block = async (reason: string, accrued: boolean): Promise<DcaRunResult> => {
    await db.dcaAccount.update({ where: { id: accountId }, data: { note: reason } });
    return { ...none, accrued, blocked: reason };
  };

  // ① 체결 정산
  try {
    if (acc.dryRun) await settleDryOrders(db, deps, acc.id, tradeDate);
    else await settleLiveOrders(db, deps, acc);
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
      data: { cashKrw: a.cashKrw, lastAccrualDate: tradeDate },
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
  const alreadyToday = await db.dcaOrder.count({ where: { accountId, tradeDate } });
  if (alreadyToday > 0) {
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: null },
    });
    return picked;
  }

  // ⑥ 주문 계산
  let price: number;
  let fx: number;
  try {
    [price, fx] = await Promise.all([deps.getCurrentPrice(pick.symbol), deps.getUsdKrw()]);
  } catch (e) {
    return block(`시세·환율 조회 실패: ${msg(e)}`, a.accrued);
  }
  if (!(price > 0) || !(fx > 0)) return block("시세·환율 비정상 — 재시도 대기", a.accrued);

  const plan = planBuy({
    cashKrw: acc.cashKrw,
    fxRate: fx,
    price,
    premiumPct: acc.premiumPct,
  });
  if (!plan) {
    // 1주 미만 — 적립만 하고 종료. 잔액은 그대로 이월된다.
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: null },
    });
    return picked;
  }

  const orderData = {
    accountId,
    tradeDate,
    symbol: pick.symbol,
    side: "BUY",
    kind: "loc_buy",
    orderType: "LIMIT",
    tif: "CLS",
    price: plan.price,
    quantity: plan.quantity,
    amountKrw: plan.estKrw,
    fxRate: fx,
    drawdownPct: pick.drawdownPct,
  };

  // ⑦ 기록·제출. killed면 LIVE 계좌도 시뮬레이션으로 기록한다 —
  //    dryRun: true로 남겨야 settleDryOrders가 나중에 판정해 상태가 고아로 남지 않는다.
  const simulate = acc.dryRun || killed;
  if (simulate) {
    await db.dcaOrder.create({
      data: {
        ...orderData,
        dryRun: true,
        status: "simulated",
        error: killed && !acc.dryRun ? "DCA_DISABLED — 실주문 대신 시뮬레이션" : null,
      },
    });
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: null },
    });
    return { ...picked, simulated: 1 };
  }

  const accountSeq = acc.accountSeq ?? (await deps.getDefaultAccountSeq());
  let buyingPower: number;
  try {
    buyingPower = await deps.getBuyingPowerUsd(accountSeq);
  } catch (e) {
    return block(`매수가능금액 조회 실패: ${msg(e)}`, a.accrued);
  }
  if (buyingPower < plan.estUsd) {
    return block(
      `USD 예수금 부족: 필요 $${plan.estUsd.toFixed(2)} / 보유 $${buyingPower.toFixed(2)}`,
      a.accrued,
    );
  }

  try {
    const r = await deps.submitOrder(
      accountSeq,
      { price: plan.price, quantity: plan.quantity },
      pick.symbol,
    );
    await db.dcaOrder.create({
      data: { ...orderData, tossOrderId: r.tossOrderId, dryRun: false, status: "submitted" },
    });
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: null },
    });
    return { ...picked, placed: 1 };
  } catch (e) {
    await db.dcaOrder.create({
      data: { ...orderData, dryRun: false, status: "failed", error: msg(e) },
    });
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: `주문 제출 실패: ${msg(e)}` },
    });
    return picked;
  }
}
