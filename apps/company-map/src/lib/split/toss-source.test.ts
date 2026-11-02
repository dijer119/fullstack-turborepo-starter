import { describe, expect, it, vi } from "vitest";

// 주문 함수를 제공하지 않는 mock: 모의 경로가 주문 API에 의존하면 import부터 실패한다.
vi.mock("@/lib/toss/client", () => ({ getPrices: vi.fn() }));
import { getPrices } from "@/lib/toss/client";
import { getTossObservation } from "./toss-source";

const now = Date.parse("2026-10-30T01:00:00Z");

describe("토스 시세 → 모의 관측", () => {
  it("기존 배치 시세 조회만 재사용해 결정적인 시세 키를 만든다", async () => {
    vi.mocked(getPrices).mockResolvedValue([
      {
        symbol: "005930",
        currency: "KRW",
        lastPrice: "70000",
        timestamp: "2026-10-30T00:59:59Z",
      },
    ]);
    const quote = await getTossObservation(
      { symbol: "005930", market: "KR" },
      now,
    );
    expect(getPrices).toHaveBeenCalledWith(["005930"]);
    expect(quote).toMatchObject({
      source: "toss",
      prices: [70000],
      observedAt: "2026-10-30T00:59:59.000Z",
    });
    expect(
      (await getTossObservation({ symbol: "005930", market: "KR" }, now))
        .requestKey,
    ).toBe(quote.requestKey);
  });

  it("누락·다른 통화·오래된 시세·미래 시세·잘못된 가격은 기록하지 않는다", async () => {
    const quote = {
      symbol: "005930",
      currency: "KRW" as const,
      lastPrice: "70000",
      timestamp: "2026-10-30T00:59:59Z",
    };
    for (const prices of [
      [],
      [{ ...quote, currency: "USD" as const }],
      [{ ...quote, lastPrice: "NaN" }],
      [{ ...quote, timestamp: "bad" }],
      [{ ...quote, timestamp: "2026-10-30T00:00:00Z" }],
      [{ ...quote, timestamp: "2026-10-30T02:00:00Z" }],
    ]) {
      vi.mocked(getPrices).mockResolvedValue(prices);
      await expect(
        getTossObservation({ symbol: "005930", market: "KR" }, now),
      ).rejects.toThrow();
    }
  });
});
