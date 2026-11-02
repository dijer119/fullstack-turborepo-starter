import { advanceSimulation, initialState, roundMoney, type SplitConfig } from "./engine";
import { lotTotals } from "./live-rules";

export type ProfitMode = "live" | "simulation";
export interface ProfitRecord {
  id: string;
  strategyId: string;
  name: string;
  symbol: string;
  market: string;
  mode: ProfitMode;
  date: string | null;
  quantity: number;
  cost: number;
  proceeds: number;
  pnl: number;
}
interface Strategy { id: string; name: string; symbol: string; market: string }
interface Sale { id: string; createdAt: Date; filledQty: number; filledAmount: number; commission: number; tax: number }
interface LiveProfitLot {
  id: string; slot: number; generation: number; boughtQty: number; boughtAmount: number; buyFees: number; buyTax: number;
  soldQty: number; soldAmount: number; sellFees: number; sellTax: number;
  strategy: Strategy; orders: Sale[];
}
export function koreanDate(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function liveProfitEntries(lots: LiveProfitLot[]): ProfitRecord[] {
  return lots.flatMap<ProfitRecord>(lot => {
    const totals = lotTotals(lot);
    if (!lot.soldQty && !lot.soldAmount && !lot.sellFees && !lot.sellTax) return [];
    const base = { strategyId: lot.strategy.id, name: lot.strategy.name, symbol: lot.strategy.symbol, market: lot.strategy.market, mode: "live" as const };
    const orders = lot.orders;
    const total = orders.reduce((s, o) => ({ qty: s.qty + o.filledQty, amount: roundMoney(s.amount + o.filledAmount), fees: roundMoney(s.fees + o.commission), tax: roundMoney(s.tax + o.tax) }), { qty: 0, amount: 0, fees: 0, tax: 0 });
    if (total.qty !== lot.soldQty || total.amount !== lot.soldAmount || total.fees !== lot.sellFees || total.tax !== lot.sellTax) {
      return [{ ...base, id: lot.id, date: null, quantity: lot.soldQty, cost: roundMoney(totals.cost - totals.remainingCost), proceeds: roundMoney(lot.soldAmount - lot.sellFees - lot.sellTax), pnl: totals.realizedPnl }];
    }
    let sold = 0;
    let allocatedCost = 0;
    return orders.filter(o => o.filledQty || o.filledAmount || o.commission || o.tax).map(order => {
      sold += order.filledQty;
      // Allocate cumulative rounded cost so partial sales reconcile to the lot ledger exactly.
      const cumulativeCost = lot.boughtQty ? roundMoney(totals.cost - roundMoney(totals.cost * (lot.boughtQty - sold) / lot.boughtQty)) : 0;
      const cost = roundMoney(cumulativeCost - allocatedCost);
      allocatedCost = cumulativeCost;
      const proceeds = roundMoney(order.filledAmount - order.commission - order.tax);
      return { ...base, id: order.id, date: koreanDate(order.createdAt), quantity: order.filledQty, cost, proceeds, pnl: roundMoney(proceeds - cost) };
    });
  });
}
interface SimulationProfit extends Strategy {
  config: SplitConfig;
  stepCount: number;
  lots: { id: string; closedStep: number | null; quantity: number; buyCost: number; realizedPnl: number }[];
  runs: { inputJson: string; createdAt: Date }[];
}
export function simulationProfitEntries(simulations: SimulationProfit[]): ProfitRecord[] {
  return simulations.flatMap(simulation => {
    const ranges: { startStep: number; endStep: number; date: string }[] = [];
    let validHistory = true;
    try {
      let replay = initialState(simulation.config);
      for (const run of simulation.runs) {
        const startStep = replay.stepCount + 1;
        const { prices } = JSON.parse(run.inputJson) as { prices: unknown };
        if (!Array.isArray(prices) || !prices.length) throw new Error("실행 가격 이력 누락");
        for (const price of prices) replay = advanceSimulation(simulation.config, replay, price);
        ranges.push({ startStep, endStep: replay.stepCount, date: koreanDate(run.createdAt) });
      }
      const signature = (lots: SimulationProfit["lots"] | typeof replay.lots) => JSON.stringify(lots.map(l => [l.closedStep, l.quantity, l.buyCost, l.realizedPnl]).sort());
      validHistory = replay.stepCount === simulation.stepCount && signature(replay.lots) === signature(simulation.lots);
    } catch { validHistory = false; }
    return simulation.lots.filter(l => l.closedStep !== null).map(lot => ({
      id: lot.id, strategyId: simulation.id, name: simulation.name, symbol: simulation.symbol, market: simulation.market,
      mode: "simulation" as const,
      date: validHistory ? ranges.find(r => lot.closedStep! >= r.startStep && lot.closedStep! <= r.endStep)?.date ?? null : null,
      quantity: lot.quantity, cost: lot.buyCost, pnl: lot.realizedPnl, proceeds: roundMoney(lot.buyCost + lot.realizedPnl),
    }));
  });
}
export interface ProfitFilter { mode: ProfitMode; market: string; year: number; month: number | null; strategyId: string }
export function profitTotals(records: { cost: number; proceeds: number; pnl: number; quantity: number; count?: number }[]) {
  const empty = { cost: 0, proceeds: 0, pnl: 0, quantity: 0, count: 0 };
  const sum = records.reduce<typeof empty>((s, r) => ({ cost: roundMoney(s.cost + r.cost), proceeds: roundMoney(s.proceeds + r.proceeds), pnl: roundMoney(s.pnl + r.pnl), quantity: s.quantity + r.quantity, count: s.count + (r.count ?? 1) }), empty);
  return { ...sum, returnPct: sum.cost > 0 ? roundMoney(sum.pnl / sum.cost * 100) : null };
}
export function performanceBuckets(records: ProfitRecord[], filter: ProfitFilter) {
  const prefix = String(filter.year).padStart(4, "0");
  const days = filter.month === null ? 12 : new Date(Date.UTC(filter.year, filter.month, 0)).getUTCDate();
  const selected = records.filter(r => r.mode === filter.mode && r.market === filter.market && (filter.strategyId === "all" || r.strategyId === filter.strategyId));
  return Array.from({ length: days }, (_, i) => {
    const key = filter.month === null ? `${prefix}-${String(i + 1).padStart(2, "0")}` : `${prefix}-${String(filter.month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    return { key, label: `${i + 1}${filter.month === null ? "월" : "일"}`, ...profitTotals(selected.filter(r => r.date?.startsWith(key))) };
  });
}
