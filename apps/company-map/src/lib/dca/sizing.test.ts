import { describe, expect, it } from "vitest";
import { planBuy, tradingDaysToOneShare } from "./sizing";

describe("planBuy", () => {
  it("잔액이 1주 값에 못 미치면 null (2026-08-27 실측: 5만원 vs QQQ $715.87)", () => {
    expect(planBuy({ cashKrw: 50000, fxRate: 1379.1, price: 715.87, premiumPct: 5 })).toBeNull();
  });

  it("프리미엄을 얹은 지정가와 그 지정가 기준 정수 수량", () => {
    // limit = 90.07 × 1.05 = 94.57(반올림), 예산 = 3,000,000 / 1379.1 = 2175.33 USD
    // 수량 = floor(2175.33 / 94.57) = 23
    const r = planBuy({ cashKrw: 3_000_000, fxRate: 1379.1, price: 90.07, premiumPct: 5 });
    expect(r).not.toBeNull();
    expect(r!.price).toBeCloseTo(94.57, 2);
    expect(r!.quantity).toBe(23);
    expect(r!.estUsd).toBeCloseTo(94.57 * 23, 2);
    expect(r!.estKrw).toBe(Math.round(94.57 * 23 * 1379.1));
  });

  it("정확히 1주 경계", () => {
    // limit = 100, 예산 = 100000/1000 = 100 USD → 1주
    expect(planBuy({ cashKrw: 100_000, fxRate: 1000, price: 100, premiumPct: 0 })!.quantity).toBe(1);
    // 1원 부족하면 0주 → null
    expect(planBuy({ cashKrw: 99_999, fxRate: 1000, price: 100, premiumPct: 0 })).toBeNull();
  });

  it("프리미엄이 커지면 살 수 있는 수량이 줄어든다", () => {
    const a = planBuy({ cashKrw: 1_000_000, fxRate: 1000, price: 100, premiumPct: 0 })!;
    const b = planBuy({ cashKrw: 1_000_000, fxRate: 1000, price: 100, premiumPct: 25 })!;
    expect(a.quantity).toBe(10);
    expect(b.quantity).toBe(8); // limit 125 → floor(1000/125)
  });

  it("비정상 입력은 null", () => {
    expect(planBuy({ cashKrw: 0, fxRate: 1379.1, price: 90, premiumPct: 5 })).toBeNull();
    expect(planBuy({ cashKrw: -1000, fxRate: 1379.1, price: 90, premiumPct: 5 })).toBeNull();
    expect(planBuy({ cashKrw: 1_000_000, fxRate: 0, price: 90, premiumPct: 5 })).toBeNull();
    expect(planBuy({ cashKrw: 1_000_000, fxRate: 1379.1, price: 0, premiumPct: 5 })).toBeNull();
    expect(planBuy({ cashKrw: 1_000_000, fxRate: Number.NaN, price: 90, premiumPct: 5 })).toBeNull();
    expect(planBuy({ cashKrw: 1_000_000, fxRate: 1379.1, price: 90, premiumPct: -1 })).toBeNull();
  });
});

describe("tradingDaysToOneShare", () => {
  it("1주까지 남은 거래일 수 (5만원씩, QQQ $715.87)", () => {
    // 1주 값 = 751.66(=715.87×1.05, 반올림) × 1379.1 = 1,036,614원 → 잔액 0에서 21거래일
    const d = tradingDaysToOneShare({
      cashKrw: 0, dailyAmountKrw: 50_000, fxRate: 1379.1, price: 715.87, premiumPct: 5,
    });
    expect(d).toBe(21);
  });

  it("이미 1주를 살 수 있으면 0", () => {
    expect(
      tradingDaysToOneShare({
        cashKrw: 2_000_000, dailyAmountKrw: 50_000, fxRate: 1379.1, price: 90.07, premiumPct: 5,
      }),
    ).toBe(0);
  });

  it("적립액이 0이면 null (영원히 도달 못 함)", () => {
    expect(
      tradingDaysToOneShare({
        cashKrw: 0, dailyAmountKrw: 0, fxRate: 1379.1, price: 90.07, premiumPct: 5,
      }),
    ).toBeNull();
  });
});
