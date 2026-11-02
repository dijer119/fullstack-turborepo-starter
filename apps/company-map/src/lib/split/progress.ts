import { roundMoney } from "./engine";

export interface ProgressLot {
  slot: number;
  generation: number;
  boughtQty: number;
  remainingQty: number;
  realizedPnl: number;
  pendingOrderCount: number;
}
export function strategyProgress(maxTranches: number, lots: ProgressLot[]) {
  const rows = Array.from({ length: Math.max(maxTranches, ...lots.map(l => l.slot)) }, (_, i) => {
    const slot = i + 1;
    const slotLots = lots.filter(l => l.slot === slot);
    const entries = slotLots.filter(l => l.boughtQty > 0).length;
    const completed = slotLots.filter(l => l.boughtQty > 0 && l.remainingQty === 0 && l.pendingOrderCount === 0).length;
    return {
      slot, entries, completed, completionPct: entries ? completed / entries * 100 : 0,
      holdingQty: slotLots.reduce((sum, l) => sum + l.remainingQty, 0),
      realizedPnl: roundMoney(slotLots.reduce((sum, l) => sum + l.realizedPnl, 0)),
      pendingOrders: slotLots.reduce((sum, l) => sum + l.pendingOrderCount, 0),
    };
  });
  return {
    rows,
    entries: rows.reduce((sum, r) => sum + r.entries, 0),
    completed: rows.reduce((sum, r) => sum + r.completed, 0),
    holdingQty: rows.reduce((sum, r) => sum + r.holdingQty, 0),
    holdingSlots: rows.filter(r => r.holdingQty > 0).length,
    realizedPnl: roundMoney(rows.reduce((sum, r) => sum + r.realizedPnl, 0)),
    pendingOrders: rows.reduce((sum, r) => sum + r.pendingOrders, 0),
  };
}
