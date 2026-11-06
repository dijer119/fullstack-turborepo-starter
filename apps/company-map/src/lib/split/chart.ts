import type { SplitLotState } from "./engine";
import { koreanDate } from "./performance";

export interface ChartTrade {
  id: string; x: number; side: "BUY" | "SELL"; slot: number; generation: number;
  price: number; quantity: number; label: string; orderDate?: string;
}
export interface SplitChartData {
  trades: ChartTrade[];
}
interface LiveChartOrder {
  id: string; side: string; createdAt: Date; filledQty: number; filledAmount: number;
  lot: { slot: number; generation: number };
}
const validPrice = (n: number) => Number.isFinite(n) && n > 0;

export function liveChart(orders: LiveChartOrder[]): SplitChartData {
  return {
    trades: orders.filter(o => o.filledQty > 0 && validPrice(o.filledAmount / o.filledQty) && ["BUY", "SELL"].includes(o.side))
      .map(o => ({ id: o.id, x: Date.parse(`${koreanDate(o.createdAt)}T00:00:00Z`), side: o.side as "BUY" | "SELL", ...o.lot,
        price: o.filledAmount / o.filledQty, quantity: o.filledQty, orderDate: koreanDate(o.createdAt),
        label: o.createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) })),
  };
}

export function simulationChart(lots: SplitLotState[]): SplitChartData {
  const trades: ChartTrade[] = lots.flatMap(l => {
    const base = { slot: l.slot, generation: l.generation, quantity: l.quantity };
    return [
      { ...base, id: `${l.slot}-${l.generation}-B`, x: l.openedStep, side: "BUY" as const, price: l.buyPrice, label: `관측 #${l.openedStep}` },
      ...(l.closedStep !== null && l.sellPrice !== null ? [{ ...base, id: `${l.slot}-${l.generation}-S`, x: l.closedStep, side: "SELL" as const, price: l.sellPrice, label: `관측 #${l.closedStep}` }] : []),
    ];
  }).sort((a, b) => a.x - b.x || a.slot - b.slot);
  return { trades };
}

// Preserve each filled order/lot event, including repeated trades at the same date and price.
export function tradeChartPoints(trades: ChartTrade[]) {
  return trades.map((trade, index) => ({ key: trade.id, x: index + 1, price: trade.price, side: trade.side, trades: [trade] }));
}

export function trancheChartLevels(trades: ChartTrade[]) {
  const latest = new Map<number, { generation: number; amount: number; quantity: number }>();
  for (const trade of trades) {
    if (trade.side !== "BUY" || trade.quantity <= 0) continue;
    const previous = latest.get(trade.slot);
    if (previous && previous.generation > trade.generation) continue;
    const row = previous?.generation === trade.generation ? previous : { generation: trade.generation, amount: 0, quantity: 0 };
    row.amount += trade.price * trade.quantity;
    row.quantity += trade.quantity;
    latest.set(trade.slot, row);
  }
  return [...latest].map(([slot, row]) => ({ slot, price: row.amount / row.quantity })).sort((a, b) => a.slot - b.slot);
}
