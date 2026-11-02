import { beforeEach, expect, it, vi } from "vitest";
import { getStocksInfo } from "@/lib/toss/client";
import { lookupSplitStockName } from "./split-stock";

vi.mock("@/lib/toss/client", () => ({ getStocksInfo: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it("입력을 정규화하고 선택한 시장의 종목명만 반환한다", async () => {
  vi.mocked(getStocksInfo).mockResolvedValue([
    { symbol: "AAPL", currency: "USD", name: "애플" },
  ] as Awaited<ReturnType<typeof getStocksInfo>>);
  expect(await lookupSplitStockName(" aapl ", "US")).toEqual({ ok: true, name: "애플" });
  expect(getStocksInfo).toHaveBeenCalledWith(["AAPL"]);
  expect((await lookupSplitStockName("AAPL", "KR")).ok).toBe(false);
});

it("불완전한 국내 코드와 잘못된 시장은 API를 호출하지 않는다", async () => {
  expect((await lookupSplitStockName("005", "KR")).ok).toBe(false);
  expect((await lookupSplitStockName("005930", "OTHER")).ok).toBe(false);
  expect(getStocksInfo).not.toHaveBeenCalled();
});

it("다른 종목이나 통화의 이름을 채우지 않는다", async () => {
  vi.mocked(getStocksInfo).mockResolvedValue([
    { symbol: "005930", currency: "USD", name: "잘못된 통화" },
    { symbol: "000660", currency: "KRW", name: "다른 종목" },
  ] as Awaited<ReturnType<typeof getStocksInfo>>);
  expect((await lookupSplitStockName("005930", "KR")).ok).toBe(false);
});

it("조회 실패를 이름 직접 입력 안내로 반환한다", async () => {
  vi.mocked(getStocksInfo).mockRejectedValue(new Error("offline"));
  expect(await lookupSplitStockName("005930", "KR")).toMatchObject({ ok: false });
});
