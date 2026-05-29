import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { runNcavScreening } from "../worker/ncav-loop";

// /stocks "데이터 업데이트" → "NCAV·재무제표" 수동 실행 진입점.
// 전종목을 순회하며 24시간 이상 지난 종목만 DART 재무(fnlttSinglAcnt)를 갱신한다.
(async () => {
  const start = Date.now();
  try {
    const result = await runNcavScreening();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(
      `[ncav] refresh done in ${elapsed}s { analyzed: ${result.analyzed}, skipped: ${result.skipped}, positive: ${result.ncavPositive} }`,
    );
    process.exit(0);
  } catch (err) {
    console.error("[ncav] refresh failed:", err);
    process.exit(1);
  }
})();
