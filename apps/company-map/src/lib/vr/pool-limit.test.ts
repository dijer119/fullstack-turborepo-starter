import { describe, expect, it } from "vitest";
import { autoPoolLimitPct, weeksBetween } from "./pool-limit";

describe("autoPoolLimitPct", () => {
  it("적립식: 75% 시작, 26주마다 −5%p, 최저 10%", () => {
    expect(autoPoolLimitPct("accumulate", 0)).toBe(75);
    expect(autoPoolLimitPct("accumulate", 25)).toBe(75);
    expect(autoPoolLimitPct("accumulate", 26)).toBe(70);
    expect(autoPoolLimitPct("accumulate", 169)).toBe(45);
    expect(autoPoolLimitPct("accumulate", 338)).toBe(10);
    expect(autoPoolLimitPct("accumulate", 500)).toBe(10);
  });

  it("거치식: 50% 고정", () => {
    expect(autoPoolLimitPct("lumpsum", 0)).toBe(50);
    expect(autoPoolLimitPct("lumpsum", 338)).toBe(50);
  });
});

describe("weeksBetween", () => {
  it("경과 주 = floor(일수/7)", () => {
    expect(weeksBetween("2026-07-15", "2026-07-15")).toBe(0);
    expect(weeksBetween("2026-07-15", "2026-07-21")).toBe(0);
    expect(weeksBetween("2026-07-15", "2026-07-29")).toBe(2);
  });

  it("역전 입력은 0", () => {
    expect(weeksBetween("2026-07-15", "2026-07-01")).toBe(0);
  });
});
