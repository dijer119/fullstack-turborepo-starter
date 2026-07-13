// 라오어 무한매수법 V4.0 일반모드 일일 주문 계산. 순수 함수(토스/DB 의존 없음).
// 근거: docs/superpowers/specs/2026-07-08-infinite-buy-v4.0-reference.html
// 핵심: 별지점 = 평단×(1+별%), 별% = starBase×(1−2T/분할). T는 연속값(체결 기반, §sync).
//   매수점 = 별지점−0.01 (매수·매도 동시 발동 차단). 1회매수금 = 잔금/(분할−T).
// 범위: 코어만 — LOC 사다리·소진모드 제외(원문 미확보). 소진(T>분할−1)은 exhausted 반환.
// 상태(T·잔금) 갱신은 여기서 하지 않는다 — sync.ts의 체결 적용만이 수행.

export const px = (v: number): number => Math.round(v * 100) / 100;

// 별% = base × (1 − 2T/분할). base = TQQQ 15 / SOXL 20 (지정가매도 %와 동일 값).
export const starPct = (t: number, splits: number, base: number): number =>
  base * (1 - (2 * t) / splits);

export interface V4State {
  t: number;             // 연속 T
  splits: number;        // 분할수 (20/30/40)
  cash: number;          // 잔금(USD)
  starBase: number;      // 별% base = 지정가매도 %
  bigBuyPremium: number; // 첫매수 큰수 % (기본 12, 원문 10~15)
  avgPrice: number | null;
  currentPrice: number;
  holdingQty: number;
}

export type V4OrderKind =
  | "first_big_loc"    // 첫매수 큰수 LOC (ΔT 가중 1)
  | "loc_star_half"    // 전반 ½회분 @매수점 (0.5)
  | "loc_avg_half"     // 전반 ½회분 @평단 (0.5)
  | "loc_star_full"    // 후반 전액 @매수점 (1)
  | "sell_loc_star"    // 쿼터 ¼ LOC @별지점 (체결 시 T×0.75)
  | "sell_lim_target"; // ¾ 지정가 @평단+starBase% (체결 시 T×0.25)

export interface V4Order {
  side: "BUY" | "SELL";
  kind: V4OrderKind;
  orderType: "LIMIT";
  tif: "CLS" | "DAY"; // LOC=CLS, 지정가=DAY (토스 매핑)
  price: number;
  quantity: number;
}

export interface V4Plan {
  orders: V4Order[];
  exhausted: boolean;     // T > 분할−1 → 소진모드 대상(주문 없음)
  blocked: string | null; // 주문 보류 사유(그날 스킵, 다음 폴 재시도)
}

export function computeDailyOrdersV4(s: V4State): V4Plan {
  const none = (blocked: string | null, exhausted = false): V4Plan =>
    ({ orders: [], exhausted, blocked });

  if (s.t > s.splits - 1) return none(null, true); // 소진 (N−T < 1)
  if (!(s.cash > 0)) return none("잔금 없음");
  if (s.t === 0 && s.holdingQty > 0) return none("T=0인데 기보유 존재 — 수동 정리 필요");
  if (s.t > 0 && s.holdingQty <= 0) return none("보유 0 — 사이클 완료 대상(apply 단계 처리)");

  const perBuy = s.cash / (s.splits - s.t); // 1회매수금 = 잔금/(분할−T)
  const orders: V4Order[] = [];

  if (s.t === 0) {
    // 첫매수: 큰수 LOC(종가+bigBuyPremium%). 어떤 종가든 체결되도록 위에 걸고 체결은 종가로.
    const limit = px(s.currentPrice * (1 + s.bigBuyPremium / 100));
    const qty = limit > 0 ? Math.floor(perBuy / limit) : 0;
    if (qty >= 1) {
      orders.push({ side: "BUY", kind: "first_big_loc", orderType: "LIMIT", tif: "CLS", price: limit, quantity: qty });
    }
    return { orders, exhausted: false, blocked: null };
  }

  if (!s.avgPrice || s.avgPrice <= 0) return none("평단 없음 — 체결 동기화 확인 필요");

  const star = px(s.avgPrice * (1 + starPct(s.t, s.splits, s.starBase) / 100)); // 별지점 = 매도점
  const buyPoint = px(star - 0.01); // 매수점 (1센트 아래)

  // ── 매수 (전부 LOC) ──
  if (s.t < s.splits / 2) {
    // 전반전: ½ 별지점(매수점) + ½ 평단
    const half = perBuy / 2;
    const qStar = buyPoint > 0 ? Math.floor(half / buyPoint) : 0;
    if (qStar >= 1) orders.push({ side: "BUY", kind: "loc_star_half", orderType: "LIMIT", tif: "CLS", price: buyPoint, quantity: qStar });
    const qAvg = Math.floor(half / s.avgPrice);
    if (qAvg >= 1) orders.push({ side: "BUY", kind: "loc_avg_half", orderType: "LIMIT", tif: "CLS", price: px(s.avgPrice), quantity: qAvg });
  } else {
    // 후반전: 전액 매수점(평단 이하)
    const qStar = buyPoint > 0 ? Math.floor(perBuy / buyPoint) : 0;
    if (qStar >= 1) orders.push({ side: "BUY", kind: "loc_star_full", orderType: "LIMIT", tif: "CLS", price: buyPoint, quantity: qStar });
  }

  // ── 매도 (전·후반 공통 2단, 반올림은 v2.2 관행: 쿼터 floor + 나머지 지정가) ──
  const qQuarter = Math.floor(s.holdingQty * 0.25);
  const qLim = s.holdingQty - qQuarter;
  if (qQuarter >= 1) orders.push({ side: "SELL", kind: "sell_loc_star", orderType: "LIMIT", tif: "CLS", price: star, quantity: qQuarter });
  if (qLim >= 1) orders.push({ side: "SELL", kind: "sell_lim_target", orderType: "LIMIT", tif: "DAY", price: px(s.avgPrice * (1 + s.starBase / 100)), quantity: qLim });

  return { orders, exhausted: false, blocked: null };
}
