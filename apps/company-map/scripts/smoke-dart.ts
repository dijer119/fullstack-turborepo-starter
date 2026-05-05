import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });

import { loadCorpCodeMap } from "../src/lib/dart/corp-code";
import { getLatestFinancial } from "../src/lib/dart/financial";

(async () => {
  const map = await loadCorpCodeMap();
  console.log("corp_code map size:", map.size);

  const corpCode = map.get("005930");
  if (!corpCode) {
    console.log("Samsung Electronics corp_code not found");
    process.exit(1);
  }
  console.log("005930 →", corpCode);

  const fin = await getLatestFinancial(corpCode);
  console.log("financial:", fin);
  process.exit(0);
})();
