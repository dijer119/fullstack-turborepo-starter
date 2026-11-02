import { getBudgetSchedule, type BudgetSettings } from "./budget";

export interface SplitConfig {
  symbol: string;
  name: string;
  market: "KR" | "US";
  source: "manual" | "toss";
  initialCash: number;
  trancheBudget: number;
  maxTranches: number;
  buyDropPct: number;
  takeProfitPct: number;
  feePct: number;
  sellTaxPct: number;
}

export interface SplitLotState {
  slot: number;
  generation: number;
  anchorPrice: number;
  buyPrice: number;
  quantity: number;
  remainingQty: number;
  buyCost: number;
  buyFee: number;
  sellPrice: number | null;
  sellFee: number;
  sellTax: number;
  realizedPnl: number;
  openedStep: number;
  closedStep: number | null;
}

export interface SplitState {
  cash: number;
  status: "active" | "paused" | "completed";
  stepCount: number;
  lastPrice: number | null;
  note: string | null;
  lots: SplitLotState[];
}

// KRW/USD 금액 모두 모의 장부에서 소수 넷째 자리까지 보존한다.
export const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 10000) / 10000;

export function validateConfig(config: SplitConfig, budgetSettings: BudgetSettings = {}): void {
  if (
    !["KR", "US"].includes(config.market) ||
    !["manual", "toss"].includes(config.source)
  ) {
    throw new Error("시장 또는 가격 원천이 올바르지 않습니다.");
  }
  const symbolPattern =
    config.market === "KR" ? /^[A-Z0-9]{6}$/ : /^[A-Z][A-Z0-9.-]{0,14}$/;
  if (typeof config.symbol !== "string" || !symbolPattern.test(config.symbol)) {
    throw new Error(
      "종목코드를 확인하세요. 국내는 6자리 코드, 미국은 티커를 입력하세요.",
    );
  }
  if (typeof config.name !== "string" || config.name.length > 100)
    throw new Error("종목명은 100자 이내로 입력하세요.");
  for (const value of [config.initialCash, config.trancheBudget]) {
    if (
      !Number.isFinite(value) ||
      value < 0.01 ||
      value > 1e10 ||
      roundMoney(value) !== value
    ) {
      throw new Error(
        "모의 자금과 차수 예산은 0.01 이상, 100억원 이하의 소수 넷째 자리 금액으로 입력하세요.",
      );
    }
  }
  if (
    !Number.isInteger(config.maxTranches) ||
    config.maxTranches < 1 ||
    config.maxTranches > 50
  ) {
    throw new Error("최대 차수는 1~50 사이의 정수로 입력하세요.");
  }
  if (
    getBudgetSchedule({ ...config, ...budgetSettings }).total > config.initialCash
  ) {
    throw new Error("배정 자금은 전체 차수의 예산 합계 이상이어야 합니다.");
  }
  for (const [label, value, max] of [
    ["매수 간격", config.buyDropPct, 100],
    ["목표 수익률", config.takeProfitPct, 1000],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0 || value >= max)
      throw new Error(`${label}의 범위를 확인하세요.`);
  }
  for (const value of [config.feePct, config.sellTaxPct]) {
    if (!Number.isFinite(value) || value < 0 || value > 5)
      throw new Error("수수료와 세율은 0~5%로 입력하세요.");
  }
}

export function initialState(config: SplitConfig): SplitState {
  validateConfig(config);
  return {
    cash: config.initialCash,
    status: "active",
    stepCount: 0,
    lastPrice: null,
    note: null,
    lots: [],
  };
}

export function validatePrice(price: number, market: "KR" | "US"): void {
  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    price > 1e9 ||
    roundMoney(price) !== price
  ) {
    throw new Error(
      "가격은 0보다 크고 10억 이하인 소수 넷째 자리 금액이어야 합니다.",
    );
  }
  if (market === "KR" && !Number.isInteger(price))
    throw new Error("국내 가격은 원 단위 정수로 입력하세요.");
}

