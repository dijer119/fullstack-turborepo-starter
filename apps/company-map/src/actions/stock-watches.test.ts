import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  watches: vi.fn(), groups: vi.fn(), recent: vi.fn(), prices: vi.fn(), info: vi.fn(), previous: vi.fn(), base: vi.fn(), configured: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { stockWatch: { findMany: mocks.watches }, stockWatchGroup: { findMany: mocks.groups }, recentStockView: { findMany: mocks.recent } } }));
vi.mock("@/lib/toss/client", () => ({ getPrices: mocks.prices, getStocksInfo: mocks.info, getPreviousClose: mocks.previous, getPriceLimitBase: mocks.base, isTossConfigured: mocks.configured }));
vi.mock("@/lib/stocks/naver-search", () => ({ searchStocksByName: vi.fn() }));
import { listWatches, listWatchDashboard } from "./stock-watches";

const watch = { symbol: "005930", name: "삼성전자", market: "KOSPI", currency: "KRW", sortOrder: 0, purchasePrice: 80, createdAt: new Date("2026-10-30") };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.watches.mockResolvedValue([watch]); mocks.groups.mockResolvedValue([]); mocks.recent.mockResolvedValue([]);
  mocks.configured.mockReturnValue(true);
  mocks.prices.mockResolvedValue([{ symbol: "005930", lastPrice: "110", timestamp: "2026-10-30T06:30:00Z" }]);
  mocks.info.mockResolvedValue([{ symbol: "005930", koreanMarketDetail: { nxtSupported: true, nxtTradingSuspended: false } }]);
  mocks.previous.mockResolvedValue(100); mocks.base.mockResolvedValue(100);
});
describe("관심종목 대시보드 시세", () => {
  it("관심·최근 중복 종목은 한번만 조회하며 구매가와 그룹을 보존한다", async () => {
    mocks.recent.mockResolvedValue([{ symbol: "005930", name: "삼성전자", market: "KOSPI", currency: "KRW", viewedAt: new Date("2026-10-31") }]);
    mocks.groups.mockResolvedValue([{ id: "g", name: "반도체", members: [{ symbol: "005930" }] }]);
    const result = await listWatchDashboard();
    expect(mocks.prices).toHaveBeenCalledExactlyOnceWith(["005930"]);
    expect(result.watches[0]).toMatchObject({ purchasePrice: 80, lastPrice: 110, changeBase: 100, nxtSupported: true, quotedAt: "2026-10-30T06:30:00Z" });
    expect(result.recent[0]).toMatchObject({ symbol: "005930", lastPrice: 110 });
    expect(result.groups).toEqual([{ id: "g", name: "반도체", symbols: ["005930"] }]);
  });
  it("시세·기본정보 조회 실패에도 관심목록과 구매가는 표시한다", async () => {
    mocks.prices.mockRejectedValue(new Error("network")); mocks.info.mockRejectedValue(new Error("network"));
    expect((await listWatches())[0]).toMatchObject({ symbol: "005930", purchasePrice: 80, lastPrice: null, changeBase: null, quotedAt: null, nxtSupported: false });
  });
  it("시세가 잘못되었거나 NXT 중단이면 가격·배지를 만들지 않는다", async () => {
    mocks.prices.mockResolvedValue([{ symbol: "005930", lastPrice: "NaN", timestamp: "2026-10-30" }]);
    mocks.info.mockResolvedValue([{ symbol: "005930", koreanMarketDetail: { nxtSupported: true, nxtTradingSuspended: true } }]);
    expect((await listWatches())[0]).toMatchObject({ lastPrice: null, nxtSupported: false });
  });
  it("연동이 없어도 저장한 목록을 반환한다", async () => {
    mocks.configured.mockReturnValue(false);
    expect((await listWatches())[0].name).toBe("삼성전자");
    expect(mocks.prices).not.toHaveBeenCalled();
  });
});
