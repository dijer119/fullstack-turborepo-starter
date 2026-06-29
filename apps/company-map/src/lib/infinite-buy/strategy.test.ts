import { describe, it, expect } from "vitest";
import { computeDailyOrders, type CycleState } from "./strategy";

const base: CycleState = {
  round: 0, splits: 40, principalUsd: 4000,
  profitTarget: 10, bigBuyPremium: 12, lossCut: 10,
  avgPrice: null, currentPrice: 50, holdingQty: 0, pnlPct: null,
};

describe("computeDailyOrders", () => {
  it("1회차: 장중 MARKET 매수로 시작", () => {
    const p = computeDailyOrders(base);
    expect(p.orders).toEqual([
      { side: "BUY", kind: "first_market", orderType: "MARKET", tif: "DAY", price: null, quantity: 2 },
    ]); // dailyAmount=4000/40=100, floor(100/50)=2
    expect(p.nextRound).toBe(1);
    expect(p.resetAfter).toBe(false);
  });

  it("2회차+: LOC 평단 + LOC 큰수 매수 + 목표 매도", () => {
    const p = computeDailyOrders({
      ...base, round: 1, avgPrice: 50, currentPrice: 50, holdingQty: 2,
    });
    // half=50. loc_avg: floor(50/50)=1 @50. loc_big: 50*1.12=56 → floor(50/56)=0 → skip
    expect(p.orders).toEqual([
      { side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 1 },
      { side: "SELL", kind: "target_sell", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 2 },
    ]);
    expect(p.nextRound).toBe(2);
  });

  it("2회차+: 큰수 매수도 수량 확보되면 포함", () => {
    const p = computeDailyOrders({
      ...base, round: 1, principalUsd: 8000, avgPrice: 50, currentPrice: 50, holdingQty: 2,
    });
    // dailyAmount=200, half=100. loc_avg floor(100/50)=2 @50. big 56 → floor(100/56)=1 @56
    const kinds = p.orders.map((o) => o.kind);
    expect(kinds).toEqual(["loc_avg", "loc_big", "target_sell"]);
    expect(p.orders[1]).toMatchObject({ kind: "loc_big", price: 56, quantity: 1, tif: "CLS" });
  });

  it("소진 후 보유 0: 익절 완료로 리셋", () => {
    const p = computeDailyOrders({ ...base, round: 40, holdingQty: 0, avgPrice: null });
    expect(p.orders).toEqual([]);
    expect(p.resetAfter).toBe(true);
  });

  it("소진 후 -10% 이하: MARKET 전량 손절 + 리셋", () => {
    const p = computeDailyOrders({
      ...base, round: 40, avgPrice: 50, currentPrice: 44, holdingQty: 80, pnlPct: -12,
    });
    expect(p.orders).toEqual([
      { side: "SELL", kind: "reset_sell", orderType: "MARKET", tif: "DAY", price: null, quantity: 80 },
    ]);
    expect(p.resetAfter).toBe(true);
  });

  it("소진 후 -10~+10%: 목표 매도만 유지", () => {
    const p = computeDailyOrders({
      ...base, round: 40, avgPrice: 50, currentPrice: 51, holdingQty: 80, pnlPct: 2,
    });
    expect(p.orders).toEqual([
      { side: "SELL", kind: "target_sell", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 80 },
    ]);
    expect(p.resetAfter).toBe(false);
  });
});
