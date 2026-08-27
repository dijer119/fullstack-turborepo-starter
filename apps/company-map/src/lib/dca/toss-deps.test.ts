import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertSubmittable, pickPrevTradeClose, tossDcaDeps } from "./toss-deps";
import { createOrder } from "@/lib/toss/client";

// 어댑터 경계 검증용 — 실주문이 나가지 않도록 토스 클라이언트를 통째로 대체한다.
vi.mock("@/lib/toss/client", () => ({
  createOrder: vi.fn(),
  getBuyingPower: vi.fn(),
  getDailyCandles: vi.fn(),
  getDefaultAccountSeq: vi.fn(),
  getExchangeRate: vi.fn(),
  getMarketCalendarUS: vi.fn(),
  getOrders: vi.fn(),
  getPrices: vi.fn(),
}));

const mockCreateOrder = vi.mocked(createOrder);

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

describe("tossDcaDeps().submitOrder — 어댑터 경계", () => {
  const ID = "dca-a1b2c3d4e5f67890-20260828";

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateOrder.mockResolvedValue({ orderId: "T-1", clientOrderId: ID });
  });

  it("createOrder에 금액 기반 본문만 정확히 넘긴다 (orderAmount는 문자열)", async () => {
    const r = await tossDcaDeps().submitOrder(42, { amountUsd: 36.25, clientOrderId: ID }, "QQQ");

    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    // 완전 일치 — quantity·price·timeInForce가 섞여 들어가면 여기서 깨진다.
    expect(mockCreateOrder).toHaveBeenCalledWith(42, {
      symbol: "QQQ",
      side: "BUY",
      orderType: "MARKET",
      orderAmount: "36.25",
      clientOrderId: ID,
    });
    // 타입 시스템은 필드 조합만 막아줄 뿐 문자열화까지 검증하지 못한다.
    const body = mockCreateOrder.mock.calls[0][1] as { orderAmount: unknown };
    expect(typeof body.orderAmount).toBe("string");
    expect(r).toEqual({ tossOrderId: "T-1" });
  });

  it("소수 둘째 자리까지의 금액을 그대로 문자열로 싣는다", async () => {
    await tossDcaDeps().submitOrder(7, { amountUsd: 1234.5, clientOrderId: ID }, "QLD");
    expect(mockCreateOrder).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ symbol: "QLD", orderAmount: "1234.5" }),
    );
  });

  it("금액이 비정상이면 createOrder에 닿기 전에 throw", async () => {
    const deps = tossDcaDeps();
    await expect(deps.submitOrder(42, { amountUsd: 0.005, clientOrderId: ID }, "QQQ")).rejects.toThrow();
    await expect(deps.submitOrder(42, { amountUsd: 36.251, clientOrderId: ID }, "QQQ")).rejects.toThrow();
    await expect(
      deps.submitOrder(42, { amountUsd: Number.NaN, clientOrderId: ID }, "QQQ"),
    ).rejects.toThrow();
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("clientOrderId가 비정상이면 createOrder에 닿기 전에 throw", async () => {
    const deps = tossDcaDeps();
    await expect(deps.submitOrder(42, { amountUsd: 36.25, clientOrderId: "" }, "QQQ")).rejects.toThrow();
    await expect(
      deps.submitOrder(42, { amountUsd: 36.25, clientOrderId: "a".repeat(37) }, "QQQ"),
    ).rejects.toThrow();
    await expect(
      deps.submitOrder(42, { amountUsd: 36.25, clientOrderId: "dca 20260828" }, "QQQ"),
    ).rejects.toThrow();
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });
});
