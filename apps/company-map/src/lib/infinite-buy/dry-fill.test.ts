import { describe, it, expect } from "vitest";
import { judgeDryFill } from "./dry-fill";

const candle = { close: 55, high: 58 };
const loc = (side: "BUY" | "SELL", price: number) =>
  ({ side, orderType: "LIMIT", tif: "CLS", price });
const day = (price: number) =>
  ({ side: "SELL" as const, orderType: "LIMIT", tif: "DAY", price });

describe("judgeDryFill — LOC (종가 판정)", () => {
  it("LOC 매수: 종가 ≤ 리밋 → 종가 체결 (경계 포함)", () => {
    expect(judgeDryFill(loc("BUY", 55), candle)).toEqual({ filled: true, fillPrice: 55 });
    expect(judgeDryFill(loc("BUY", 56), candle)).toEqual({ filled: true, fillPrice: 55 });
  });
  it("LOC 매수: 종가 > 리밋 → 미체결", () => {
    expect(judgeDryFill(loc("BUY", 54.99), candle)).toEqual({ filled: false, fillPrice: null });
  });
  it("LOC 매도: 종가 ≥ 리밋 → 종가 체결 (경계 포함)", () => {
    expect(judgeDryFill(loc("SELL", 55), candle)).toEqual({ filled: true, fillPrice: 55 });
    expect(judgeDryFill(loc("SELL", 54), candle)).toEqual({ filled: true, fillPrice: 55 });
  });
  it("LOC 매도: 종가 < 리밋 → 미체결", () => {
    expect(judgeDryFill(loc("SELL", 55.01), candle)).toEqual({ filled: false, fillPrice: null });
  });
});

describe("judgeDryFill — 지정가 매도 (고가 판정, 리밋가 체결)", () => {
  it("고가 ≥ 리밋 → 리밋가 체결", () => {
    expect(judgeDryFill(day(58), candle)).toEqual({ filled: true, fillPrice: 58 });
    expect(judgeDryFill(day(57.5), candle)).toEqual({ filled: true, fillPrice: 57.5 });
  });
  it("고가 < 리밋 → 미체결", () => {
    expect(judgeDryFill(day(58.01), candle)).toEqual({ filled: false, fillPrice: null });
  });
});

describe("judgeDryFill — 방어", () => {
  it("가격 없는 주문/시장가: 미체결 처리", () => {
    expect(judgeDryFill({ side: "BUY", orderType: "MARKET", tif: "DAY", price: null }, candle))
      .toEqual({ filled: false, fillPrice: null });
  });
});
