import { describe, it, expect } from "vitest";
import { computeDailyOrdersV4, starPct, px, type V4State } from "./strategy-v4";

// 부록 A 앵커: $10,000 · 40분할 · TQQQ(base 15) · 평단 $50
const base: V4State = {
  t: 0, splits: 40, cash: 10000, starBase: 15, bigBuyPremium: 12,
  avgPrice: null, currentPrice: 50, holdingQty: 0,
};
const buys = (p: { orders: { side: string }[] }) => p.orders.filter((o) => o.side === "BUY");
const sells = (p: { orders: { side: string }[] }) => p.orders.filter((o) => o.side === "SELL");

describe("starPct / px", () => {
  it("별% = base×(1−2T/분할): 검증점 T=1→14.25, T=20→0, T=39→−14.25", () => {
    expect(starPct(1, 40, 15)).toBeCloseTo(14.25, 10);
    expect(starPct(20, 40, 15)).toBeCloseTo(0, 10);
    expect(starPct(39, 40, 15)).toBeCloseTo(-14.25, 10);
  });
  it("SOXL 20분할 원문 예: T=8.6 → 2.8%", () => {
    expect(starPct(8.6, 20, 20)).toBeCloseTo(2.8, 10);
  });
  it("px: 반올림 소수 2자리", () => {
    expect(px(57.125)).toBe(57.13);
    expect(px(42.875)).toBe(42.88);
  });
});

describe("computeDailyOrdersV4 매수", () => {
  it("첫매수(T=0, 보유0): 큰수 LOC 종가+12%, 수량 floor(1회금/리밋)", () => {
    const p = computeDailyOrdersV4(base);
    // perBuy=10000/40=250, limit=px(50*1.12)=56.00, floor(250/56)=4
    expect(p.orders).toEqual([
      { side: "BUY", kind: "first_big_loc", orderType: "LIMIT", tif: "CLS", price: 56, quantity: 4 },
    ]);
    expect(p.exhausted).toBe(false);
    expect(p.blocked).toBeNull();
  });

  it("전반전(T=1): ½ @매수점(별지점−0.01) + ½ @평단, 부록 A 수치", () => {
    const p = computeDailyOrdersV4({ ...base, t: 1, cash: 9750, avgPrice: 50, holdingQty: 4 });
    // perBuy=9750/39=250, half=125. 별지점=px(50×1.1425)=57.13, 매수점=57.12
    // qStar=floor(125/57.12)=2, qAvg=floor(125/50)=2
    expect(buys(p)).toEqual([
      { side: "BUY", kind: "loc_star_half", orderType: "LIMIT", tif: "CLS", price: 57.12, quantity: 2 },
      { side: "BUY", kind: "loc_avg_half", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 2 },
    ]);
  });

  it("후반전 시작(T=20): 별%=0 → 매수점=평단−0.01, 전액 1건", () => {
    const p = computeDailyOrdersV4({ ...base, t: 20, cash: 5000, avgPrice: 50, holdingQty: 40 });
    // perBuy=5000/20=250, 별지점=50.00, 매수점=49.99, floor(250/49.99)=5
    expect(buys(p)).toEqual([
      { side: "BUY", kind: "loc_star_full", orderType: "LIMIT", tif: "CLS", price: 49.99, quantity: 5 },
    ]);
  });

  it("소진 직전(T=39): 별%=−14.25 → 매수점 42.87, 잔금 전액", () => {
    const p = computeDailyOrdersV4({ ...base, t: 39, cash: 250, avgPrice: 50, holdingQty: 100 });
    // perBuy=250/1=250, 별지점=px(50×0.8575)=42.88, 매수점=42.87, floor(250/42.87)=5
    const star = buys(p).find((o) => o.kind === "loc_star_full");
    expect(star).toEqual({ side: "BUY", kind: "loc_star_full", orderType: "LIMIT", tif: "CLS", price: 42.87, quantity: 5 });
  });

  it("연속 T(소수)도 동작: SOXL 20분할 T=8.6 원문 예 — 별지점 39.37/매수점 39.36", () => {
    const p = computeDailyOrdersV4({
      t: 8.6, splits: 20, cash: 2280, starBase: 20, bigBuyPremium: 12,
      avgPrice: 38.3, currentPrice: 39, holdingQty: 8,
    });
    // perBuy=2280/11.4=200, half=100 → qStar=floor(100/39.36)=2, qAvg=floor(100/38.30)=2
    expect(buys(p)).toEqual([
      { side: "BUY", kind: "loc_star_half", orderType: "LIMIT", tif: "CLS", price: 39.36, quantity: 2 },
      { side: "BUY", kind: "loc_avg_half", orderType: "LIMIT", tif: "CLS", price: 38.3, quantity: 2 },
    ]);
  });
});

