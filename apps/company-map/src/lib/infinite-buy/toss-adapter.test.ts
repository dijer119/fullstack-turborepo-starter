import { describe, it, expect } from "vitest";
import { assertSubmittable } from "./toss-adapter";
import type { IntendedOrder } from "./strategy";

const mk = (over: Partial<IntendedOrder>): IntendedOrder => ({
  side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 1, ...over,
});

describe("assertSubmittable", () => {
  it("정상 LIMIT 주문은 통과", () => {
    expect(() => assertSubmittable(mk({}))).not.toThrow();
  });
  it("정상 MARKET 주문(price null)도 통과", () => {
    expect(() => assertSubmittable(mk({ orderType: "MARKET", price: null }))).not.toThrow();
  });
  it("수량 0/음수/NaN은 throw", () => {
    expect(() => assertSubmittable(mk({ quantity: 0 }))).toThrow();
    expect(() => assertSubmittable(mk({ quantity: -1 }))).toThrow();
    expect(() => assertSubmittable(mk({ quantity: NaN }))).toThrow();
  });
  it("LIMIT인데 price null/0/NaN은 throw", () => {
    expect(() => assertSubmittable(mk({ orderType: "LIMIT", price: null }))).toThrow();
    expect(() => assertSubmittable(mk({ orderType: "LIMIT", price: 0 }))).toThrow();
    expect(() => assertSubmittable(mk({ orderType: "LIMIT", price: NaN }))).toThrow();
  });
});
