import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { parsePdfResponse } from "./krx-pdf";

const sample = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "krx-pdf.sample.json"), "utf-8"),
);

describe("parsePdfResponse", () => {
  it("KRX PDF 응답을 Holding[]로 파싱한다", () => {
    const holdings = parsePdfResponse(sample);
    expect(holdings.length).toBeGreaterThan(0);
    const h = holdings[0];
    expect(typeof h.constituentName).toBe("string");
    expect(h.constituentName.length).toBeGreaterThan(0);
    expect(h.weight === null || typeof h.weight === "number").toBe(true);
  });

  it("콤마 숫자를 파싱하고 '-'는 null로 처리한다", () => {
    const holdings = parsePdfResponse(sample);
    const samsung = holdings.find((h) => h.constituentName === "삼성전자");
    expect(samsung?.weight).toBeCloseTo(18.42);
    expect(samsung?.shares).toBe(1250);
    const cash = holdings.find((h) => h.constituentName === "원화현금");
    expect(cash?.shares).toBeNull(); // "-" → null
  });
});
