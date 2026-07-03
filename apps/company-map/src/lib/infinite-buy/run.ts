import { computeDailyOrders, type CycleState, type IntendedOrder } from "./strategy";

export interface CycleConfig {
  id: string;
  symbol: string;
  accountSeq: number | null;
  principalUsd: number;
  splits: number;
  profitTarget: number;
  bigBuyPremium: number;
  lossCut: number;
  round: number;
  dryRun: boolean;
}

export interface HoldingSnapshot {
  avgPrice: number;
  quantity: number;
  currentPrice: number;
  pnlPct: number; // %
}

export interface RunDeps {
  getDefaultAccountSeq(): Promise<number>;
  getHoldingForSymbol(accountSeq: number, symbol: string): Promise<HoldingSnapshot | null>;
  getCurrentPrice(symbol: string): Promise<number>;
  getBuyingPowerUsd(accountSeq: number): Promise<number>;
  submitOrder(accountSeq: number, o: IntendedOrder, symbol: string): Promise<{ tossOrderId: string }>;
}

export interface OrderLog {
  cycleId: string;
  tradeDate: string;
  round: number;
  side: string;
  kind: string;
  orderType: string;
  tif: string;
  price: number | null;
  quantity: number;
  avgCost: number | null; // SELL 시점 평단(실현손익 계산용)
  tossOrderId: string | null;
  dryRun: boolean;
  status: "submitted" | "failed" | "simulated" | "skipped";
  error: string | null;
}

export interface RunPersistence {
  logOrder(o: OrderLog): Promise<void>;
  updateCycle(id: string, data: { round?: number; lastRunDate?: string; status?: string }): Promise<void>;
}

export interface RunResult {
  placed: number;
  simulated: number;
  skipped: number;
  failed: number;
}

export async function runCycle(
  persist: RunPersistence,
  deps: RunDeps,
  cycle: CycleConfig,
  tradeDate: string,
  killed: boolean,
): Promise<RunResult> {
  const accountSeq = cycle.accountSeq ?? (await deps.getDefaultAccountSeq());
  const holding = await deps.getHoldingForSymbol(accountSeq, cycle.symbol);
  const currentPrice = holding?.currentPrice ?? (await deps.getCurrentPrice(cycle.symbol));

  const state: CycleState = {
    round: cycle.round,
    splits: cycle.splits,
    principalUsd: cycle.principalUsd,
    profitTarget: cycle.profitTarget,
    bigBuyPremium: cycle.bigBuyPremium,
    lossCut: cycle.lossCut,
    avgPrice: holding?.avgPrice ?? null,
    currentPrice,
    holdingQty: holding?.quantity ?? 0,
    pnlPct: holding?.pnlPct ?? null,
  };

  const plan = computeDailyOrders(state);
  const result: RunResult = { placed: 0, simulated: 0, skipped: 0, failed: 0 };
  const simulate = cycle.dryRun || killed;

  let buyingPower = plan.orders.some((o) => o.side === "BUY")
    ? await deps.getBuyingPowerUsd(accountSeq)
    : 0;

  for (const o of plan.orders) {
    const base: OrderLog = {
      cycleId: cycle.id, tradeDate, round: cycle.round, side: o.side, kind: o.kind,
      orderType: o.orderType, tif: o.tif,
      // reset_sell(시장가 매도)은 체결 추정가로 현재가를 남겨 실현손익 계산 가능하게.
      price: o.kind === "reset_sell" ? currentPrice : o.price,
      quantity: o.quantity,
      avgCost: o.side === "SELL" ? state.avgPrice : null,
      tossOrderId: null, dryRun: cycle.dryRun, status: "simulated", error: null,
    };

    // 매수 가용금액 체크 (LIMIT은 price*qty, MARKET은 현재가*qty 근사)
    if (o.side === "BUY") {
      const est = (o.price ?? currentPrice) * o.quantity;
      if (est > buyingPower) {
        await persist.logOrder({ ...base, status: "skipped", error: "insufficient buying power" });
        result.skipped++;
        continue;
      }
      buyingPower -= est;
    }

    if (simulate) {
      await persist.logOrder({ ...base, status: "simulated" });
      result.simulated++;
      continue;
    }

    try {
      const { tossOrderId } = await deps.submitOrder(accountSeq, o, cycle.symbol);
      await persist.logOrder({ ...base, status: "submitted", tossOrderId });
      result.placed++;
    } catch (e) {
      await persist.logOrder({ ...base, status: "failed", error: e instanceof Error ? e.message : String(e) });
      result.failed++;
    }
  }

  // 회차/리셋/거래일 갱신
  const data: { round: number; lastRunDate: string } = {
    round: plan.resetAfter ? 0 : plan.nextRound,
    lastRunDate: tradeDate,
  };
  await persist.updateCycle(cycle.id, data);

  return result;
}
