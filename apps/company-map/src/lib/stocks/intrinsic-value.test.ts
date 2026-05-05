import { describe, it, expect } from "vitest";
import {
  calculateWeightedEps,
  calculateIntrinsicValue,
  calculateSafetyMargin,
} from "./intrinsic-value";

describe("calculateWeightedEps", () => {
  it("returns weighted average with descending weights (직전 ×3, 전년 ×2, 전전 ×1) / 6", () => {
    expect(calculateWeightedEps([1000, 1500, 2000])).toBeCloseTo(
      (2000 * 3 + 1500 * 2 + 1000 * 1) / 6,
    );
  });

  it("returns null when EPS array is not exactly 3 values", () => {
    expect(calculateWeightedEps([1000, 2000])).toBeNull();
    expect(calculateWeightedEps([])).toBeNull();
  });

  it("returns null when any value is null/NaN", () => {
    expect(calculateWeightedEps([1000, null, 2000])).toBeNull();
    expect(calculateWeightedEps([1000, NaN, 2000])).toBeNull();
  });
});

describe("calculateIntrinsicValue", () => {
  it("returns (weightedEps × 10 + latestBps) / 2 without treasury adjustment when ratio = 0", () => {
    const eps = [1000, 1500, 2000];
    const bps = 30000;
    const weighted = (2000 * 3 + 1500 * 2 + 1000 * 1) / 6;
    expect(
      calculateIntrinsicValue(eps, bps, { shares: 0, ratio: 0 }),
    ).toBeCloseTo((weighted * 10 + bps) / 2);
  });

  it("multiplies by 100/(100-ratio) when treasury ratio > 0", () => {
    const eps = [1000, 1500, 2000];
    const bps = 30000;
    const ratio = 5;
    const weighted = (2000 * 3 + 1500 * 2 + 1000 * 1) / 6;
    const base = (weighted * 10 + bps) / 2;
    expect(
      calculateIntrinsicValue(eps, bps, { shares: 1000, ratio }),
    ).toBeCloseTo(base * (100 / (100 - ratio)));
  });

  it("returns null when EPS or BPS is missing", () => {
    expect(
      calculateIntrinsicValue([null, null, null], 30000, { shares: 0, ratio: 0 }),
    ).toBeNull();
    expect(
      calculateIntrinsicValue([1000, 1500, 2000], null, { shares: 0, ratio: 0 }),
    ).toBeNull();
  });
});

describe("calculateSafetyMargin", () => {
  it("returns ((intrinsic - current) / current) × 100", () => {
    expect(calculateSafetyMargin(15000, 10000)).toBeCloseTo(50);
    expect(calculateSafetyMargin(8000, 10000)).toBeCloseTo(-20);
  });

  it("returns null when current price is 0 or null", () => {
    expect(calculateSafetyMargin(15000, 0)).toBeNull();
    expect(calculateSafetyMargin(15000, null)).toBeNull();
    expect(calculateSafetyMargin(null, 10000)).toBeNull();
  });
});
