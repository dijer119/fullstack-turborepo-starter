import { describe, expect, it } from "vitest";
import { liveProfitEntries, simulationProfitEntries, performanceBuckets, type ProfitRecord } from "./performance";
const strategy = { id: "s", name: "종목", symbol: "005930", market: "KR" };
const config = { ...strategy, market: "KR" as const, source: "manual" as const, initialCash: 1000, trancheBudget: 100, maxTranches: 3, buyDropPct: 10, takeProfitPct: 10, feePct: 0, sellTaxPct: 0 };
const lot = { id: "lot", slot: 1, generation: 1, boughtQty: 3, boughtAmount: 300, buyFees: 3, buyTax: 0, soldQty: 2, soldAmount: 240, sellFees: 2, sellTax: 1, strategy };
const record = (date: string, cost: number, pnl: number): ProfitRecord => ({ id: date, strategyId: "s", name: "종목", symbol: "005930", market: "KR", mode: "live", date, cost, pnl, proceeds: cost + pnl, quantity: 1 });
describe("분할매매 기간별 실현 수익", () => {
  it("부분 매도 원가와 비용을 반영하고 한국시간 주문일에 귀속한다", () => {
    const entries = liveProfitEntries([{ ...lot, orders: [
      { id: "a", createdAt: new Date("2026-10-31T14:59:59Z"), filledQty: 1, filledAmount: 120, commission: 1, tax: 0.5 },
      { id: "b", createdAt: new Date("2026-10-31T15:00:00Z"), filledQty: 1, filledAmount: 120, commission: 1, tax: 0.5 },
    ] }]);
    expect(entries.map(e => e.date)).toEqual(["2026-10-31", "2026-11-01"]);
    expect(entries.map(e => [e.cost, e.pnl])).toEqual([[101, 17.5], [101, 17.5]]);
  });
  it("수익률을 단순 평균하지 않고 기간 원가로 가중하며 다른 통화·장부를 섞지 않는다", () => {
    const entries = [record("2026-01-01", 100, 10), record("2026-01-02", 900, -45), { ...record("2026-01-03", 100, 999), market: "US" }, { ...record("2026-01-04", 100, 999), mode: "simulation" as const }];
    const buckets = performanceBuckets(entries, { mode: "live", market: "KR", year: 2026, month: null, strategyId: "all" });
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toMatchObject({ cost: 1000, pnl: -35, returnPct: -3.5, count: 2 });
    expect(buckets[1]).toMatchObject({ pnl: 0, returnPct: null, count: 0 });
  });
  it("윤년 일수와 종목 필터를 적용한다", () => {
    const buckets = performanceBuckets([record("2024-02-29", 100, 10)], { mode: "live", market: "KR", year: 2024, month: 2, strategyId: "s" });
    expect(buckets).toHaveLength(29);
    expect(buckets[28].pnl).toBe(10);
    expect(performanceBuckets([record("2024-02-29", 100, 10)], { mode: "live", market: "KR", year: 2024, month: 2, strategyId: "other" })[28].pnl).toBe(0);
  });
  it("모의 closedStep을 실행 날짜로 연결하고 과거 회차도 포함한다", () => {
    const entries = simulationProfitEntries([{ ...strategy, config, stepCount: 5, lots: [
      { id: "l1", closedStep: 3, quantity: 1, buyCost: 90, realizedPnl: 9 },
      { id: "l2", closedStep: 5, quantity: 1, buyCost: 80, realizedPnl: 8 },
      { id: "open", closedStep: null, quantity: 1, buyCost: 100, realizedPnl: 0 },
    ], runs: [
      { inputJson: '{"prices":[100,90,99]}', createdAt: new Date("2026-01-01T00:00:00Z") },
      { inputJson: '{"prices":[80,88]}', createdAt: new Date("2026-02-01T00:00:00Z") },
    ] }]);
    expect(entries.map(e => [e.date, e.pnl])).toEqual([["2026-01-01", 9], ["2026-02-01", 8]]);
  });
  it("주문·실행 이력이 누락된 손익을 임의 날짜에 배정하지 않는다", () => {
    expect(liveProfitEntries([{ ...lot, orders: [] }])[0]).toMatchObject({ date: null, cost: 202, pnl: 35 });
    expect(simulationProfitEntries([{ ...strategy, config, stepCount: 1, lots: [{ id: "l", closedStep: 1, quantity: 1, buyCost: 100, realizedPnl: 10 }], runs: [] }])[0].date).toBeNull();
  });
  it("앞선 실행 누락으로 남은 가격 범위가 닫힌 단계를 포함해도 날짜를 배정하지 않는다", () => {
    const entries = simulationProfitEntries([{ ...strategy, config, stepCount: 6, lots: [{ id: "l", closedStep: 3, quantity: 1, buyCost: 90, realizedPnl: 9 }], runs: [
      { inputJson: '{"prices":[95,90]}', createdAt: new Date("2026-02-01T00:00:00Z") },
      { inputJson: '{"prices":[100,110]}', createdAt: new Date("2026-03-01T00:00:00Z") },
    ] }]);
    expect(entries[0].date).toBeNull();
  });
  it("전량 청산 뒤 미처리 가격이 남아도 유효한 실행일을 복원한다", () => {
    const entries = simulationProfitEntries([{ ...strategy, config, stepCount: 2, lots: [{ id: "l", closedStep: 2, quantity: 1, buyCost: 100, realizedPnl: 10 }], runs: [
      { inputJson: '{"prices":[100,110,120,130]}', createdAt: new Date("2026-02-01T00:00:00Z") },
    ] }]);
    expect(entries[0].date).toBe("2026-02-01");
  });

});
