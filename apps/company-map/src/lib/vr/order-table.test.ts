import { describe, expect, it } from "vitest";
import { buyTable, sellTable, MAX_LEVELS } from "./order-table";

// 62주차 실측: 보유 233주, 밴드 11871.69/16061.69, Pool 326.73 × 75% = 245.05
const BAND = { min: 11871.69, max: 16061.69 };

describe("buyTable", () => {
  it("62주차 매수점 재현: 50.95, 50.73, 50.52, 50.30 (budget 245.05로 4레벨)", () => {
    const orders = buyTable(233, BAND, 245.05);
    expect(orders.map((o) => o.price)).toEqual([50.95, 50.73, 50.52, 50.3]);
    expect(orders.every((o) => o.side === "BUY" && o.orderType === "LIMIT" && o.tif === "CLS" && o.quantity === 1)).toBe(true);
  });

  it("budget 무제한이면 MAX_LEVELS로 캡", () => {
    expect(buyTable(233, BAND, 1e9)).toHaveLength(MAX_LEVELS);
  });

  it("budget 0이면 빈 표", () => {
    expect(buyTable(233, BAND, 0)).toEqual([]);
  });

  it("보유 0주는 빈 표 (신규는 seed로 시작)", () => {
    expect(buyTable(0, BAND, 1000)).toEqual([]);
  });
});

describe("sellTable", () => {
  it("62주차 매도점 재현: 68.93, 69.23, 69.53", () => {
    const orders = sellTable(233, BAND);
    expect(orders.slice(0, 3).map((o) => o.price)).toEqual([68.93, 69.23, 69.53]);
    expect(orders.every((o) => o.side === "SELL" && o.orderType === "LIMIT" && o.tif === "DAY" && o.quantity === 1)).toBe(true);
    expect(orders).toHaveLength(MAX_LEVELS);
  });

  it("보유수량까지만 (보유 3주 → 3레벨, 마지막은 밴드상단/1)", () => {
    const orders = sellTable(3, BAND);
    expect(orders).toHaveLength(3);
    expect(orders[2].price).toBe(16061.69);
  });

  it("보유 0주는 빈 표", () => {
    expect(sellTable(0, BAND)).toEqual([]);
  });
});
