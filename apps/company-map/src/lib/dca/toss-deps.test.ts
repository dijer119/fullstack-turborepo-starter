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
  const ID = "dca-a1b2c3d4-20260828";

  it("정상 금액·멱등성 키는 통과", () => {
    expect(() => assertSubmittable({ amountUsd: 36.25, clientOrderId: ID })).not.toThrow();
    expect(() => assertSubmittable({ amountUsd: 0.01, clientOrderId: ID })).not.toThrow();
    // 절삭 결과가 부동소수 오차를 안고 와도 센트 단위면 통과해야 한다
    expect(() =>
      assertSubmittable({ amountUsd: Math.floor(36.255 * 100) / 100, clientOrderId: ID }),
    ).not.toThrow();
  });

  it("1센트 미만이면 throw", () => {
    expect(() => assertSubmittable({ amountUsd: 0.005, clientOrderId: ID })).toThrow();
    expect(() => assertSubmittable({ amountUsd: 0, clientOrderId: ID })).toThrow();
  });

  it("소수 3자리 이상이면 throw", () => {
    expect(() => assertSubmittable({ amountUsd: 36.251, clientOrderId: ID })).toThrow();
    expect(() => assertSubmittable({ amountUsd: 1.2345, clientOrderId: ID })).toThrow();
  });

  it("음수·NaN·Infinity면 throw", () => {
    expect(() => assertSubmittable({ amountUsd: -36.25, clientOrderId: ID })).toThrow();
    expect(() => assertSubmittable({ amountUsd: Number.NaN, clientOrderId: ID })).toThrow();
    expect(() => assertSubmittable({ amountUsd: Number.POSITIVE_INFINITY, clientOrderId: ID })).toThrow();
  });

  it("clientOrderId가 비었거나 37자 이상이거나 허용 문자를 벗어나면 throw", () => {
    expect(() => assertSubmittable({ amountUsd: 36.25, clientOrderId: "" })).toThrow();
    expect(() => assertSubmittable({ amountUsd: 36.25, clientOrderId: "a".repeat(37) })).toThrow();
    expect(() => assertSubmittable({ amountUsd: 36.25, clientOrderId: "a".repeat(36) })).not.toThrow();
    expect(() => assertSubmittable({ amountUsd: 36.25, clientOrderId: "dca 20260828" })).toThrow();
    expect(() => assertSubmittable({ amountUsd: 36.25, clientOrderId: "dca:20260828" })).toThrow();
  });
});
