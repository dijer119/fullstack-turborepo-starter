import { describe, expect, it } from "vitest";
import { isValidStockCode } from "./stock-code";

describe("isValidStockCode", () => {
  it("숫자 6자리 기존 코드를 허용한다", () => {
    expect(isValidStockCode("005930")).toBe(true);
  });

  it("영문 대문자가 포함된 신형 KRX 코드를 허용한다", () => {
    expect(isValidStockCode("0120G0")).toBe(true);
  });

  it("6자리가 아니면 거부한다", () => {
    expect(isValidStockCode("12345")).toBe(false);
    expect(isValidStockCode("1234567")).toBe(false);
    expect(isValidStockCode("")).toBe(false);
  });

  it("소문자·특수문자·공백을 거부한다", () => {
    expect(isValidStockCode("0120g0")).toBe(false);
    expect(isValidStockCode("01 2G0")).toBe(false);
    expect(isValidStockCode("0120G;")).toBe(false);
  });
});
