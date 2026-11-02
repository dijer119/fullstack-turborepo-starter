import { describe, expect, it } from "vitest";
import { advanceSimulation, initialState, type SplitConfig } from "./engine";
import { liveChart, simulationChart, tradeChartPoints, trancheChartLevels } from "./chart";

const config: SplitConfig = { symbol: "005930", name: "테스트", market: "KR", source: "manual", initialCash: 300000, trancheBudget: 100000, maxTranches: 3, buyDropPct: 10, takeProfitPct: 10, feePct: 0, sellTaxPct: 0 };
describe("진행 현황 차트", () => {
  it("차수 기준선은 실제 매수한 차수만 포함하고 최근 회차의 부분 체결을 가중 평균한다", () => {
    const base = { id: "b", x: 1, side: "BUY" as const, slot: 1, generation: 1, price: 100, quantity: 1, label: "" };
    const result = trancheChartLevels([
      base,
      { ...base, id: "old", slot: 2, price: 90 },
      { ...base, id: "new-a", slot: 2, generation: 2, price: 80, quantity: 2 },
      { ...base, id: "new-b", slot: 2, generation: 2, price: 83, quantity: 1 },
      { ...base, id: "sold", side: "SELL", slot: 2, generation: 2, price: 95, quantity: 3 },
    ]);
    expect(result).toEqual([{ slot: 1, price: 100 }, { slot: 2, price: 81 }]);
    expect(trancheChartLevels([])).toEqual([]);
  });
  it("실거래는 지정 주문가 대신 평균 체결가와 한국시간 주문일을 사용하고 미체결은 제외한다", () => {
    const order = { id: "buy", side: "BUY", createdAt: new Date("2026-10-30T16:00:00Z"), filledQty: 2, filledAmount: 202, lot: { slot: 2, generation: 3 } };
    const result = liveChart([order, { ...order, id: "empty", filledQty: 0, filledAmount: 0 }, { ...order, id: "sell", side: "SELL", filledQty: 1, filledAmount: 110 }]);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({ x: Date.UTC(2026, 9, 31), price: 101, quantity: 2, slot: 2, generation: 3 });
  });
  it("모의 경로는 재진입과 같은 관측에서의 복수 매도를 각각 보존한다", () => {
    const prices = [10000, 9000, 8100, 8910, 8100, 11000, 9999];
    const state = prices.reduce((s, p) => advanceSimulation(config, s, p), initialState(config));
    const result = simulationChart(state.lots);
    expect(result.trades.filter(t => t.x === 6 && t.side === "SELL")).toHaveLength(3);
    expect(result.trades.find(t => t.side === "BUY" && t.generation === 2)).toMatchObject({ slot: 3, x: 5, quantity: 12 });
    expect(tradeChartPoints(result.trades).filter(p => p.side === "SELL")).toHaveLength(4);
  });
  it("무거래 관측을 생략하고 체결 지점만 동일한 간격으로 연결한다", () => {
    const state = [10000, 9999, 9998, 9997, 9000].reduce((s, p) => advanceSimulation(config, s, p), initialState(config));
    const result = tradeChartPoints(simulationChart(state.lots).trades);
    expect(result.map(p => [p.x, p.price])).toEqual([[1, 10000], [2, 9000]]);
    expect(result[1].trades[0].label).toBe("관측 #5");
  });
  it("같은 날 같은 가격의 매수·매도·재매수도 순서대로 별도 표시한다", () => {
    const order = { id: "b", side: "BUY", createdAt: new Date("2026-10-30T00:00:00Z"), filledQty: 2, filledAmount: 200, lot: { slot: 1, generation: 1 } };
    const result = tradeChartPoints(liveChart([order, { ...order, id: "s", side: "SELL" }, { ...order, id: "b2" }]).trades);
    expect(result.map(p => [p.x, p.side])).toEqual([[1, "BUY"], [2, "SELL"], [3, "BUY"]]);
    expect(tradeChartPoints([])).toEqual([]);
  });
});
