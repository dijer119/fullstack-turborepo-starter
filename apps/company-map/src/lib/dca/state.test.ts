import { describe, expect, it } from "vitest";
import { accrue, applyFills, deriveHoldings } from "./state";

describe("applyFills", () => {
  it("체결가 × 수량 × 주문 시 환율만큼 차감", () => {
    // 94.57 × 23 × 1379.1 = 2,999,... → 종가 체결이면 더 적게 나간다
    expect(applyFills(3_000_000, [{ filledQty: 23, filledPrice: 90.07, fxRate: 1379.1 }])).toBe(
      Math.round(3_000_000 - 90.07 * 23 * 1379.1),
    );
  });

  it("미체결(filledQty/filledPrice null)은 무시 — 잔액 그대로 이월", () => {
    expect(applyFills(1_000_000, [{ filledQty: null, filledPrice: null, fxRate: 1379.1 }])).toBe(1_000_000);
    expect(applyFills(1_000_000, [{ filledQty: 1, filledPrice: null, fxRate: 1379.1 }])).toBe(1_000_000);
    expect(applyFills(1_000_000, [{ filledQty: null, filledPrice: 90, fxRate: 1379.1 }])).toBe(1_000_000);
  });

  it("여러 건 누적 차감", () => {
    const r = applyFills(1_000_000, [
      { filledQty: 1, filledPrice: 100, fxRate: 1000 },
      { filledQty: 2, filledPrice: 100, fxRate: 1000 },
    ]);
    expect(r).toBe(1_000_000 - 300_000);
  });

  it("환율이 비정상인 체결은 건너뛴다 (잔액 오염 방지)", () => {
    expect(applyFills(500_000, [{ filledQty: 1, filledPrice: 100, fxRate: 0 }])).toBe(500_000);
    expect(applyFills(500_000, [{ filledQty: 1, filledPrice: 100, fxRate: Number.NaN }])).toBe(500_000);
  });

  it("빈 배열이면 잔액 불변", () => {
    expect(applyFills(777_777, [])).toBe(777_777);
  });

  it("잔액보다 큰 체결이 들어와도 음수를 그대로 반영 (은폐하지 않음)", () => {
    expect(applyFills(100_000, [{ filledQty: 1, filledPrice: 100, fxRate: 1000 }])).toBe(0);
    expect(applyFills(50_000, [{ filledQty: 1, filledPrice: 100, fxRate: 1000 }])).toBe(-50_000);
  });
});

describe("accrue", () => {
  it("첫 실행이면 적립", () => {
    expect(accrue({ cashKrw: 0, lastAccrualDate: null, tradeDate: "2026-08-27", dailyAmountKrw: 50_000 })).toEqual({
      cashKrw: 50_000,
      accrued: true,
    });
  });

  it("같은 거래일 재호출은 적립하지 않음 (중복 적립 방지)", () => {
    expect(
      accrue({ cashKrw: 50_000, lastAccrualDate: "2026-08-27", tradeDate: "2026-08-27", dailyAmountKrw: 50_000 }),
    ).toEqual({ cashKrw: 50_000, accrued: false });
  });

  it("거래일이 바뀌면 다시 적립", () => {
    expect(
      accrue({ cashKrw: 50_000, lastAccrualDate: "2026-08-27", tradeDate: "2026-08-28", dailyAmountKrw: 50_000 }),
    ).toEqual({ cashKrw: 100_000, accrued: true });
  });

  it("적립액이 0 이하면 적립하지 않음", () => {
    expect(accrue({ cashKrw: 10, lastAccrualDate: null, tradeDate: "2026-08-27", dailyAmountKrw: 0 })).toEqual({
      cashKrw: 10,
      accrued: false,
    });
  });
});

describe("deriveHoldings", () => {
  it("종목별 체결 수량 합산", () => {
    expect(
      deriveHoldings([
        { symbol: "QQQ", filledQty: 1 },
        { symbol: "QLD", filledQty: 23 },
        { symbol: "QQQ", filledQty: 2 },
        { symbol: "QLD", filledQty: null }, // 미체결 무시
      ]),
    ).toEqual({ QQQ: 3, QLD: 23 });
  });

  it("체결이 없으면 빈 객체", () => {
    expect(deriveHoldings([])).toEqual({});
  });
});
