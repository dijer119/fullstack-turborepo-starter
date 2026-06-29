// 라오어 무한매수법 핵심 사이클(상황1) 순수 계산. 토스 의존 없음.
export interface CycleState {
  round: number;
  splits: number;
  principalUsd: number;
  profitTarget: number;  // %
  bigBuyPremium: number; // %
  lossCut: number;       // % (양수; pnlPct <= -lossCut이면 손절)
  avgPrice: number | null;
  currentPrice: number;
  holdingQty: number;
  pnlPct: number | null; // %
}

export type OrderKind =
  | "first_market" | "loc_avg" | "loc_big" | "target_sell" | "reset_sell";

export interface IntendedOrder {
  side: "BUY" | "SELL";
  kind: OrderKind;
  orderType: "LIMIT" | "MARKET";
  tif: "CLS" | "DAY";
  price: number | null;
  quantity: number;
}

export interface DailyPlan {
  orders: IntendedOrder[];
  nextRound: number;
  resetAfter: boolean;
}

// 미국 주식 가격은 소수 2자리.
const px = (v: number): number => Math.round(v * 100) / 100;

export function computeDailyOrders(s: CycleState): DailyPlan {
  const dailyAmount = s.principalUsd / s.splits;
  const orders: IntendedOrder[] = [];
  let nextRound = s.round;
  let resetAfter = false;

  if (s.round < s.splits) {
    // 매수 단계
    if (s.round === 0) {
      const qty = Math.floor(dailyAmount / s.currentPrice);
      if (qty >= 1) {
        orders.push({ side: "BUY", kind: "first_market", orderType: "MARKET", tif: "DAY", price: null, quantity: qty });
      }
    } else {
      const half = dailyAmount / 2;
      if (s.avgPrice && s.avgPrice > 0) {
        const qtyAvg = Math.floor(half / s.avgPrice);
        if (qtyAvg >= 1) {
          orders.push({ side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: px(s.avgPrice), quantity: qtyAvg });
        }
      }
      const bigPrice = s.currentPrice * (1 + s.bigBuyPremium / 100);
      const qtyBig = Math.floor(half / bigPrice);
      if (qtyBig >= 1) {
        orders.push({ side: "BUY", kind: "loc_big", orderType: "LIMIT", tif: "CLS", price: px(bigPrice), quantity: qtyBig });
      }
    }
    nextRound = s.round + 1;

    if (s.holdingQty > 0 && s.avgPrice && s.avgPrice > 0) {
      orders.push({
        side: "SELL", kind: "target_sell", orderType: "LIMIT", tif: "DAY",
        price: px(s.avgPrice * (1 + s.profitTarget / 100)), quantity: s.holdingQty,
      });
    }
  } else {
    // 소진 후(상황1)
    if (s.holdingQty <= 0) {
      resetAfter = true; // 익절 완료
    } else if (s.pnlPct != null && s.pnlPct <= -s.lossCut) {
      orders.push({ side: "SELL", kind: "reset_sell", orderType: "MARKET", tif: "DAY", price: null, quantity: s.holdingQty });
      resetAfter = true; // 손절
    } else if (s.avgPrice && s.avgPrice > 0) {
      orders.push({
        side: "SELL", kind: "target_sell", orderType: "LIMIT", tif: "DAY",
        price: px(s.avgPrice * (1 + s.profitTarget / 100)), quantity: s.holdingQty,
      });
    }
  }

  return { orders, nextRound, resetAfter };
}
