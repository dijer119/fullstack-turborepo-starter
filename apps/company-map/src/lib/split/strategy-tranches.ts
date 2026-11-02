export const pendingOrderStatuses = ["submitting", "submit_unknown", "submitted", "cost_pending", "blocked"];
export type PositionFilter = "all" | "held" | "watching" | "pending";
export type TrancheState = "held" | "buy_wait" | "buy_pending" | "sell_pending" | "review" | "paused" | "closed" | "waiting";
export interface TrancheCell {
  slot: number;
  quantity: number;
  profitPct: number | null;
  state: TrancheState;
}
interface Holding { slot: number; remainingQty: number; buyPrice: number }
interface PendingOrder { slot: number; side: string; status: string }

const profitPct = (price: number | null, quantity: number, amount: number) =>
  price !== null && price > 0 && quantity > 0 && amount > 0
    ? Math.round((price * quantity / amount - 1) * 1000000) / 10000 : null;

export function summarizeTranches(maxTranches: number, status: string, price: number | null, lots: Holding[], orders: PendingOrder[]) {
  const held = lots.filter(l => l.remainingQty > 0);
  const pending = orders.filter(o => pendingOrderStatuses.includes(o.status));
  const cells: TrancheCell[] = Array.from({ length: maxTranches }, (_, index) => {
    const slot = index + 1;
    const holdings = held.filter(l => l.slot === slot);
    const quantity = holdings.reduce((sum, l) => sum + l.remainingQty, 0);
    const amount = holdings.reduce((sum, l) => sum + l.remainingQty * l.buyPrice, 0);
    const slotOrders = pending.filter(o => o.slot === slot);
    const canWatch = held.length === 0 ? slot === 1 : held.some(l => l.slot === slot - 1);
    let state: TrancheState = "waiting";
    if (slotOrders.length) {
      state = slotOrders.some(o => o.status !== "submitted") ? "review" : slotOrders[0].side === "BUY" ? "buy_pending" : "sell_pending";
    } else if (quantity > 0) state = "held";
    else if (canWatch && status !== "completed" && !pending.length) state = ["active", "reserved"].includes(status) ? "buy_wait" : "paused";
    else if (lots.some(l => l.slot === slot && l.buyPrice > 0)) state = "closed";
    return { slot, quantity, profitPct: profitPct(price, quantity, amount), state };
  });
  return {
    cells,
    pendingCount: pending.length,
    profitPct: profitPct(price, held.reduce((s, l) => s + l.remainingQty, 0), held.reduce((s, l) => s + l.remainingQty * l.buyPrice, 0)),
  };
}

export function matchesPositionFilter(row: { holdingQty: number; status: string; pendingCount: number }, filter: PositionFilter) {
  if (filter === "held") return row.holdingQty > 0;
  if (filter === "watching") return row.holdingQty === 0 && ["active", "reserved"].includes(row.status) && row.pendingCount === 0;
  if (filter === "pending") return row.pendingCount > 0;
  return true;
}
