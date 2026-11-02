import { describe, expect, it } from "vitest";
import { getBudgetSchedule, getTrancheBudget } from "./budget";

const config = { market: "KR", trancheBudget: 100000, maxTranches: 10 };

describe("차수별 예산", () => {
  it.each([
    ["fixed", 1000000, 100000],
    ["geometric", 102300000, 51200000],
    ["linear", 5500000, 1000000],
  ])("%s 방식의 전체 계획 금액을 합산한다", (budgetMode, total, last) => {
    const result = getBudgetSchedule({ ...config, budgetMode, budgetMultiplier: 2 });
    expect(result.budgets).toHaveLength(10);
    expect(result.budgets[0]).toBe(100000);
    expect(result.budgets[9]).toBe(last);
    expect(result.total).toBe(total);
  });
  it("1.5배에서 누적 방식과 일정 증가 방식을 구분한다", () => {
    const c = { ...config, maxTranches: 3, budgetMultiplier: 1.5 };
    expect(getBudgetSchedule({ ...c, budgetMode: "geometric" }).budgets).toEqual([100000, 150000, 225000]);
    expect(getBudgetSchedule({ ...c, budgetMode: "linear" }).budgets).toEqual([100000, 150000, 200000]);
  });
  it.each([undefined, "fixed", "geometric", "linear"])("%s의 1배는 기존 소수 예산을 보존한다", (budgetMode) => {
    const c = { market: "US", trancheBudget: 1.155, maxTranches: 3, budgetMode, budgetMultiplier: 1 };
    expect(getBudgetSchedule(c)).toEqual({ budgets: [1.155, 1.155, 1.155], total: 3.465 });
  });
  it("증가 예산을 원·센트 단위로 정확히 내림하고 내린 금액의 합계를 쓴다", () => {
    const c = { trancheBudget: 1.15, maxTranches: 3, budgetMode: "geometric", budgetMultiplier: 1.1 };
    expect(getBudgetSchedule({ ...c, market: "US" })).toEqual({ budgets: [1.15, 1.26, 1.39], total: 3.8 });
    expect(getBudgetSchedule({ ...c, market: "KR", trancheBudget: 101, budgetMultiplier: 1.01 })).toEqual({ budgets: [101, 102, 103], total: 306 });
    expect(getTrancheBudget({ ...c, market: "US", trancheBudget: 1, budgetMultiplier: 1.15 }, 2)).toBe(1.15);
    expect(getTrancheBudget({ ...c, market: "US", trancheBudget: 0.1, budgetMultiplier: 1.01 }, 2)).toBe(0.1);
  });
  it.each([
    { budgetMode: "unknown" }, { budgetMode: null }, { budgetMultiplier: null },
    { budgetMultiplier: 0 }, { budgetMultiplier: -1 }, { budgetMultiplier: NaN },
    { budgetMultiplier: Infinity }, { budgetMultiplier: 1.001 },
    { budgetMultiplier: 1e100 }, { trancheBudget: NaN }, { trancheBudget: 0 },
    { trancheBudget: 1.00001 }, { trancheBudget: 1e11 }, { market: "OTHER" },
    { maxTranches: 0 }, { maxTranches: 51 }, { maxTranches: 1.5 },
    { budgetMode: "geometric", budgetMultiplier: 100, maxTranches: 50 },
    { trancheBudget: 1e10, maxTranches: 2 },
  ])("잘못된 설정을 거절한다 %j", (patch) => {
    expect(() => getBudgetSchedule({ ...config, ...patch } as typeof config)).toThrow();
  });
  it("차수 0과 정수 아닌 차수를 거절한다", () => {
    expect(() => getTrancheBudget(config, 0)).toThrow();
    expect(() => getTrancheBudget(config, 1.5)).toThrow();
  });
});
