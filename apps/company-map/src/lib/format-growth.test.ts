import { describe, it, expect } from "vitest";
import {
  computeGrowth,
  formatGrowth,
  growthColorClass,
} from "./format-growth";

describe("computeGrowth", () => {
  it("returns pct for positive base and positive curr", () => {
    expect(computeGrowth(1200n, 1000n)).toEqual({ kind: "pct", value: 20 });
  });

  it("returns negative pct for shrinkage", () => {
    expect(computeGrowth(800n, 1000n)).toEqual({ kind: "pct", value: -20 });
  });

  it("turnaround_positive when base < 0 and curr > 0", () => {
    expect(computeGrowth(100n, -50n)).toEqual({ kind: "turnaround_positive" });
  });

  it("turnaround_negative when base > 0 and curr < 0", () => {
    expect(computeGrowth(-100n, 50n)).toEqual({ kind: "turnaround_negative" });
  });

  it("loss_widened when both negative and curr more negative", () => {
    expect(computeGrowth(-200n, -100n)).toEqual({ kind: "loss_widened" });
  });

  it("loss_narrowed when both negative and curr less negative", () => {
    expect(computeGrowth(-50n, -100n)).toEqual({ kind: "loss_narrowed" });
  });

  it("unavailable for null inputs", () => {
    expect(computeGrowth(null, 100n)).toEqual({ kind: "unavailable" });
    expect(computeGrowth(100n, null)).toEqual({ kind: "unavailable" });
  });

  it("unavailable when both zero", () => {
    expect(computeGrowth(0n, 0n)).toEqual({ kind: "unavailable" });
  });

  it("infinity pct when base is 0 and curr positive", () => {
    expect(computeGrowth(100n, 0n)).toEqual({ kind: "pct", value: Infinity });
  });

  it("accepts number inputs as well as bigint", () => {
    expect(computeGrowth(1200, 1000)).toEqual({ kind: "pct", value: 20 });
  });
});

describe("formatGrowth", () => {
  it("formats positive pct with + sign and 1 decimal", () => {
    expect(formatGrowth({ kind: "pct", value: 12.34 })).toBe("+12.3%");
  });

  it("formats negative pct with native -", () => {
    expect(formatGrowth({ kind: "pct", value: -8.7 })).toBe("-8.7%");
  });

  it("formats infinity as +∞%", () => {
    expect(formatGrowth({ kind: "pct", value: Infinity })).toBe("+∞%");
  });

  it("returns 흑전 / 적전 / 적자↑ / 적자↓ / — for each kind", () => {
    expect(formatGrowth({ kind: "turnaround_positive" })).toBe("흑전");
    expect(formatGrowth({ kind: "turnaround_negative" })).toBe("적전");
    expect(formatGrowth({ kind: "loss_widened" })).toBe("적자↑");
    expect(formatGrowth({ kind: "loss_narrowed" })).toBe("적자↓");
    expect(formatGrowth({ kind: "unavailable" })).toBe("—");
  });
});

describe("growthColorClass", () => {
  it("green for positive pct", () => {
    expect(growthColorClass({ kind: "pct", value: 1 })).toContain("green");
  });

  it("red for negative pct", () => {
    expect(growthColorClass({ kind: "pct", value: -1 })).toContain("red");
  });

  it("gray for zero pct", () => {
    expect(growthColorClass({ kind: "pct", value: 0 })).toContain("gray");
  });

  it("turnaround_positive uses font-semibold green", () => {
    const c = growthColorClass({ kind: "turnaround_positive" });
    expect(c).toContain("green");
    expect(c).toContain("font-semibold");
  });

  it("turnaround_negative uses font-semibold red", () => {
    const c = growthColorClass({ kind: "turnaround_negative" });
    expect(c).toContain("red");
    expect(c).toContain("font-semibold");
  });

  it("loss_widened uses red", () => {
    expect(growthColorClass({ kind: "loss_widened" })).toContain("red");
  });

  it("loss_narrowed uses gray", () => {
    expect(growthColorClass({ kind: "loss_narrowed" })).toContain("gray");
  });

  it("unavailable uses gray", () => {
    expect(growthColorClass({ kind: "unavailable" })).toContain("gray");
  });
});
