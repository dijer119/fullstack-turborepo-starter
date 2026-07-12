// V4.0 하루 실행 오케스트레이터. 순서 불변식: 상태 갱신(체결 반영)은 항상 주문 계산보다 먼저.
//   ① sync(LIVE: 토스 대조 / dryRun: 일봉 가상 체결) → ② apply(T·잔금)
//   → ③ 포지션·크로스체크 → ④ computeDailyOrdersV4 → ⑤ 제출/기록
// blocked 시 lastRunDate를 갱신하지 않아 다음 15분 폴에서 자동 재시도된다.
import type { PrismaClient } from "@prisma-clients/company-map";
import type { TossOrder } from "@/lib/toss/client";
import type { RunDeps } from "./run";
import { computeDailyOrdersV4 } from "./strategy-v4";
import { judgeDryFill, type DryCandle } from "./dry-fill";
import {
  syncFillsFromToss, applyPendingFillsV4, loadFillEvents,
  derivePositionFromFills, crossCheckHolding,
} from "./sync";
import { assertSubmittable } from "./toss-adapter";
import type { IntendedOrder } from "./strategy";

export interface V4RunDeps extends RunDeps {
  getClosedOrders(accountSeq: number, symbol: string, from: string): Promise<TossOrder[]>;
  getDailyCandle(symbol: string, date: string): Promise<DryCandle | null>;
}

export interface V4RunResult {
  placed: number;
  simulated: number;
  blocked: string | null;
  exhausted: boolean;
  completed: boolean;
}

// dryRun: 과거 거래일의 simulated 주문을 그 날 일봉으로 판정.
// 체결 → simulated_filled(+filledQty/Price/At), 미체결 → expired (재판정 방지).
async function simulateDryFills(
  db: PrismaClient,
  deps: V4RunDeps,
  cycle: { id: string; symbol: string },
  tradeDate: string,
): Promise<void> {
  const pending = await db.infiniteBuyOrder.findMany({
    where: { cycleId: cycle.id, dryRun: true, status: "simulated", tradeDate: { lt: tradeDate } },
    orderBy: { tradeDate: "asc" },
  });
  const candles = new Map<string, DryCandle | null>();
  for (const o of pending) {
    if (!candles.has(o.tradeDate)) {
      candles.set(o.tradeDate, await deps.getDailyCandle(cycle.symbol, o.tradeDate));
    }
    const candle = candles.get(o.tradeDate);
    if (!candle) continue; // 일봉 미확보(휴장/조회실패) — 다음 폴에서 재시도
    const r = judgeDryFill(
      { side: o.side as "BUY" | "SELL", orderType: o.orderType, tif: o.tif, price: o.price },
      candle,
    );
    await db.infiniteBuyOrder.update({
      where: { id: o.id },
      data: r.filled
        ? { status: "simulated_filled", filledQty: o.quantity, filledPrice: r.fillPrice, filledAt: o.tradeDate }
        : { status: "expired" },
    });
  }
}

