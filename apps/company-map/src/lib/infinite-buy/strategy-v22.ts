// 라오어 무한매수법 V2.2 일일 주문 계산. 순수 함수(토스 의존 없음).
// v1(strategy.ts)과 별개 코어. 2023년부터 오피셜.
// 핵심: 매수 큰수·매도 1/4 LOC를 하나의 변동식 (10 − T/2)% 로 통일. T = round(회차).
//   전반전 T<20 → (10−T/2)>0 (평단 위) / 후반전 T≥20 → ≤0 (평단 이하).
// 쿼터모드/쿼터손절은 제외(사용자 결정). 손절/소진 처리는 v1과 동일.
import type { CycleState } from "./strategy";

export interface V22Order {
  side: "BUY" | "SELL";
  kind:
    | "first_market" | "loc_avg" | "loc_var"
    | "sell_loc_var" | "sell_lim_10"
    | "reset_sell";
  orderType: "LIMIT" | "MARKET";
  tif: "CLS" | "DAY";
  price: number | null;
  quantity: number;
}

export interface V22Plan {
  orders: V22Order[];
  nextRound: number;
  resetAfter: boolean;
}

const px = (v: number): number => Math.round(v * 100) / 100;

// 변동식: 평단 대비 (10 − T/2)% 를 적용한 가격.
const varPrice = (avg: number, T: number): number => avg * (1 + (10 - T / 2) / 100);

export function computeDailyOrdersV22(s: CycleState): V22Plan {
  const daily = s.principalUsd / s.splits;
  const T = s.round;
  const secondHalf = T >= s.splits / 2;
  const orders: V22Order[] = [];
  let nextRound = s.round;
  let resetAfter = false;

  if (s.round < s.splits) {
    // ── 매수 (전부 LOC) ──
    if (s.round === 0) {
      const qty = Math.floor(daily / s.currentPrice);
      if (qty >= 1) {
        orders.push({ side: "BUY", kind: "first_market", orderType: "MARKET", tif: "DAY", price: null, quantity: qty });
      }
    } else if (s.avgPrice && s.avgPrice > 0) {
      // 큰수/변동 지정가 = min( 평단+(10−T/2)%, 현재가+15% )
      const bigPrice = Math.min(varPrice(s.avgPrice, T), s.currentPrice * 1.15);
      if (!secondHalf) {
        // 전반: 0.5회치 평단 LOC + 0.5회치 변동 LOC
        const half = daily / 2;
        const qAvg = Math.floor(half / s.avgPrice);
        if (qAvg >= 1) orders.push({ side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: px(s.avgPrice), quantity: qAvg });
        const qVar = bigPrice > 0 ? Math.floor(half / bigPrice) : 0;
        if (qVar >= 1) orders.push({ side: "BUY", kind: "loc_var", orderType: "LIMIT", tif: "CLS", price: px(bigPrice), quantity: qVar });
      } else {
        // 후반: 1회치 전액 변동 LOC (평단 이하)
        const qVar = bigPrice > 0 ? Math.floor(daily / bigPrice) : 0;
        if (qVar >= 1) orders.push({ side: "BUY", kind: "loc_var", orderType: "LIMIT", tif: "CLS", price: px(bigPrice), quantity: qVar });
      }
    }
    nextRound = s.round + 1;

    // ── 매도 (보유 > 0) ──
    if (s.holdingQty > 0 && s.avgPrice && s.avgPrice > 0) {
      orders.push(...sellTranches(s, T));
    }
  } else {
    // ── 원금소진 후 (v1과 동일) ──
    if (s.holdingQty <= 0) {
      resetAfter = true;
    } else if (s.pnlPct != null && s.pnlPct <= -s.lossCut) {
      orders.push({ side: "SELL", kind: "reset_sell", orderType: "MARKET", tif: "DAY", price: null, quantity: s.holdingQty });
      resetAfter = true;
    } else if (s.avgPrice && s.avgPrice > 0) {
      orders.push(...sellTranches(s, T));
    }
  }

  return { orders, nextRound, resetAfter };
}

// 전/후반 무관 2단: 1/4 @ 평단+(10−T/2)% LOC + 3/4 @ 평단+10% 지정가.
// 정수 반올림: 1/4는 floor, 나머지를 3/4(+10%)에 몰아 합계=보유수량. qty 0은 생략.
function sellTranches(s: CycleState, T: number): V22Order[] {
  const N = s.holdingQty;
  const avg = s.avgPrice as number;
  const out: V22Order[] = [];
  const qLoc = Math.floor(N * 0.25);
  const qLim = N - qLoc;
  if (qLoc >= 1) {
    out.push({ side: "SELL", kind: "sell_loc_var", orderType: "LIMIT", tif: "CLS", price: px(varPrice(avg, T)), quantity: qLoc });
  }
  if (qLim >= 1) {
    out.push({ side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: px(avg * 1.1), quantity: qLim });
  }
  return out;
}
