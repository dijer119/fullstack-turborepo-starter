import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ fetch: vi.fn(), ownership: vi.fn() }));
vi.mock("undici", () => ({ Agent: class {}, fetch: mock.fetch }));
vi.mock("./order-ownership", () => ({ checkBrokerOwnership: mock.ownership }));
const raw = {
  orderId: "o1",
  symbol: "AAPL",
  side: "BUY",
  quantity: "3",
  price: "10.12",
  currency: "USD",
  orderedAt: "2026-10-30T01:00:00Z",
  status: "PARTIAL_FILLED",
  execution: {
    filledQuantity: "1",
    filledAmount: "10.1",
    commission: "0.01",
    tax: "0",
  },
};
let response = raw;
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("TOSS_API_KEY", "test-key");
  vi.stubEnv("TOSS_API_SECRET", "test-secret");
  mock.fetch.mockReset();
  mock.ownership.mockReset();
  mock.ownership.mockResolvedValue(undefined);
  response = raw;
  mock.fetch.mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("oauth2/token")
            ? { access_token: "test-token", expires_in: 3600 }
            : { result: response },
        ),
        { status: 200 },
      ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("실거래 토스 HTTP 경계", () => {
  it("주문번호 상세 조회를 고정 계좌 헤더로 읽고 누적 체결을 보존한다", async () => {
    const { getOrder } = await import("./client");
    expect(await getOrder(42, "o1")).toMatchObject({
      orderId: "o1",
      filledQty: 1,
      filledAmount: 10.1,
      commission: 0.01,
      tax: 0,
    });
    expect(mock.fetch).toHaveBeenLastCalledWith(
      "https://openapi.tossinvest.com/api/v1/orders/o1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "X-Tossinvest-Account": "42" }),
      }),
    );
  });
  it("체결 누락 비용과 잘못된 숫자를 확정 0으로 숨기지 않는다", async () => {
    const { getOrder } = await import("./client");
    response = {
      ...raw,
      execution: {
        ...raw.execution,
        filledQuantity: "bad",
        commission: "",
        tax: null as unknown as string,
      },
    };
    const order = await getOrder(42, "o1");
    expect(order.filledQty).toBeNaN();
    expect(order.commission).toBeNaN();
    expect(order.tax).toBeNull();
  });
  it("소유권 거부 시 인증·주문 HTTP 호출을 하지 않는다", async () => {
    const { createOrder } = await import("./client");
    mock.ownership.mockRejectedValue(new Error("owned"));
    await expect(
      createOrder(42, {
        symbol: "AAPL",
        side: "BUY",
        orderType: "LIMIT",
        quantity: "3",
        price: "10.12",
      }),
    ).rejects.toMatchObject({ name: "TossApiError", status: 422 });
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("소유자 식별자는 브로커 본문에 섞지 않고 고정 멱등 키를 보낸다", async () => {
    const { createOrder } = await import("./client");
    await createOrder(
      42,
      {
        symbol: "AAPL",
        side: "BUY",
        orderType: "LIMIT",
        quantity: "3",
        price: "10.12",
        clientOrderId: "fixed-order",
      },
      "strategy",
      new Date(Date.now() + 60000),
    );
    expect(mock.ownership).toHaveBeenCalledWith(42, "AAPL", "strategy");
    const options = mock.fetch.mock.calls.at(-1)?.[1] as { body: string };
    expect(JSON.parse(options.body)).toEqual({
      symbol: "AAPL",
      side: "BUY",
      orderType: "LIMIT",
      quantity: "3",
      price: "10.12",
      timeInForce: "DAY",
      clientOrderId: "fixed-order",
    });
  });
  it("OAuth 응답을 기다리는 동안 장이 닫히면 주문 POST를 보내지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T01:00:00Z"));
    const { createOrder } = await import("./client");
    const close = new Date(Date.now() + 1000);
    mock.fetch.mockImplementation(async (url: string) => {
      if (url.includes("oauth2/token")) {
        vi.setSystemTime(new Date(close.getTime() + 1));
        return new Response(
          JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        );
      }
      return new Response(
        JSON.stringify({ result: { orderId: "unexpected" } }),
      );
    });
    await expect(
      createOrder(
        42,
        {
          symbol: "AAPL",
          side: "BUY",
          orderType: "LIMIT",
          quantity: "3",
          price: "10.12",
        },
        "strategy",
        close,
      ),
    ).rejects.toThrow();
    expect(
      mock.fetch.mock.calls.filter(([url]) =>
        (url as string).includes("/api/v1/orders"),
      ),
    ).toHaveLength(0);
  });
  it("일반 주문도 OAuth 대기 중 LIVE 소유권이 생기면 전송하지 않는다", async () => {
    const { createOrder } = await import("./client");
    mock.ownership
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("LIVE owns this symbol"));
    await expect(
      createOrder(42, {
        symbol: "AAPL",
        side: "BUY",
        orderType: "LIMIT",
        quantity: "3",
        price: "10.12",
      }),
    ).rejects.toThrow();
    expect(
      mock.fetch.mock.calls.filter(([url]) =>
        (url as string).includes("/api/v1/orders"),
      ),
    ).toHaveLength(0);
  });
});
