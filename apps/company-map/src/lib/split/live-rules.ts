import { roundMoney, validatePrice } from "./engine";
import { getTrancheBudget, type BudgetSettings } from "./budget";

export interface LiveConfig extends BudgetSettings {
  market: "KR" | "US";
  trancheBudget: number;
  maxTranches: number;
  buyDropPct: number;
  takeProfitPct: number;
  firstTakeProfitPct?: number;
  feeBufferPct: number;
  tickSize?: number;
}

export interface LiveLot {
  id: string;
  slot: number;
  generation: number;
  boughtQty: number;
  boughtAmount: number;
  buyFees: number;
  buyTax: number;
  soldQty: number;
  soldAmount: number;
  sellFees: number;
  sellTax: number;
}

export function liveTakeProfitPct(config: Pick<LiveConfig, "takeProfitPct" | "firstTakeProfitPct" | "tranches">, slot: number) {
  if (config.tranches !== undefined) return config.tranches[slot - 1].takeProfitPct;
  return slot === 1 ? (config.firstTakeProfitPct ?? 10) : config.takeProfitPct;
}

export function liveBuyDropPct(config: Pick<LiveConfig, "buyDropPct" | "tranches">, slot: number) {
  if (config.tranches !== undefined) return config.tranches[slot - 1].buyDropPct ?? 0;
  return config.buyDropPct;
}

export function validateFirstTakeProfitPct(value: number) {
  if (!Number.isFinite(value) || value < 0.01 || value > 999.99 ||
    Math.round(value * 100) / 100 !== value)
    throw new Error("1차 익절률은 0.01~999.99%, 소수 둘째 자리까지 입력하세요.");
}

export interface LivePlan {
  side: "BUY" | "SELL";
  lotId: string | null;
  slot: number;
  generation: number;
  quantity: number;
  price: number;
}

export function lotTotals(lot: LiveLot) {
  const cost = roundMoney(lot.boughtAmount + lot.buyFees + lot.buyTax);
  const remainingQty = lot.boughtQty - lot.soldQty;
  const remainingCost = lot.boughtQty
    ? roundMoney((cost * remainingQty) / lot.boughtQty)
    : 0;
  return {
    remainingQty,
    buyPrice: lot.boughtQty ? lot.boughtAmount / lot.boughtQty : 0,
    cost,
    remainingCost,
    realizedPnl: roundMoney(
      lot.soldAmount - lot.sellFees - lot.sellTax - (cost - remainingCost),
    ),
  };
}

/** Executed buy price, excluding costs, floored to the supported currency precision. */
export function firstBuyReentryPrice(lot: Pick<LiveLot, "boughtQty" | "boughtAmount">, market: string): number | null {
  if (!Number.isSafeInteger(lot.boughtQty) || lot.boughtQty <= 0 || !Number.isFinite(lot.boughtAmount) || lot.boughtAmount <= 0) return null;
  const units = BigInt(Math.round(lot.boughtAmount * 10000));
  const precision = market === "KR" ? 1 : 10000;
  return Number(units / (BigInt(lot.boughtQty) * BigInt(10000 / precision))) / precision;
}

export function planLiveOrder(
  config: LiveConfig,
  lots: LiveLot[],
  price: number,
  cash: number,
): LivePlan | null {
  validatePrice(price, "US");
  const held = lots.filter((lot) => lotTotals(lot).remainingQty > 0);
  const selling = held
    .slice()
    .sort((a, b) => b.slot - a.slot)
    .find(
      (lot) =>
        price + 1e-8 >=
        lotTotals(lot).buyPrice * (1 + liveTakeProfitPct(config, lot.slot) / 100),
    );
  const scale =
    config.market === "US"
      ? price >= 1
        ? 100
        : 10000
      : 1 / (config.tickSize ?? 1);
  const limit = selling
    ? Math.ceil(price * scale - 1e-8) / scale
    : Math.floor(price * scale + 1e-8) / scale;
  if (selling)
    return {
      side: "SELL",
      lotId: selling.id,
      slot: selling.slot,
      generation: selling.generation,
      quantity: lotTotals(selling).remainingQty,
      price: limit,
    };
  const parent = held
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .find(
      (lot) =>
        lot.slot < config.maxTranches &&
        !held.some((other) => other.slot === lot.slot + 1) &&
        price <= lotTotals(lot).buyPrice * (1 - liveBuyDropPct(config, lot.slot + 1) / 100) + 1e-8,
    );
  if (held.length && !parent) return null;
  const slot = parent ? parent.slot + 1 : 1;
  const budget = Math.min(cash, getTrancheBudget(config, slot));
  const cost = (qty: number) =>
    roundMoney(limit * qty * (1 + config.feeBufferPct / 100));
  let quantity = Math.floor(budget / (limit * (1 + config.feeBufferPct / 100)));
  if (cost(quantity + 1) <= budget) quantity++;
  if (cost(quantity) > budget) quantity--;
  if (quantity < 1 || quantity > 2147483647) return null;
  return {
    side: "BUY",
    lotId: null,
    slot,
    generation:
      1 +
      Math.max(
        0,
        ...lots.filter((lot) => lot.slot === slot).map((lot) => lot.generation),
      ),
    quantity,
    price: limit,
  };
}

export interface Execution {
  filledQty: number;
  filledAmount: number | null;
  commission: number | null;
  tax: number | null;
}
export function validateExecution(
  quantity: number,
  previous: Execution,
  current: Execution,
) {
  if (
    !Number.isSafeInteger(current.filledQty) ||
    current.filledQty < previous.filledQty ||
    current.filledQty > quantity
  )
    throw new Error("체결 수량 불일치");
  const values = [current.filledAmount, current.commission, current.tax];
  if (current.filledQty > 0 && values.some((value) => value === null))
    throw new Error("체결 금액·비용 미확정");
  if (
    values.some(
      (value) =>
        value !== null &&
        (!Number.isFinite(value) || value < 0 || value > 1e12),
    )
  )
    throw new Error("체결 금액·비용 불일치");
  const amount = current.filledAmount ?? 0;
  if (
    amount < (previous.filledAmount ?? 0) ||
    (current.filledQty > 0 && amount <= 0) ||
    (current.filledQty === 0 && amount !== 0)
  )
    throw new Error("누적 체결 금액 불일치");
  return {
    qty: current.filledQty - previous.filledQty,
    amount: roundMoney(amount - (previous.filledAmount ?? 0)),
    fees: roundMoney((current.commission ?? 0) - (previous.commission ?? 0)),
    tax: roundMoney((current.tax ?? 0) - (previous.tax ?? 0)),
  };
}
