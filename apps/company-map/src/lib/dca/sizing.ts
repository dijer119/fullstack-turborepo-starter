// 매수 주문 사이징. 토스 금액 기반 주문(orderAmount)은 달러 금액을 확정하고 수량이 변동한다.
// 정수 수량 제약이 없으므로 매 거래일 잔액 전액을 투입한다.
// 센트 단위 절삭분만 다음 거래일로 이월된다. 순수 함수만 둔다.

export interface DcaAmountPlan {
  /** 주문에 넣을 USD 금액(센트 단위 절삭) */
  amountUsd: number;
  /** 위 금액의 원화 환산(주문 시 환율) */
  amountKrw: number;
}

/** 환산액이 1센트 미만이면 null. 그 경우 잔액은 그대로 다음 거래일로 이월된다. */
export function planAmountBuy(args: { cashKrw: number; fxRate: number }): DcaAmountPlan | null {
  const { cashKrw, fxRate } = args;
  if (!Number.isFinite(cashKrw) || cashKrw <= 0) return null;
  if (!Number.isFinite(fxRate) || fxRate <= 0) return null;

  const amountUsd = Math.floor((cashKrw / fxRate) * 100) / 100;
  if (amountUsd < 0.01) return null;

  return { amountUsd, amountKrw: Math.round(amountUsd * fxRate) };
}

/** 표시·시뮬레이션용 예상 수량. 실제 체결 수량은 주문 시점 시세로 토스가 정산한다. */
export function estimateQuantity(amountUsd: number, price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.round((amountUsd / price) * 1e6) / 1e6;
}
