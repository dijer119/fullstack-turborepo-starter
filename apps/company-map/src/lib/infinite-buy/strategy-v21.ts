// 라오어 무한매수법 V2.1 일일 주문 계산. 순수 함수(토스 의존 없음).
// v1(strategy.ts)과 별개 코어. 전반/후반 = round < splits/2 / >= splits/2.
import type { CycleState } from "./strategy";

// v21 전용 kind (매도 세분화). v1 IntendedOrder.kind는 유니온이라 여기선 넓힘.
export interface V21Order {
  side: "BUY" | "SELL";
  kind:
    | "first_market" | "loc_avg" | "loc_big"
    | "sell_loc_5" | "sell_lim_10" | "sell_loc_0" | "sell_lim_5"
    | "reset_sell";
  orderType: "LIMIT" | "MARKET";
  tif: "CLS" | "DAY";
  price: number | null;
  quantity: number;
}

export interface V21Plan {
  orders: V21Order[];
  nextRound: number;
  resetAfter: boolean;
}

const px = (v: number): number => Math.round(v * 100) / 100;

export function computeDailyOrdersV21(s: CycleState): V21Plan {
  const daily = s.principalUsd / s.splits;
  const secondHalf = s.round >= s.splits / 2;
  const orders: V21Order[] = [];
  let nextRound = s.round;
  let resetAfter = false;

  if (s.round < s.splits) {
    // ── 매수 ──
    if (s.round === 0) {
      const qty = Math.floor(daily / s.currentPrice);
      if (qty >= 1) {
        orders.push({ side: "BUY", kind: "first_market", orderType: "MARKET", tif: "DAY", price: null, quantity: qty });
      }
    } else if (s.avgPrice && s.avgPrice > 0) {
      if (!secondHalf) {
        // 전반: 0.5회치 평단 LOC + 0.5회치 평단×1.05 LOC
        const half = daily / 2;
        const qAvg = Math.floor(half / s.avgPrice);
        if (qAvg >= 1) orders.push({ side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: px(s.avgPrice), quantity: qAvg });
        const capBig = s.avgPrice * 1.05; // 큰수 상한 = 평단+5% (현재가 무관, 고정)
        const qBig = Math.floor(half / capBig);
        if (qBig >= 1) orders.push({ side: "BUY", kind: "loc_big", orderType: "LIMIT", tif: "CLS", price: px(capBig), quantity: qBig });
      } else {
        // 후반: 1회치 전액 평단 LOC
        const qAvg = Math.floor(daily / s.avgPrice);
        if (qAvg >= 1) orders.push({ side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: px(s.avgPrice), quantity: qAvg });
      }
    }
    nextRound = s.round + 1;

    // ── 매도 (보유 > 0) ──
    if (s.holdingQty > 0 && s.avgPrice && s.avgPrice > 0) {
      orders.push(...sellTranches(s, secondHalf));
    }
  } else {
    // ── 원금소진 후 (v1과 동일) ──
    if (s.holdingQty <= 0) {
      resetAfter = true;
    } else if (s.pnlPct != null && s.pnlPct <= -s.lossCut) {
      orders.push({ side: "SELL", kind: "reset_sell", orderType: "MARKET", tif: "DAY", price: null, quantity: s.holdingQty });
      resetAfter = true;
    } else if (s.avgPrice && s.avgPrice > 0) {
      orders.push(...sellTranches(s, secondHalf));
    }
  }

  return { orders, nextRound, resetAfter };
}

// 전체 보유수량을 분할. 정수 반올림: 작은 구간 floor, 나머지를 +10%에. qty 0은 생략.
function sellTranches(s: CycleState, secondHalf: boolean): V21Order[] {
  const N = s.holdingQty;
  const avg = s.avgPrice as number;
  const out: V21Order[] = [];
  if (!secondHalf) {
    const q5 = Math.floor(N * 0.25);
    const q10 = N - q5;
    if (q5 >= 1) out.push({ side: "SELL", kind: "sell_loc_5", orderType: "LIMIT", tif: "CLS", price: px(avg * 1.05), quantity: q5 });
    if (q10 >= 1) out.push({ side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: px(avg * 1.10), quantity: q10 });
  } else {
    const q0 = Math.floor(N * 0.25);
    const q5 = Math.floor(N * 0.25);
    const q10 = N - q0 - q5;
    if (q0 >= 1) out.push({ side: "SELL", kind: "sell_loc_0", orderType: "LIMIT", tif: "CLS", price: px(avg), quantity: q0 });
    if (q5 >= 1) out.push({ side: "SELL", kind: "sell_lim_5", orderType: "LIMIT", tif: "DAY", price: px(avg * 1.05), quantity: q5 });
    if (q10 >= 1) out.push({ side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: px(avg * 1.10), quantity: q10 });
  }
  return out;
}