/** 한 관측은 기존 보유의 매도를 먼저 판정하고, 매도가 없을 때 한 차수만 산다. */
export function advanceSimulation(
  config: SplitConfig,
  state: SplitState,
  price: number,
): SplitState {
  validatePrice(price, config.market);
  if (state.status !== "active") return state;
  const next: SplitState = {
    ...state,
    stepCount: state.stepCount + 1,
    lastPrice: price,
    note: "매매 조건 미충족",
    lots: state.lots.map((lot) => ({ ...lot })),
  };
  const held = next.lots.filter((lot) => lot.remainingQty > 0);
  let sold = 0;
  for (const lot of held) {
    const target = lot.buyPrice * (1 + config.takeProfitPct / 100);
    if (price + 1e-8 < target) continue;
    const gross = roundMoney(price * lot.remainingQty);
    lot.sellFee = roundMoney((gross * config.feePct) / 100);
    lot.sellTax = roundMoney((gross * config.sellTaxPct) / 100);
    const proceeds = roundMoney(gross - lot.sellFee - lot.sellTax);
    next.cash = roundMoney(next.cash + proceeds);
    lot.realizedPnl = roundMoney(proceeds - lot.buyCost);
    lot.sellPrice = price;
    lot.remainingQty = 0;
    lot.closedStep = next.stepCount;
    sold++;
  }
  if (sold > 0) {
    next.note = `${sold}개 차수 모의 매도`;
    if (next.lots.every((lot) => lot.remainingQty === 0)) {
      next.status = "completed";
      next.note = "전량 청산 — 모의 실행 종료";
    }
    return next;
  }

  let slot = 1;
  let anchorPrice = price;
  if (next.lots.length > 0) {
    const parent = held
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .find(
        (lot) =>
          lot.slot < config.maxTranches &&
          !held.some((other) => other.slot === lot.slot + 1) &&
          price <= lot.buyPrice * (1 - config.buyDropPct / 100) + 1e-8,
      );
    if (!parent) return next;
    slot = parent.slot + 1;
    anchorPrice = parent.buyPrice;
  }
  const budget = Math.min(config.trancheBudget, next.cash);
  let quantity = Math.floor(budget / (price * (1 + config.feePct / 100)));
  const costOf = (qty: number) =>
    roundMoney(price * qty + roundMoney((price * qty * config.feePct) / 100));
  if (costOf(quantity + 1) <= budget) quantity++;
  if (quantity > 0 && costOf(quantity) > budget) quantity--;
  if (quantity > 2147483647)
    throw new Error("차수당 모의 수량이 저장 가능한 범위를 초과합니다.");
  if (quantity < 1) {
    next.note = "가용 예산으로 1주를 매수할 수 없습니다.";
    return next;
  }
  const generation =
    1 +
    Math.max(
      0,
      ...next.lots
        .filter((lot) => lot.slot === slot)
        .map((lot) => lot.generation),
    );
  const buyFee = roundMoney((price * quantity * config.feePct) / 100);
  const buyCost = costOf(quantity);
  next.cash = roundMoney(next.cash - buyCost);
  next.lots.push({
    slot,
    generation,
    anchorPrice,
    buyPrice: price,
    quantity,
    remainingQty: quantity,
    buyCost,
    buyFee,
    sellPrice: null,
    sellFee: 0,
    sellTax: 0,
    realizedPnl: 0,
    openedStep: next.stepCount,
    closedStep: null,
  });
  next.note = `${slot}차 ${generation}회 모의 매수`;
  return next;
}

export function summarize(config: SplitConfig, state: SplitState) {
  const held = state.lots.filter((lot) => lot.remainingQty > 0);
  const holdingQty = held.reduce((sum, lot) => sum + lot.remainingQty, 0);
  const marketValue = roundMoney(holdingQty * (state.lastPrice ?? 0));
  const holdingCost = roundMoney(
    held.reduce((sum, lot) => sum + lot.buyCost, 0),
  );
  const realizedPnl = roundMoney(
    state.lots.reduce((sum, lot) => sum + lot.realizedPnl, 0),
  );
  const equity = roundMoney(state.cash + marketValue);
  return {
    holdingQty,
    marketValue,
    holdingCost,
    realizedPnl,
    unrealizedPnl: roundMoney(marketValue - holdingCost),
    equity,
    totalPnl: roundMoney(equity - config.initialCash),
    totalReturnPct: roundMoney((equity / config.initialCash - 1) * 100),
  };
}