describe("computeDailyOrdersV4 매도 (전·후반 공통 2단)", () => {
  it("¼ floor @별지점 LOC + 나머지 @평단+base% 지정가, 합계=보유", () => {
    const p = computeDailyOrdersV4({ ...base, t: 1, cash: 9750, avgPrice: 50, holdingQty: 4 });
    expect(sells(p)).toEqual([
      { side: "SELL", kind: "sell_loc_star", orderType: "LIMIT", tif: "CLS", price: 57.13, quantity: 1 },
      { side: "SELL", kind: "sell_lim_target", orderType: "LIMIT", tif: "DAY", price: 57.5, quantity: 3 },
    ]);
  });

  it("후반전 매도: 별지점이 평단 아래(부분 손절 성격)", () => {
    const p = computeDailyOrdersV4({ ...base, t: 28, cash: 3000, avgPrice: 50, holdingQty: 40 });
    // 별%=15−0.75×28=−6 → 별지점 47.00
    expect(sells(p)).toEqual([
      { side: "SELL", kind: "sell_loc_star", orderType: "LIMIT", tif: "CLS", price: 47, quantity: 10 },
      { side: "SELL", kind: "sell_lim_target", orderType: "LIMIT", tif: "DAY", price: 57.5, quantity: 30 },
    ]);
  });

  it("보유 3주: 쿼터 floor(0.75)=0 생략, 지정가 3주만", () => {
    const p = computeDailyOrdersV4({ ...base, t: 2, cash: 9500, avgPrice: 50, holdingQty: 3 });
    expect(sells(p)).toEqual([
      { side: "SELL", kind: "sell_lim_target", orderType: "LIMIT", tif: "DAY", price: 57.5, quantity: 3 },
    ]);
  });
});

describe("computeDailyOrdersV4 경계·가드", () => {
  it("T > 분할−1: 소진 — 주문 없음 + exhausted", () => {
    const p = computeDailyOrdersV4({ ...base, t: 39.5, cash: 100, avgPrice: 50, holdingQty: 100 });
    expect(p.orders).toEqual([]);
    expect(p.exhausted).toBe(true);
  });
  it("T=0인데 기보유 존재: blocked", () => {
    const p = computeDailyOrdersV4({ ...base, holdingQty: 5 });
    expect(p.orders).toEqual([]);
    expect(p.blocked).toMatch(/기보유/);
  });
  it("T>0인데 보유 0: blocked (완료 판정은 apply 단계 책임)", () => {
    const p = computeDailyOrdersV4({ ...base, t: 3, cash: 9000, avgPrice: null, holdingQty: 0 });
    expect(p.blocked).toMatch(/보유 0/);
  });
  it("잔금 0 이하: blocked", () => {
    const p = computeDailyOrdersV4({ ...base, t: 5, cash: 0, avgPrice: 50, holdingQty: 10 });
    expect(p.blocked).toMatch(/잔금/);
  });
  it("T>0인데 평단 없음: blocked", () => {
    const p = computeDailyOrdersV4({ ...base, t: 5, cash: 9000, avgPrice: 0, holdingQty: 10 });
    expect(p.blocked).toMatch(/평단/);
  });
});
