import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseNaverMain, parseTreasuryStock } from "./naver-scraper";

const fixturesDir = path.resolve(__dirname, "../../../tests/fixtures");

const mainHtml = readFileSync(
  path.join(fixturesDir, "naver-main-005930.html"),
  "utf-8",
);
const wiseHtml = readFileSync(
  path.join(fixturesDir, "naver-wisereport-005930.html"),
  "utf-8",
);

describe("parseNaverMain", () => {
  it("extracts the stock name as 삼성전자", () => {
    const result = parseNaverMain(mainHtml);
    expect(result.stockName).toBe("삼성전자");
  });

  it("extracts a positive current price", () => {
    const result = parseNaverMain(mainHtml);
    expect(result.currentPrice).not.toBeNull();
    expect(result.currentPrice!).toBeGreaterThan(0);
  });

  it("extracts EPS, BPS, PBR fields for all 3 periods", () => {
    const { historicalData } = parseNaverMain(mainHtml);
    for (const period of ["3년전", "2년전", "직전년도"] as const) {
      expect(historicalData[period]).toBeDefined();
      expect(historicalData[period]).toHaveProperty("EPS");
      expect(historicalData[period]).toHaveProperty("BPS");
      expect(historicalData[period]).toHaveProperty("PBR");
    }
  });

  it("returns dividendYield as a finite number or null", () => {
    const { dividendYield } = parseNaverMain(mainHtml);
    expect(dividendYield === null || Number.isFinite(dividendYield)).toBe(true);
  });
});

describe("parseTreasuryStock", () => {
  it("returns shares and ratio as finite non-negative numbers", () => {
    const result = parseTreasuryStock(wiseHtml);
    expect(result.shares).toBeGreaterThanOrEqual(0);
    expect(result.ratio).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.shares)).toBe(true);
    expect(Number.isFinite(result.ratio)).toBe(true);
  });

  it("returns zeros when HTML has no 자사주 row", () => {
    const result = parseTreasuryStock("<html><body>nothing</body></html>");
    expect(result).toEqual({ shares: 0, ratio: 0 });
  });
});
