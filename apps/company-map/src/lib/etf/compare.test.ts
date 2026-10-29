import { describe, it, expect } from "vitest";
import { buildCompareRows, maxByColumn, sortCompareRows, type CompareInput } from "./compare";

const highDiv: CompareInput = {
  code: "104530",
  name: "KIWOOM 코리아고배당",
  snapshotTrdDd: "20261002",
  returns: {
    referenceDate: "20261001",
    market: [{ period: "M1", value: -3.53 }, { period: "Y10", value: 13.72 }],
    nav: [{ period: "M1", value: -3.98 }],
  },
  dividend: { perShareTtm: 815, yieldTtm: 4.77, countThisYear: 9, monthsThisYear: [1, 2, 3] },
};

const active: CompareInput = {
  code: "0074K0",
  name: "KoAct K수출핵심기업TOP30액티브",
  snapshotTrdDd: "20261002",
  returns: { referenceDate: null, market: [{ period: "M1", value: 1.56 }], nav: [{ period: "M1", value: 1.7 }] },
  dividend: { perShareTtm: 0, yieldTtm: 0, countThisYear: 0, monthsThisYear: [] },
};

const empty: CompareInput = {
  code: "0089D0",
  name: "KODEX 금융고배당TOP10",
  snapshotTrdDd: null,
  returns: null,
  dividend: null,
};

describe("buildCompareRows", () => {
  it("시장가 기준으로 수익률과 분배 값을 한 행에 모은다", () => {
    const [row] = buildCompareRows([highDiv], "market");
    expect(row.values.M1).toBe(-3.53);
    expect(row.values.Y10).toBe(13.72);
    expect(row.values.D1).toBeNull();
    expect(row.values.yieldTtm).toBe(4.77);
    expect(row.values.perShareTtm).toBe(815);
    expect(row.values.countThisYear).toBe(9);
    expect(row.referenceDate).toBe("20261001");
    expect(row.hasData).toBe(true);
  });

  it("NAV 기준이면 NAV 수익률을 쓰고 분배 값은 그대로다", () => {
    const [row] = buildCompareRows([highDiv], "nav");
    expect(row.values.M1).toBe(-3.98);
    expect(row.values.Y10).toBeNull();
    expect(row.values.yieldTtm).toBe(4.77);
  });

  it("수익률 기준일이 없으면 스냅샷 기준일로 대체한다", () => {
    const [row] = buildCompareRows([active], "market");
    expect(row.referenceDate).toBe("20261002");
  });

  it("미수집 ETF는 행은 남기고 모든 값이 null이다", () => {
    const [row] = buildCompareRows([empty], "market");
    expect(row.hasData).toBe(false);
    expect(Object.values(row.values).every((v) => v == null)).toBe(true);
  });
});

describe("sortCompareRows", () => {
  const rows = buildCompareRows([highDiv, active, empty], "market");

  it("내림차순 정렬에서 null은 맨 뒤", () => {
    expect(sortCompareRows(rows, "M1", "desc").map((r) => r.code)).toEqual(["0074K0", "104530", "0089D0"]);
  });

  it("오름차순 정렬에서도 null은 맨 뒤", () => {
    expect(sortCompareRows(rows, "M1", "asc").map((r) => r.code)).toEqual(["104530", "0074K0", "0089D0"]);
  });

  it("분배 없는 ETF의 0은 값으로 정렬에 참여한다", () => {
    expect(sortCompareRows(rows, "yieldTtm", "asc").map((r) => r.code)).toEqual(["0074K0", "104530", "0089D0"]);
  });

  it("이름 정렬은 가나다순이며 입력을 바꾸지 않는다", () => {
    const before = rows.map((r) => r.code);
    expect(sortCompareRows(rows, "name", "asc").map((r) => r.name)).toEqual([
      "KIWOOM 코리아고배당", "KODEX 금융고배당TOP10", "KoAct K수출핵심기업TOP30액티브",
    ].sort((a, b) => a.localeCompare(b, "ko")));
    expect(rows.map((r) => r.code)).toEqual(before);
  });
});

describe("maxByColumn", () => {
  it("열별 최대값을 구하고 값이 1개뿐인 열은 null", () => {
    const max = maxByColumn(buildCompareRows([highDiv, active, empty], "market"));
    expect(max.M1).toBe(1.56);
    expect(max.yieldTtm).toBe(4.77);
    expect(max.Y10).toBeNull(); // 104530만 값이 있음
    expect(max.D1).toBeNull();
  });

  it("음수만 있는 열도 가장 큰 값을 고른다", () => {
    const a = { ...highDiv, code: "A", returns: { referenceDate: null, market: [{ period: "D1", value: -2 }], nav: [] } };
    const b = { ...highDiv, code: "B", returns: { referenceDate: null, market: [{ period: "D1", value: -0.5 }], nav: [] } };
    expect(maxByColumn(buildCompareRows([a, b], "market")).D1).toBe(-0.5);
  });

  it("동률이면 그 값을 최대값으로 돌려준다", () => {
    const b = { ...highDiv, code: "B" };
    expect(maxByColumn(buildCompareRows([highDiv, b], "market")).yieldTtm).toBe(4.77);
  });
});
