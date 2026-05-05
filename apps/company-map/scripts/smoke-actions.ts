import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });

import { getTopStocks } from "../src/actions/stocks";
import { getNcavStocks } from "../src/actions/ncav";

(async () => {
  try {
    const top = await getTopStocks({ limit: 5, dividend: null });
    console.log("getTopStocks ok:", top.length, "rows");
    if (top[0]) console.log("  sample:", JSON.stringify(top[0]));
  } catch (e) {
    console.error("getTopStocks FAILED:", e);
  }
  try {
    const ncav = await getNcavStocks({ limit: 5 });
    console.log(
      "getNcavStocks ok:",
      ncav.stocks.length,
      "rows; total=",
      ncav.total,
      "positive=",
      ncav.positiveCount,
    );
    if (ncav.stocks[0]) console.log("  sample:", JSON.stringify(ncav.stocks[0]));
  } catch (e) {
    console.error("getNcavStocks FAILED:", e);
  }
  process.exit(0);
})();
