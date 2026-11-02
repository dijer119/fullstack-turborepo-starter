import { describe, expect, it } from "vitest";
import { getBudgetSchedule } from "./budget";
import { parseTranches, resolveTranches, validateTranches } from "./tranche-settings";

const config = { market: "KR", maxTranches: 3, trancheBudget: 100000, buyDropPct: 10, takeProfitPct: 7, firstTakeProfitPct: 5 };
const rows = resolveTranches(config);

describe("차수별 입력 검증", () => {
  it("기존 비율과 예산 방식에서 각 차수를 만든다", () => {
    expect(rows).toEqual([
      { budget: 100000, buyDropPct: null, takeProfitPct: 5 },
      { budget: 100000, buyDropPct: 10, takeProfitPct: 7 },
      { budget: 100000, buyDropPct: 10, takeProfitPct: 7 },
    ]);
    expect(resolveTranches({ ...config, firstTakeProfitPct: undefined })[0].takeProfitPct).toBe(10);
    expect(resolveTranches({ ...config, budgetMode: "geometric", budgetMultiplier: 2 }).map(r => r.budget)).toEqual([100000, 200000, 400000]);
    expect(resolveTranches({ ...config, budgetMode: "linear", budgetMultiplier: 2 }).map(r => r.budget)).toEqual([100000, 200000, 300000]);
  });
  it("개별 금액 합계는 기존 기본 예산이 아닌 실제 행을 사용한다", () => {
    expect(getBudgetSchedule({ ...config, tranches: rows.map((r, i) => ({ ...r, budget: 10000 * (i + 1) })) }).total).toBe(60000);
  });
  it.each([null, {}, [], rows.slice(1), [...rows, rows[0]], [null, rows[1], rows[2]]])("개수·구조가 잘못된 입력을 거절한다: %j", value => {
    expect(() => validateTranches(value, 3, "KR")).toThrow();
  });
  it.each([0, -1, 10000000001, NaN, Infinity, 100.5])("원화 금액 %s는 저장할 수 없다", budget => {
    expect(() => validateTranches(rows.map(r => ({ ...r, budget })), 3, "KR")).toThrow(/매수금액/);
  });
  it.each([0, -1, 100, NaN, Infinity, null, 1.001])("매수 간격 %s는 저장할 수 없다", buyDropPct => {
    expect(() => validateTranches([rows[0], { ...rows[1], buyDropPct }, rows[2]], 3, "KR")).toThrow(/매수 기준/);
  });
  it.each([0, -1, 1000, NaN, Infinity, null, 1.001])("익절률 %s는 저장할 수 없다", takeProfitPct => {
    expect(() => validateTranches([{ ...rows[0], takeProfitPct }, rows[1], rows[2]], 3, "KR")).toThrow(/익절률/);
  });
  it("달러는 센트까지, 1차 매수 기준은 null만 허용한다", () => {
    expect(() => validateTranches(rows.map(r => ({ ...r, budget: 10.25 })), 3, "US")).not.toThrow();
    expect(() => validateTranches(rows.map(r => ({ ...r, budget: 10.251 })), 3, "US")).toThrow();
    expect(() => validateTranches([{ ...rows[0], buyDropPct: 5 }, ...rows.slice(1)], 3, "KR")).toThrow();
  });
  it("저장 데이터가 없으면 기존 계산, 손상된 데이터는 주문 판단에서 거절한다", () => {
    expect(parseTranches(null, 3, "KR")).toBeUndefined();
    expect(parseTranches(JSON.stringify(rows), 3, "KR")).toEqual(rows);
    expect(() => parseTranches("broken", 3, "KR")).toThrow();
    expect(() => parseTranches("[]", 3, "KR")).toThrow();
  });
});
