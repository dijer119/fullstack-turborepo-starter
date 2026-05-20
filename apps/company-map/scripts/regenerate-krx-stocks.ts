/**
 * KRX OpenAPI에서 KOSPI/KOSDAQ 전종목 fetch → src/data/krx_stocks.json 갱신.
 * 실행: npx tsx scripts/regenerate-krx-stocks.ts
 * 이후 `npx tsx scripts/smoke-load-krx.ts`로 DB 반영.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchAllKrxStocks } from "../worker/fetch-krx";

(async () => {
  const stocks = await fetchAllKrxStocks();
  if (stocks.length === 0) {
    console.error("[krx] 0 stocks fetched — JSON 보존, 종료");
    process.exit(1);
  }
  stocks.sort((a, b) => (b.Marcap ?? 0) - (a.Marcap ?? 0));
  const outPath = join(__dirname, "..", "src", "data", "krx_stocks.json");
  writeFileSync(outPath, JSON.stringify(stocks), "utf-8");
  const kospi = stocks.filter((s) => s.Market === "KOSPI").length;
  const kosdaq = stocks.filter((s) => s.Market === "KOSDAQ").length;
  console.log(
    `[krx] wrote ${stocks.length} stocks → ${outPath} (KOSPI ${kospi}, KOSDAQ ${kosdaq})`,
  );
  process.exit(0);
})();
