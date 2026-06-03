import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { snapshotAllEtfs } from "../worker/etf-snapshot";

(async () => {
  await snapshotAllEtfs();
  process.exit(0);
})();
