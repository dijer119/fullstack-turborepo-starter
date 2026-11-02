import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrder,
  getPrices,
  getStocksInfo,
  getMarketCalendarUS,
  getMarketCalendarKR,
  getHoldings,
  getOrders,
  getBuyingPower,
  getSellableQuantity,
  getAccounts,
} from "@/lib/toss/client";
import { tossLiveDeps, tickSizeKR } from "./live-toss";
import type {
  PrismaClient,
  SplitLiveStrategy,
  SplitLiveOrder,
} from "@prisma-clients/company-map";
vi.mock("@/lib/toss/client", () => ({
  createOrder: vi.fn(),
  getPrices: vi.fn(),
  getStocksInfo: vi.fn(),
  getMarketCalendarUS: vi.fn(),
  getMarketCalendarKR: vi.fn(),
  getHoldings: vi.fn(),
  getOrders: vi.fn(),
  getBuyingPower: vi.fn(),
  getSellableQuantity: vi.fn(),
  getAccounts: vi.fn(),
  getOrder: vi.fn(),
  getExchangeRate: vi.fn(async () => 1400),
  getDefaultAccountSeq: vi.fn(async () => 42),
}));
const s = {
  id: "s",
  accountSeq: 42,
  symbol: "AAPL",
  market: "US",
} as SplitLiveStrategy;
const db = {
  infiniteBuyCycle: { findFirst: vi.fn(async () => null) },
  dcaAccount: { findFirst: vi.fn(async () => null) },
} as unknown as PrismaClient;
beforeEach(() => vi.clearAllMocks());
describe("토스 실거래 어댑터", () => {
  it("정수주 지정가 DAY와 영구 요청 키, 고정 계좌·소유권을 넘긴다", async () => {
    vi.mocked(createOrder).mockResolvedValue({
      orderId: "broker",
      clientOrderId: "cid",
    });
    const deadline = new Date(Date.now() + 60000);
    await tossLiveDeps(db).submit(
      s,
      {
        side: "BUY",
        quantity: 3,
        price: 10.12,
        clientOrderId: "cid",
      } as SplitLiveOrder,
      deadline,
    );
    expect(createOrder).toHaveBeenCalledWith(
      42,
      {
        symbol: "AAPL",
        side: "BUY",
        quantity: "3",
        price: "10.12",
        orderType: "LIMIT",
        timeInForce: "DAY",
        clientOrderId: "cid",
      },
      "s",
      deadline,
    );
  });
  it("시장정보·계좌와 실제 보유, 미체결·가용금액을 읽고 정규장을 판별한다", async () => {
    const now = new Date();
    vi.mocked(getAccounts).mockResolvedValue([
      { accountSeq: 42, accountNo: "masked", accountType: "BROKERAGE" },
    ]);
    vi.mocked(getPrices).mockResolvedValue([
      {
        symbol: "AAPL",
        currency: "USD",
        lastPrice: "10",
        timestamp: now.toISOString(),
      },
    ]);
    vi.mocked(getStocksInfo).mockResolvedValue([
      {
        symbol: "AAPL",
        name: "Apple",
        englishName: "Apple",
        market: "NASDAQ",
        currency: "USD",
        status: "ACTIVE",
        securityType: "STOCK",
      },
    ]);
    vi.mocked(getMarketCalendarUS).mockResolvedValue({
      today: {
        date: "2026-10-30",
        regularMarket: {
          startTime: new Date(now.getTime() - 1000).toISOString(),
          endTime: new Date(now.getTime() + 1000).toISOString(),
        },
      },
    } as Awaited<ReturnType<typeof getMarketCalendarUS>>);
    vi.mocked(getHoldings).mockResolvedValue({
      items: [],
    } as unknown as Awaited<ReturnType<typeof getHoldings>>);
    vi.mocked(getOrders).mockResolvedValue([]);
    vi.mocked(getBuyingPower).mockResolvedValue(300);
    vi.mocked(getSellableQuantity).mockResolvedValue(0);
    expect(await tossLiveDeps(db).snapshot(s)).toMatchObject({
      price: 10,
      isOpen: true,
      holdingQty: 0,
      buyingPower: 300,
      openOrderIds: [],
      conflict: null,
    });
    expect(getMarketCalendarKR).not.toHaveBeenCalled();
  });
  it("국내 주식과 ETF 호가를 구별하고 알 수 없는 유형을 거부한다", () => {
    expect(tickSizeKR(70000, "STOCK")).toBe(100);
    expect(tickSizeKR(70000, "ETF")).toBe(5);
    expect(tickSizeKR(1501, "ETF")).toBe(1);
    expect(() => tickSizeKR(10000, "OTHER")).toThrow();
  });
});


