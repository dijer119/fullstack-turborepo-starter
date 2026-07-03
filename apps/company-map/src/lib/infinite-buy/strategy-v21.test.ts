import { describe, it, expect } from "vitest";
import { computeDailyOrdersV21, type V21Order } from "./strategy-v21";
import type { CycleState } from "./strategy";

const base: CycleState = {
  round: 0, splits: 40, principalUsd: 4000,
  profitTarget: 10, bigBuyPremium: 12, lossCut: 10,
  avgPrice: null, currentPrice: 50, holdingQty: 0, pnlPct: null,
};
const kinds = (os: V21Order[]) => os.map((o) => o.kind);

describe("computeDailyOrdersV21 매수", () => {
  it("1회차: 시장가 매수로 시작", () => {
    const p = computeDailyOrdersV21(base);
    expect(p.orders).toEqual([
      { side: "BUY", kind: "first_market", orderType: "MARKET", tif: "DAY", price: null, quantity: 2 },
    ]); // daily=100, floor(100/50)=2
    expect(p.nextRound).toBe(1);
  });

  it("전반전 매수: 평단 LOC + 큰수(평단×1.05) LOC", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 1, principalUsd: 8000, avgPrice: 50, currentPrice: 50, holdingQty: 4,
    });
    // daily=200, half=100. loc_avg floor(100/50)=2 @50. capBig=52.5 → floor(100/52.5)=1 @52.5
    const buys = p.orders.filter((o) => o.side === "BUY");
    expect(buys).toEqual([
      { side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 2 },
      { side: "BUY", kind: "loc_big", orderType: "LIMIT", tif: "CLS", price: 52.5, quantity: 1 },
    ]);
  });

  it("큰수매수 상한: 현재가가 평단보다 높아도 주문가는 평단×1.05 고정", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 1, principalUsd: 8000, avgPrice: 50, currentPrice: 80, holdingQty: 4,
    });
    const big = p.orders.find((o) => o.kind === "loc_big");
    expect(big?.price).toBe(52.5); // 현재가 80과 무관
  });

  it("후반전 매수: 1회치 전액 평단 LOC (큰수 없음)", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 20, principalUsd: 8000, avgPrice: 50, currentPrice: 50, holdingQty: 100,
    });
    const buys = p.orders.filter((o) => o.side === "BUY");
    // daily=200, floor(200/50)=4 @50
    expect(buys).toEqual([
      { side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 4 },
    ]);
  });
});

describe("computeDailyOrdersV21 매도", () => {
  it("전반전 매도: 25% LOC@+5% + 75% 지정가@+10%", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 1, avgPrice: 50, currentPrice: 50, holdingQty: 100,
    });
    const sells = p.orders.filter((o) => o.side === "SELL");
    expect(sells).toEqual([
      { side: "SELL", kind: "sell_loc_5", orderType: "LIMIT", tif: "CLS", price: 52.5, quantity: 25 },
      { side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 75 },
    ]);
  });

  it("후반전 매도: 25% LOC@평단 + 25% 지정가@+5% + 50% 지정가@+10%", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 20, avgPrice: 50, currentPrice: 50, holdingQty: 200,
    });
    const sells = p.orders.filter((o) => o.side === "SELL");
    expect(sells).toEqual([
      { side: "SELL", kind: "sell_loc_0", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 50 },
      { side: "SELL", kind: "sell_lim_5", orderType: "LIMIT", tif: "DAY", price: 52.5, quantity: 50 },
      { side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 100 },
    ]);
  });

  it("정수 반올림: 합계는 항상 보유수량", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 20, avgPrice: 50, currentPrice: 50, holdingQty: 7,
    });
    const sells = p.orders.filter((o) => o.side === "SELL");
    // q0=floor(7*.25)=1, q5=floor(7*.25)=1, q10=7-1-1=5
    expect(sells.reduce((a, o) => a + o.quantity, 0)).toBe(7);
    expect(sells.find((o) => o.kind === "sell_lim_10")?.quantity).toBe(5);
  });

  it("소진 후 -10% 이하: 시장가 전량 손절 + 리셋 (v1과 동일)", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 40, avgPrice: 50, currentPrice: 44, holdingQty: 80, pnlPct: -12,
    });
    expect(p.orders).toEqual([
      { side: "SELL", kind: "reset_sell", orderType: "MARKET", tif: "DAY", price: null, quantity: 80 },
    ]);
    expect(p.resetAfter).toBe(true);
  });

  it("소진 후 보유 0: 익절 완료로 리셋", () => {
    const p = computeDailyOrdersV21({ ...base, round: 40, holdingQty: 0, avgPrice: null });
    expect(p.orders).toEqual([]);
    expect(p.resetAfter).toBe(true);
  });
});
