import { describe, it, expect } from "vitest";
import { computeDailyOrdersV22, type V22Order } from "./strategy-v22";
import type { CycleState } from "./strategy";

const base: CycleState = {
  round: 0, splits: 40, principalUsd: 8000,
  profitTarget: 10, bigBuyPremium: 12, lossCut: 10,
  avgPrice: null, currentPrice: 50, holdingQty: 0, pnlPct: null,
};
const buys = (p: { orders: V22Order[] }) => p.orders.filter((o) => o.side === "BUY");
const sells = (p: { orders: V22Order[] }) => p.orders.filter((o) => o.side === "SELL");

describe("computeDailyOrdersV22 매수", () => {
  it("1회차: 시장가 매수로 시작", () => {
    const p = computeDailyOrdersV22(base);
    expect(p.orders).toEqual([
      { side: "BUY", kind: "first_market", orderType: "MARKET", tif: "DAY", price: null, quantity: 4 },
    ]); // daily=200, floor(200/50)=4
    expect(p.nextRound).toBe(1);
  });

  it("전반전(T=10) 매수: 0.5회 평단 LOC + 0.5회 (10−T/2)%=+5% LOC", () => {
    const p = computeDailyOrdersV22({ ...base, round: 10, avgPrice: 50, currentPrice: 50, holdingQty: 100 });
    // daily=200 half=100. 평단 floor(100/50)=2 @50. var=50*1.05=52.5 → floor(100/52.5)=1 @52.5
    expect(buys(p)).toEqual([
      { side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 2 },
      { side: "BUY", kind: "loc_var", orderType: "LIMIT", tif: "CLS", price: 52.5, quantity: 1 },
    ]);
  });

  it("전반전 큰수 상한: 현재가+15%가 (10−T/2)%보다 낮으면 그걸로 캡", () => {
    // T=1 → +9.5% → 평단 50*1.095=54.75. 현재가40 → cap 46. min=46
    const p = computeDailyOrdersV22({ ...base, round: 1, avgPrice: 50, currentPrice: 40, holdingQty: 100 });
    const big = buys(p).find((o) => o.kind === "loc_var");
    expect(big?.price).toBe(46); // 54.75가 아니라 현재가+15% 캡
  });

  it("후반전(T=20) 매수: 1회 전액 @ (10−T/2)%=0%(평단) LOC, 평단 leg 없음", () => {
    const p = computeDailyOrdersV22({ ...base, round: 20, avgPrice: 50, currentPrice: 50, holdingQty: 200 });
    // T=20 → 0% → 50. floor(200/50)=4
    expect(buys(p)).toEqual([
      { side: "BUY", kind: "loc_var", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 4 },
    ]);
  });

  it("후반전 깊음(T=30) 매수: (10−T/2)%=−5% → 평단 아래에서만", () => {
    const p = computeDailyOrdersV22({ ...base, round: 30, avgPrice: 50, currentPrice: 50, holdingQty: 100 });
    // T=30 → -5% → 47.5. floor(200/47.5)=4
    expect(buys(p)).toEqual([
      { side: "BUY", kind: "loc_var", orderType: "LIMIT", tif: "CLS", price: 47.5, quantity: 4 },
    ]);
  });
});

describe("computeDailyOrdersV22 매도 (전/후반 무관 2단 통일)", () => {
  it("T=10: 1/4 LOC @+5% + 3/4 지정가 @+10%", () => {
    const p = computeDailyOrdersV22({ ...base, round: 10, avgPrice: 50, currentPrice: 50, holdingQty: 100 });
    expect(sells(p)).toEqual([
      { side: "SELL", kind: "sell_loc_var", orderType: "LIMIT", tif: "CLS", price: 52.5, quantity: 25 },
      { side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 75 },
    ]);
  });

  it("T=20: 1/4 LOC @평단(0%) + 3/4 지정가 @+10%", () => {
    const p = computeDailyOrdersV22({ ...base, round: 20, avgPrice: 50, currentPrice: 50, holdingQty: 200 });
    expect(sells(p)).toEqual([
      { side: "SELL", kind: "sell_loc_var", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 50 },
      { side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 150 },
    ]);
  });

  it("T=30: 1/4 LOC @−5% + 3/4 지정가 @+10%", () => {
    const p = computeDailyOrdersV22({ ...base, round: 30, avgPrice: 50, currentPrice: 50, holdingQty: 100 });
    expect(sells(p)).toEqual([
      { side: "SELL", kind: "sell_loc_var", orderType: "LIMIT", tif: "CLS", price: 47.5, quantity: 25 },
      { side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 75 },
    ]);
  });

  it("정수 반올림: 합계는 항상 보유수량 (나머지는 3/4에)", () => {
    const p = computeDailyOrdersV22({ ...base, round: 10, avgPrice: 50, currentPrice: 50, holdingQty: 7 });
    const s = sells(p);
    expect(s.reduce((a, o) => a + o.quantity, 0)).toBe(7); // 1/4=1, 3/4=6
    expect(s.find((o) => o.kind === "sell_lim_10")?.quantity).toBe(6);
  });

  it("소량 1주: +10% 지정가 1건만 (1/4=0 생략)", () => {
    const p = computeDailyOrdersV22({ ...base, round: 10, avgPrice: 50, currentPrice: 50, holdingQty: 1 });
    expect(sells(p)).toEqual([
      { side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 1 },
    ]);
  });
});

describe("computeDailyOrdersV22 소진 후 (v1과 동일)", () => {
  it("−10% 이하: 시장가 전량 손절 + 리셋", () => {
    const p = computeDailyOrdersV22({ ...base, round: 40, avgPrice: 50, currentPrice: 44, holdingQty: 80, pnlPct: -12 });
    expect(p.orders).toEqual([
      { side: "SELL", kind: "reset_sell", orderType: "MARKET", tif: "DAY", price: null, quantity: 80 },
    ]);
    expect(p.resetAfter).toBe(true);
  });

  it("보유 0: 익절 완료로 리셋", () => {
    const p = computeDailyOrdersV22({ ...base, round: 40, holdingQty: 0, avgPrice: null });
    expect(p.orders).toEqual([]);
    expect(p.resetAfter).toBe(true);
  });

  it("사이클 중간 보유 0(익절 체결): 주문 없이 리셋해 재시작 준비", () => {
    const p = computeDailyOrdersV22({ ...base, round: 6, holdingQty: 0, avgPrice: null });
    expect(p.orders).toEqual([]);
    expect(p.resetAfter).toBe(true);
  });
});
