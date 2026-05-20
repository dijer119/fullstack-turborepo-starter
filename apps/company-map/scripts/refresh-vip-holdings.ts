import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { refreshVipHoldings } from "@/lib/dart/vip-holdings";

(async () => {
  const start = Date.now();
  console.log("[vip] refresh started");
  try {
    const result = await refreshVipHoldings();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[vip] done in ${elapsed}s`, result);
    process.exit(0);
  } catch (e) {
    console.error("[vip] failed:", e);
    process.exit(1);
  }
})();
