import { describe, expect, it } from "vitest";
import { assertSubmittable, pickPrevTradeClose } from "./toss-deps";

describe("pickPrevTradeClose", () => {
  const candles = [
    { date: "2026-08-24", close: 700 },
    { date: "2026-08-25", close: 710 },
    { date: "2026-08-26", close: 715.87 },
    { date: "2026-08-27", close: 720 },
  ];

  it("기준일 미포함 직전 거래일의 날짜·종가", () => {
    expect(pickPrevTradeClose(candles, "2026-08-27")).toEqual({ date: "2026-08-26", close: 715.87 });
  });

  it("휴장으로 며칠 빈 경우에도 가장 최근 이전 거래일", () => {
    expect(pickPrevTradeClose(candles, "2026-08-31")).toEqual({ date: "2026-08-27", close: 720 });
  });

  it("이전 거래일이 없으면 null", () => {
    expect(pickPrevTradeClose(candles, "2026-08-24")).toBeNull();
    expect(pickPrevTradeClose([], "2026-08-27")).toBeNull();
  });
});

describe("assertSubmittable", () => {
  it("정상 주문은 통과", () => {
    expect(() => assertSubmittable({ price: 94.57, quantity: 23 })).not.toThrow();
  });

  it("수량이 0 이하·정수 아님이면 throw", () => {
    expect(() => assertSubmittable({ price: 94.57, quantity: 0 })).toThrow();
    expect(() => assertSubmittable({ price: 94.57, quantity: -1 })).toThrow();
    expect(() => assertSubmittable({ price: 94.57, quantity: 1.5 })).toThrow();
  });

  it("지정가가 0 이하·NaN이면 throw", () => {
    expect(() => assertSubmittable({ price: 0, quantity: 1 })).toThrow();
    expect(() => assertSubmittable({ price: Number.NaN, quantity: 1 })).toThrow();
  });
});
