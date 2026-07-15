// 매수표·매도표 → 주문 계산. 규칙은 62주차 영상 슬라이드에서 역산·검증:
//   매수: 보유 n → k주째(k=n+1..) 매수점 = 밴드하단/(k−1), LOC(CLS) 1주씩
//   매도: 보유 n → k주로(k=n−1..) 매도점 = 밴드상단/(k+1), 지정가(DAY) 1주씩
// 검산: 하단 11871.69·보유 233 → 11871.69/233 = 50.95 / 상단 16061.69/233 = 68.93
import type { Band } from "./formula";
import { round2 } from "./formula";

export interface VrIntendedOrder {
  side: "BUY" | "SELL";
  kind: "loc_buy" | "limit_sell";
  orderType: "LIMIT";
  tif: "CLS" | "DAY";
  price: number;
  quantity: number;
}

/** 주문 폭주 방지 레벨 상한 (Pool 한도로 대부분 그 이하로 잘림) */
export const MAX_LEVELS = 20;

/** budget = pool × 사용한도%. 누적 예상 매수액이 budget을 넘는 레벨부터 제외. */
export function buyTable(holdingQty: number, band: Band, budget: number): VrIntendedOrder[] {
  const orders: VrIntendedOrder[] = [];
  if (holdingQty < 1) return orders; // 신규 시작은 seed 체결로 처리 (0-division 방지)
  let spent = 0;
  for (let k = holdingQty + 1; orders.length < MAX_LEVELS; k++) {
    const price = round2(band.min / (k - 1));
    if (price <= 0) break;
    if (spent + price > budget) break;
    spent += price;
    orders.push({ side: "BUY", kind: "loc_buy", orderType: "LIMIT", tif: "CLS", price, quantity: 1 });
  }
  return orders;
}

export function sellTable(holdingQty: number, band: Band): VrIntendedOrder[] {
  const orders: VrIntendedOrder[] = [];
  for (let k = holdingQty - 1; k >= 0 && orders.length < MAX_LEVELS; k--) {
    const price = round2(band.max / (k + 1));
    orders.push({ side: "SELL", kind: "limit_sell", orderType: "LIMIT", tif: "DAY", price, quantity: 1 });
  }
  return orders;
}
