import { describe, expect, it } from "vitest";
import { estimateQuantity, planAmountBuy } from "./sizing";

describe("planAmountBuy", () => {
  it("잔액을 당일 환율로 환산해 센트 단위로 절삭한다", () => {
    // 50,000 / 1379.1 = 36.2555... → 36.25 (절삭, 반올림 아님)
    const r = planAmountBuy({ cashKrw: 50_000, fxRate: 1379.1 })!;
    expect(r.amountUsd).toBe(36.25);
    expect(r.amountKrw).toBe(Math.round(36.25 * 1379.1));
  });

  it("절삭분은 amountKrw에서 빠져 잔액으로 이월된다", () => {
    const r = planAmountBuy({ cashKrw: 50_000, fxRate: 1379.1 })!;
    expect(r.amountKrw).toBeLessThan(50_000);
  });

  it("정수로 나누어떨어지는 경우", () => {
    const r = planAmountBuy({ cashKrw: 100_000, fxRate: 1000 })!;
    expect(r.amountUsd).toBe(100);
    expect(r.amountKrw).toBe(100_000);
  });

  it("환산액이 1센트 미만이면 null (주문 불가)", () => {
    expect(planAmountBuy({ cashKrw: 10, fxRate: 1379.1 })).toBeNull();
  });

  it("비정상 입력은 null", () => {
    expect(planAmountBuy({ cashKrw: 0, fxRate: 1379.1 })).toBeNull();
    expect(planAmountBuy({ cashKrw: -1000, fxRate: 1379.1 })).toBeNull();
    expect(planAmountBuy({ cashKrw: 50_000, fxRate: 0 })).toBeNull();
    expect(planAmountBuy({ cashKrw: 50_000, fxRate: Number.NaN })).toBeNull();
    expect(planAmountBuy({ cashKrw: Number.NaN, fxRate: 1379.1 })).toBeNull();
    expect(planAmountBuy({ cashKrw: Number.POSITIVE_INFINITY, fxRate: 1379.1 })).toBeNull();
  });

  it("잔액이 커도 상한 없이 그대로 환산한다 (정수 수량 제약이 없어짐)", () => {
    const r = planAmountBuy({ cashKrw: 3_000_000, fxRate: 1379.1 })!;
    expect(r.amountUsd).toBeCloseTo(2175.33, 2);
  });
});

describe("estimateQuantity", () => {
  it("금액 ÷ 시세, 소수 6자리", () => {
    // 36.25 / 715.87 = 0.050638...
    expect(estimateQuantity(36.25, 715.87)).toBeCloseTo(0.050638, 6);
    // QLD는 같은 금액으로 훨씬 많이 산다
    expect(estimateQuantity(36.25, 90.07)).toBeCloseTo(0.402465, 6);
  });

  it("시세가 비정상이면 0", () => {
    expect(estimateQuantity(36.25, 0)).toBe(0);
    expect(estimateQuantity(36.25, Number.NaN)).toBe(0);
  });
});
