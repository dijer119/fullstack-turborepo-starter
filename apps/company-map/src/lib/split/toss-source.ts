import { getPrices } from "@/lib/toss/client";
import { validatePrice, type SplitConfig } from "./engine";
import type { SimulationInput } from "./run";

export async function getTossObservation(
  config: Pick<SplitConfig, "symbol" | "market">,
  now = Date.now(),
): Promise<SimulationInput> {
  const prices = await getPrices([config.symbol]);
  const quote = prices.find((price) => price.symbol === config.symbol);
  if (!quote || quote.currency !== (config.market === "KR" ? "KRW" : "USD")) {
    throw new Error("해당 종목·통화의 토스 시세를 확인할 수 없습니다.");
  }
  const price = Number(quote.lastPrice);
  validatePrice(price, config.market);
  const timestamp = Date.parse(quote.timestamp);
  if (
    !Number.isFinite(timestamp) ||
    now - timestamp > 5 * 60 * 1000 ||
    timestamp - now > 60000
  ) {
    throw new Error(
      "최근 5분 이내의 토스 시세가 없습니다. 장 마감·거래정지·시세 시각을 확인하세요.",
    );
  }
  return {
    source: "toss",
    prices: [price],
    observedAt: new Date(timestamp).toISOString(),
    requestKey: `toss:${timestamp}:${price}`,
  };
}
