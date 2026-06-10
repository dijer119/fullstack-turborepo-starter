import { describe, it, expect } from "vitest";
import { parseWeek52 } from "./week52";

const FIXTURE = `[['날짜', '시가', '고가', '저가', '종가', '거래량', '외국인소진율'],
['20250611', 70000, 71500, 69000, 70500, 1000, 30.1],
['20250912', 80000, 88200, 79500, 87000, 2000, 30.5],
['20260203', 60000, 61000, 58000, 60500, 1500, 29.8],
['20260610', 72000, 73500, 71800, 72900, 1200, 30.0]]`;

describe("parseWeek52", () => {
  it("1년 일봉에서 고가 최대·저가 최소·마지막 일자를 추출한다", () => {
    const r = parseWeek52(FIXTURE);
    expect(r).not.toBeNull();
    expect(r!.high).toBe(88200);
    expect(r!.low).toBe(58000);
    expect(r!.asOfDate.toISOString().slice(0, 10)).toBe("2026-06-10");
  });

  it("헤더만 있거나 빈 응답이면 null", () => {
    expect(parseWeek52("[['날짜','시가','고가','저가','종가','거래량','외국인소진율']]")).toBeNull();
    expect(parseWeek52("")).toBeNull();
    expect(parseWeek52("not json")).toBeNull();
  });

  it("숫자가 아닌 행은 건너뛴다", () => {
    const r = parseWeek52(
      `[['날짜','시가','고가','저가','종가','거래량','외국인소진율'],
['20260101', null, null, null, null, 0, 0],
['20260610', 72000, 73500, 71800, 72900, 1200, 30.0]]`,
    );
    expect(r!.high).toBe(73500);
    expect(r!.low).toBe(71800);
  });
});
