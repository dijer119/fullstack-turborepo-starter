import {
  fetchNaverMain,
  fetchWisereport,
  parseNaverMain,
  parseTreasuryStock,
} from "./naver-scraper";
import { calculateIntrinsicValue, calculateSafetyMargin } from "./intrinsic-value";
import type { AnalyzeStockResult } from "@/types/stocks";

export async function analyzeStock(ticker: string): Promise<AnalyzeStockResult> {
  const [mainHtml, wiseHtml] = await Promise.all([
    fetchNaverMain(ticker),
    fetchWisereport(ticker),
  ]);

  const main = parseNaverMain(mainHtml);
  const treasury = parseTreasuryStock(wiseHtml);

  const epsArr = (["3년전", "2년전", "직전년도"] as const).map(
    (p) => main.historicalData[p].EPS,
  );
  const latestBps = main.historicalData["직전년도"].BPS;

  const intrinsicValue = calculateIntrinsicValue(epsArr, latestBps, treasury);
  const safetyMargin = calculateSafetyMargin(intrinsicValue, main.currentPrice);

  return {
    stockName: main.stockName,
    currentPrice: main.currentPrice,
    intrinsicValue,
    safetyMargin,
    treasuryShares: treasury.shares,
    treasuryRatio: treasury.ratio,
    dividendYield: main.dividendYield,
    historicalData: main.historicalData,
  };
}
