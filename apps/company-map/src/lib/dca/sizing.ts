// 매수 주문 사이징. 이월 원화 잔액을 당일 환율로 환산해 LOC 지정가 기준 정수 수량만 산다.
// 지정가(상한)로 나누는 이유: 체결가는 종가라 지정가 이하이므로 예산 초과가 구조적으로 불가능하다.
// 남은 돈은 차감되지 않고 그대로 이월된다. 순수 함수만 둔다.

export interface DcaBuyPlan {
  /** LOC 지정가(상한) USD */
  price: number;
  quantity: number;
  /** 전량 지정가 체결 시 최대 소요 USD */
  estUsd: number;
  /** 위 금액의 원화 환산(주문 시 환율) */
  estKrw: number;
}

function locLimit(price: number, premiumPct: number): number {
  return Math.round(price * (1 + premiumPct / 100) * 100) / 100;
}

/** 1주도 못 사면 null. 그 경우 잔액은 그대로 다음 거래일로 이월된다. */
export function planBuy(args: {
  cashKrw: number;
  fxRate: number;
  price: number;
  premiumPct: number;
}): DcaBuyPlan | null {
  const { cashKrw, fxRate, price, premiumPct } = args;
  if (!Number.isFinite(cashKrw) || cashKrw <= 0) return null;
  if (!Number.isFinite(fxRate) || fxRate <= 0) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(premiumPct) || premiumPct < 0) return null;

  const limit = locLimit(price, premiumPct);
  if (limit <= 0) return null;

  const quantity = Math.floor(cashKrw / fxRate / limit);
  if (quantity < 1) return null;

  const estUsd = Math.round(quantity * limit * 100) / 100;
  return { price: limit, quantity, estUsd, estKrw: Math.round(estUsd * fxRate) };
}

/** UI 안내용 — 지금 속도로 적립하면 몇 거래일 뒤에 1주를 살 수 있는지. 도달 불가면 null. */
export function tradingDaysToOneShare(args: {
  cashKrw: number;
  dailyAmountKrw: number;
  fxRate: number;
  price: number;
  premiumPct: number;
}): number | null {
  const { cashKrw, dailyAmountKrw, fxRate, price, premiumPct } = args;
  if (!Number.isFinite(fxRate) || fxRate <= 0) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  const oneShareKrw = locLimit(price, premiumPct) * fxRate;
  if (cashKrw >= oneShareKrw) return 0;
  if (!Number.isFinite(dailyAmountKrw) || dailyAmountKrw <= 0) return null;
  return Math.ceil((oneShareKrw - cashKrw) / dailyAmountKrw);
}
