import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { refreshPriceChanges } from "@/lib/stocks/refresh-price-changes";

(async () => {
  const start = Date.now();
  const result = await refreshPriceChanges();
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`[price-change] done in ${elapsed}s`, result);
  process.exit(0);
})();
