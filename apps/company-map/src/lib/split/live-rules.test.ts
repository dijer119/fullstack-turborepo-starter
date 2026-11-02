import { describe, expect, it } from "vitest";
import {
  planLiveOrder,
  lotTotals,
  validateExecution,
  type LiveLot,
  type LiveConfig,
} from "./live-rules";

const config: LiveConfig = {
  market: "US",
  trancheBudget: 100,
  maxTranches: 3,
  buyDropPct: 10,
  takeProfitPct: 10,
  feeBufferPct: 1,
};
const lot = (slot: number, price: number, qty = 10): LiveLot => ({
  id: String(slot),
  slot,
  generation: 1,
  boughtQty: qty,
  boughtAmount: qty * price,
  buyFees: 1,
  buyTax: 0,
  soldQty: 0,
  soldAmount: 0,
  sellFees: 0,
  sellTax: 0,
});

describe("실거래 차수 규칙", () => {
  it("차수별 금액·매수 간격·익절률을 재진입에도 적용한다", () => {
    const c = { ...config, feeBufferPct: 0, tranches: [
      { budget: 100, buyDropPct: null, takeProfitPct: 12 },
      { budget: 240, buyDropPct: 20, takeProfitPct: 5 },
      { budget: 300, buyDropPct: 25, takeProfitPct: 7 },
    ] };
    expect(planLiveOrder(c, [lot(1, 10)], 9, 1000)).toBeNull();
    expect(planLiveOrder(c, [lot(1, 10)], 8, 1000)).toMatchObject({ side: "BUY", slot: 2, quantity: 30 });
    expect(planLiveOrder(c, [lot(1, 10), lot(2, 8)], 8.4, 0)).toMatchObject({ side: "SELL", slot: 2 });
    expect(planLiveOrder(c, [lot(1, 10)], 11, 0)).toBeNull();
    expect(planLiveOrder(c, [lot(1, 10), lot(2, 8)], 6, 1000)).toMatchObject({ slot: 3, quantity: 50 });
    expect(planLiveOrder(c, [lot(1, 10), { ...lot(2, 8), soldQty: 10 }], 8, 1000)).toMatchObject({ slot: 2, generation: 2, quantity: 30 });
    expect(planLiveOrder(c, [lot(1, 10)], 8, 80)).toMatchObject({ quantity: 10 });
  });
  it("1차는 별도 익절률을 쓰고 재진입 회차에서도 유지한다", () => {
    const c = { ...config, firstTakeProfitPct: 5, takeProfitPct: 20 };
    expect(planLiveOrder(c, [lot(1, 100)], 104.99, 0)).toBeNull();
    expect(planLiveOrder(c, [lot(1, 100)], 105, 0)).toMatchObject({ side: "SELL", slot: 1 });
    expect(planLiveOrder(c, [{ ...lot(1, 100), generation: 2 }], 105, 0)).toMatchObject({ side: "SELL", slot: 1, generation: 2 });
    expect(planLiveOrder(c, [lot(2, 100)], 105, 0)).toBeNull();
    expect(planLiveOrder(c, [lot(2, 100)], 120, 0)).toMatchObject({ side: "SELL", slot: 2 });
    expect(planLiveOrder({ ...c, firstTakeProfitPct: 15 }, [lot(1, 100)], 110, 0)).toBeNull();
  });
  it.each([["geometric", 49], ["linear", 37]])("%s 배수는 실제 3차 매수 수량에 반영한다", (budgetMode, quantity) => {
    const c = { ...config, budgetMode: String(budgetMode), budgetMultiplier: 2, feeBufferPct: 0 };
    expect(planLiveOrder(c, [lot(1, 10), lot(2, 9, 5)], 8.1, 1000)).toMatchObject({ slot: 3, quantity });
    const closed = { ...lot(3, 8.1), soldQty: 10 };
    expect(planLiveOrder(c, [lot(1, 10), lot(2, 9), closed], 8.1, 1000)).toMatchObject({ slot: 3, generation: 2, quantity });
    expect(planLiveOrder(c, [{ ...lot(1, 10), soldQty: 10 }, closed], 10, 1000)).toMatchObject({ slot: 1, generation: 2, quantity: 10 });
    expect(planLiveOrder(c, [lot(1, 10), lot(2, 9)], 8.1, 81)).toMatchObject({ slot: 3, quantity: 10 });
  });
  it("첫 진입은 비용 여유액 포함 정수주 지정가로 계산한다", () => {
    expect(planLiveOrder(config, [], 10, 300)).toMatchObject({
      side: "BUY",
      slot: 1,
      quantity: 9,
      price: 10,
    });
  });
  it("독립 익절을 우선하고 높은 차수를 먼저 판다", () => {
    expect(
      planLiveOrder(config, [lot(1, 10), lot(2, 9), lot(3, 8.1)], 11, 0),
    ).toMatchObject({ side: "SELL", lotId: "3", quantity: 10 });
  });
  it("청산한 하위 차수는 새 회차로 재진입한다", () => {
    const closed = { ...lot(3, 8.1), soldQty: 10, soldAmount: 89.1 };
    expect(
      planLiveOrder(config, [lot(1, 10), lot(2, 9), closed], 8.1, 200),
    ).toMatchObject({ side: "BUY", slot: 3, generation: 2 });
  });
  it("매도가격은 올림·매수가격은 내림하고 미국 가격 자릿수를 지킨다", () => {
    expect(planLiveOrder(config, [], 10.1299, 100)?.price).toBe(10.12);
    expect(planLiveOrder(config, [lot(1, 8)], 10.1299, 100)?.price).toBe(10.13);
    expect(planLiveOrder(config, [], 0.1234, 100)?.price).toBe(0.1234);
  });
  it("부분 매도 원가를 비례 배분하고 실제 누적 비용을 반영한다", () => {
    expect(
      lotTotals({
        ...lot(1, 10),
        soldQty: 4,
        soldAmount: 44,
        sellFees: 0.1,
        sellTax: 0.2,
      }),
    ).toEqual({
      remainingQty: 6,
      buyPrice: 10,
      cost: 101,
      remainingCost: 60.6,
      realizedPnl: 3.3,
    });
  });
  it("전량 익절 후 기존 차수 예산으로 새 1차 회차를 만든다", () => {
    expect(
      planLiveOrder(config, [{ ...lot(1, 10), soldQty: 10 }], 11, 310),
    ).toMatchObject({ side: "BUY", slot: 1, generation: 2, quantity: 9, price: 11 });
    expect(planLiveOrder(config, [{ ...lot(1, 10), soldQty: 10 }], 110, 310)).toBeNull();
  });
  it("누적 체결 감소·초과·누락 비용은 장부에 반영하지 않는다", () => {
    const previous = { filledQty: 2, filledAmount: 20, commission: 0, tax: 0 };
    expect(() =>
      validateExecution(10, previous, { ...previous, filledQty: 1 }),
    ).toThrow();
    expect(() =>
      validateExecution(10, previous, { ...previous, filledQty: 11 }),
    ).toThrow();
    expect(() =>
      validateExecution(10, previous, { ...previous, commission: null }),
    ).toThrow();
    expect(
      validateExecution(10, previous, {
        ...previous,
        filledQty: 3,
        filledAmount: 30,
        commission: 0.1,
      }),
    ).toEqual({ qty: 1, amount: 10, fees: 0.1, tax: 0 });
  });
});
