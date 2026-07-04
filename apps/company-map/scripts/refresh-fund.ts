import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { snapshotFund } from "../worker/fund-snapshot";

(async () => {
  const result = await snapshotFund();
  console.log("[refresh-fund]", result);
  process.exit(0);
})();
