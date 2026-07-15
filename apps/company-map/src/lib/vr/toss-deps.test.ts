import { describe, expect, it } from "vitest";
import { pickPrevClose } from "./toss-deps";

const CANDLES = [
  { date: "2026-07-10", close: 50.1 },
  { date: "2026-07-13", close: 51.2 },
  { date: "2026-07-14", close: 52.3 },
];

describe("pickPrevClose", () => {
  it("before 미포함 직전 거래일 종가", () => {
    expect(pickPrevClose(CANDLES, "2026-07-14")).toBe(51.2);
  });

  it("주말 건너뜀 (7/13 월요일 직전은 7/10 금요일)", () => {
    expect(pickPrevClose(CANDLES, "2026-07-13")).toBe(50.1);
  });

  it("이전 캔들 없으면 null", () => {
    expect(pickPrevClose(CANDLES, "2026-07-10")).toBeNull();
  });
});
