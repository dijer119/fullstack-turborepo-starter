import { describe, it, expect } from "vitest";
import { parseKoreanMarketValue } from "./parse-market-value";

describe("parseKoreanMarketValue", () => {
  it("parses 조 + 억 (e.g. 삼성전자)", () => {
    expect(parseKoreanMarketValue("1,710조 365억")).toBe(
      1710n * 1_000_000_000_000n + 365n * 100_000_000n,
    );
  });

  it("parses 조 alone", () => {
    expect(parseKoreanMarketValue("100조")).toBe(100n * 1_000_000_000_000n);
  });

  it("parses 억 alone", () => {
    expect(parseKoreanMarketValue("5,234억")).toBe(5234n * 100_000_000n);
  });

  it("strips whitespace + commas", () => {
    expect(parseKoreanMarketValue("  1,234조  500억  ")).toBe(
      1234n * 1_000_000_000_000n + 500n * 100_000_000n,
    );
  });

  it("returns null for empty / null / unparseable", () => {
    expect(parseKoreanMarketValue("")).toBeNull();
    expect(parseKoreanMarketValue("-")).toBeNull();
    expect(parseKoreanMarketValue("N/A")).toBeNull();
  });

  it("returns null for 0 result", () => {
    expect(parseKoreanMarketValue("0조 0억")).toBeNull();
    expect(parseKoreanMarketValue("0억")).toBeNull();
  });

  it("parses fractional 조 by rounding down to nearest 억", () => {
    // "1.5조" = 1.5e12 = 15000억. 만약 정수 조 + 5000억 표기면 그대로.
    // 네이버는 보통 "1조 5000억" 같은 정수 표기. 소수점 케이스는 흔치 않지만 safe.
    expect(parseKoreanMarketValue("1.5조")).toBe(1_500_000_000_000n);
  });
});
