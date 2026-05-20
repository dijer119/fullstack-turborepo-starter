import { describe, it, expect } from "vitest";
import { invertMap } from "./corp-code";

describe("invertMap", () => {
  it("inverts (stock_code → corp_code) to (corp_code → stock_code)", () => {
    const forward = new Map([
      ["005930", "00126380"],
      ["000660", "00164779"],
    ]);
    const reverse = invertMap(forward);
    expect(reverse.get("00126380")).toBe("005930");
    expect(reverse.get("00164779")).toBe("000660");
    expect(reverse.size).toBe(2);
  });

  it("returns empty map for empty input", () => {
    expect(invertMap(new Map()).size).toBe(0);
  });
});