describe("국내 NXT 애프터마켓", () => {
  afterEach(() => vi.useRealTimers());
  it.each([
    ["정규장", "09:00:00", true, false, "15:30:00"],
    ["단일가 구간", "15:35:00", true, false, null],
    ["접속매매 시작", "15:40:00", true, false, "20:00:00"],
    ["장후", "16:50:00", true, false, "20:00:00"],
    ["종료 직전", "19:59:59", true, false, "20:00:00"],
    ["종료 시각", "20:00:00", true, false, null],
    ["NXT 미지원", "16:50:00", false, false, null],
    ["NXT 거래정지", "16:50:00", true, true, null],
    ["NXT 정지 여부 미확인", "16:50:00", true, null, null],
    ["프리마켓", "08:30:00", true, false, null],
    ["NXT 정보 누락", "16:50:00", undefined, undefined, null],
    ["NXT 휴장", "16:50:00", true, false, null, null],
    ["NXT 일정 오류", "16:50:00", true, false, null, "invalid"],
  ])("%s", async (_label, time, supported, suspended, end, auctionEnd = "2026-10-30T15:40:00+09:00") => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`2026-10-30T${time}+09:00`));
    vi.mocked(getAccounts).mockResolvedValue([
      { accountSeq: 42, accountNo: "masked", accountType: "BROKERAGE" },
    ]);
    vi.mocked(getStocksInfo).mockResolvedValue([{
      symbol: "005930", name: "삼성전자", englishName: "Samsung",
      market: "KOSPI", currency: "KRW", status: "ACTIVE", securityType: "STOCK",
      koreanMarketDetail: { nxtSupported: supported, nxtTradingSuspended: suspended },
    } as Awaited<ReturnType<typeof getStocksInfo>>[number]]);
    vi.mocked(getPrices).mockResolvedValue([{
      symbol: "005930", currency: "KRW", lastPrice: "225000", timestamp: new Date().toISOString(),
    }]);
    vi.mocked(getMarketCalendarKR).mockResolvedValue({
      today: { date: "2026-10-30", integrated: {
        preMarket: { startTime: "2026-10-30T08:00:00+09:00", endTime: "2026-10-30T09:00:00+09:00" },
        regularMarket: { startTime: "2026-10-30T09:00:00+09:00", endTime: "2026-10-30T15:30:00+09:00" },
        afterMarket: { startTime: "2026-10-30T15:30:00+09:00", singlePriceAuctionEndTime: auctionEnd, endTime: "2026-10-30T20:00:00+09:00" },
      } },
    } as Awaited<ReturnType<typeof getMarketCalendarKR>>);
    vi.mocked(getHoldings).mockResolvedValue({ items: [] } as unknown as Awaited<ReturnType<typeof getHoldings>>);
    vi.mocked(getOrders).mockResolvedValue([]);
    vi.mocked(getBuyingPower).mockResolvedValue(1000000);
    vi.mocked(getSellableQuantity).mockResolvedValue(0);
    const snap = await tossLiveDeps(db).snapshot({ ...s, symbol: "005930", market: "KR" });
    expect(snap.isOpen).toBe(end !== null);
    expect(snap.sessionEndsAt).toEqual(end ? new Date(`2026-10-30T${end}+09:00`) : null);
  });
});
