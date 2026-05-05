import { analyzeStock } from "../src/lib/stocks/analyze-stock";

(async () => {
  const r = await analyzeStock("005930");
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
})();