export async function runV4(
  db: PrismaClient,
  deps: V4RunDeps,
  cycleId: string,
  tradeDate: string,
  killed: boolean,
): Promise<V4RunResult> {
  const result: V4RunResult = { placed: 0, simulated: 0, blocked: null, exhausted: false, completed: false };
  const block = async (reason: string): Promise<V4RunResult> => {
    await db.infiniteBuyCycle.update({ where: { id: cycleId }, data: { note: reason } });
    return { ...result, blocked: reason };
  };

  const c0 = await db.infiniteBuyCycle.findUnique({ where: { id: cycleId } });
  if (!c0) return { ...result, blocked: "사이클 없음" };
  if (c0.starBase == null || c0.tValue == null || c0.cashRemaining == null) {
    return block("v4 상태 미초기화 (tValue/cashRemaining/starBase)");
  }

  // ① sync
  try {
    if (c0.dryRun) {
      await simulateDryFills(db, deps, c0, tradeDate);
    } else {
      const accountSeq = c0.accountSeq ?? (await deps.getDefaultAccountSeq());
      void accountSeq; // syncFillsFromToss가 내부에서 재조회
      await syncFillsFromToss(db, cycleId, deps);
    }
  } catch (e) {
    return block(`체결 동기화 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ② apply — T·잔금 갱신
  const { t, cash } = await applyPendingFillsV4(db, cycleId);

  // ③ 포지션 + 크로스체크
  const fills = await loadFillEvents(db, cycleId);
  let avgPrice: number | null;
  let holdingQty: number;
  let currentPrice: number;
  if (c0.dryRun) {
    ({ avgPrice, holdingQty } = derivePositionFromFills(fills));
    currentPrice = await deps.getCurrentPrice(c0.symbol);
  } else {
    const accountSeq = c0.accountSeq ?? (await deps.getDefaultAccountSeq());
    const h = await deps.getHoldingForSymbol(accountSeq, c0.symbol);
    avgPrice = h?.avgPrice ?? null;
    holdingQty = h?.quantity ?? 0;
    currentPrice = h?.currentPrice ?? (await deps.getCurrentPrice(c0.symbol));
    const check = crossCheckHolding(fills, holdingQty);
    if (!check.ok) {
      return block(`정합성 불일치: 체결합 ${check.expected} ≠ 실보유 ${holdingQty} — 수동 확인 필요`);
    }
  }

  // 사이클 완료: 전량 매도됨
  if (t > 0 && holdingQty <= 0) {
    await db.infiniteBuyCycle.update({
      where: { id: cycleId },
      data: { status: "completed", lastRunDate: tradeDate, note: "보유 0 — 사이클 종료(재시작은 새 사이클 생성)" },
    });
    return { ...result, completed: true };
  }

  // ④ compute
  const plan = computeDailyOrdersV4({
    t, splits: c0.splits, cash, starBase: c0.starBase, bigBuyPremium: c0.bigBuyPremium,
    avgPrice, currentPrice, holdingQty,
  });
  if (plan.exhausted) {
    await db.infiniteBuyCycle.update({
      where: { id: cycleId },
      data: { status: "exhausted", lastRunDate: tradeDate, note: `소진 도달(T=${t.toFixed(2)}) — 소진모드 미구현, 수동 판단 필요` },
    });
    return { ...result, exhausted: true };
  }
  if (plan.blocked) return block(plan.blocked);

  // ⑤ submit / 기록 (run.ts와 동일한 관행)
  const simulate = c0.dryRun || killed;
  let buyingPower = 0;
  if (!simulate && plan.orders.some((o) => o.side === "BUY")) {
    const accountSeq = c0.accountSeq ?? (await deps.getDefaultAccountSeq());
    buyingPower = await deps.getBuyingPowerUsd(accountSeq);
  }
  for (const o of plan.orders) {
    const base = {
      cycleId, tradeDate, round: Math.floor(t), side: o.side, kind: o.kind,
      orderType: o.orderType, tif: o.tif, price: o.price, quantity: o.quantity,
      avgCost: o.side === "SELL" ? avgPrice : null,
      tossOrderId: null as string | null, dryRun: c0.dryRun,
    };
    if (o.side === "BUY" && !simulate) {
      const est = o.price * o.quantity;
      if (est > buyingPower) {
        await db.infiniteBuyOrder.create({ data: { ...base, status: "skipped", error: "insufficient buying power" } });
        continue;
      }
      buyingPower -= est;
    }
    if (simulate) {
      await db.infiniteBuyOrder.create({ data: { ...base, status: "simulated", error: null } });
      result.simulated++;
      continue;
    }
    try {
      const intended: IntendedOrder = {
        side: o.side, kind: "loc_avg", orderType: o.orderType, tif: o.tif, price: o.price, quantity: o.quantity,
      };
      assertSubmittable(intended);
      const accountSeq = c0.accountSeq ?? (await deps.getDefaultAccountSeq());
      const { tossOrderId } = await deps.submitOrder(accountSeq, intended, c0.symbol);
      await db.infiniteBuyOrder.create({ data: { ...base, tossOrderId, status: "submitted", error: null } });
      result.placed++;
    } catch (e) {
      await db.infiniteBuyOrder.create({
        data: { ...base, status: "failed", error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  await db.infiniteBuyCycle.update({ where: { id: cycleId }, data: { lastRunDate: tradeDate, note: null } });
  return result;
}
