import { describe, it, expect } from "vitest";
import { formatStockRatio, ratioColorClass } from "./format-ratio";

describe("formatStockRatio", () => {
  it("returns dash when ratio is null (no enrichment yet)", () => {
    expect(formatStockRatio(null, 0.34, null)).toBe("—");
  });

  it("formats ratio + positive change", () => {
    expect(formatStockRatio(5.12, 0.34, null)).toBe("5.12% (+0.34%p)");
  });

  it("formats ratio + negative change", () => {
    expect(formatStockRatio(6.21, -0.5, null)).toBe("6.21% (-0.50%p)");
  });

  it("marks 신규 when change is null and report_resn contains 신규", () => {
    expect(formatStockRatio(4.78, null, "신규보고")).toBe("4.78% (신규)");
  });

  it("returns ratio alone when change is 0 and not 신규", () => {
    expect(formatStockRatio(5.0, 0, "변동보고")).toBe("5.00%");
  });

  it("returns ratio alone when change is null and report_resn lacks 신규", () => {
    expect(formatStockRatio(5.0, null, "변동보고")).toBe("5.00%");
  });
});

describe("ratioColorClass", () => {
  it("green for positive change", () => {
    expect(ratioColorClass(0.34)).toContain("green");
  });

  it("red for negative change", () => {
    expect(ratioColorClass(-0.5)).toContain("red");
  });

  it("gray for null", () => {
    expect(ratioColorClass(null)).toContain("gray");
  });

  it("gray for zero", () => {
    expect(ratioColorClass(0)).toContain("gray");
  });
});
