import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { fetchElestock, buildElestockMap } from "../src/lib/dart/elestock";
import {
  fetchMajorstockDetail,
  buildMajorstockMap,
} from "../src/lib/dart/majorstock-detail";

const corpCode = process.argv[2] ?? "00126380";
const bgnDe = "20220101";
const endDe = "20260527";

(async () => {
  console.log("=== elestock raw ===");
  const ele = await fetchElestock({ corpCode, bgnDe, endDe });
  console.log("status:", ele?.status, "count:", ele?.list?.length);
  if (ele?.list && ele.list.length > 0) {
    console.log("keys:", Object.keys(ele.list[0]));
    console.log("sample:", JSON.stringify(ele.list[0], null, 2));
  }

  console.log("\n=== elestock map ===");
  const eMap = await buildElestockMap({ corpCode, bgnDe, endDe });
  console.log("size:", eMap.size);
  const eFirst = [...eMap.values()][0];
  console.log("sample detail:", eFirst);

  console.log("\n=== majorstock raw ===");
  const maj = await fetchMajorstockDetail({ corpCode, bgnDe, endDe });
  console.log("status:", maj?.status, "count:", maj?.list?.length);
  if (maj?.list && maj.list.length > 0) {
    console.log("keys:", Object.keys(maj.list[0]));
    console.log("sample:", JSON.stringify(maj.list[0], null, 2));
  }

  console.log("\n=== majorstock map ===");
  const mMap = await buildMajorstockMap({ corpCode, bgnDe, endDe });
  console.log("size:", mMap.size);
  const mFirst = [...mMap.values()][0];
  console.log("sample detail:", mFirst);

  process.exit(0);
})();
