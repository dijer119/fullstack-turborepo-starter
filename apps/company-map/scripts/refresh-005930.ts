import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });

import { fetchDisclosuresForStock } from "../src/actions/disclosures";

(async () => {
  const r = await fetchDisclosuresForStock(process.argv[2] ?? "005930");
  console.log(r);
  process.exit(0);
})();
