import "./setup-env"; // MUST be the first import — populates process.env

import { loadKrxStocks } from "./load-krx";
import { analyzeAllStocks } from "./analyze-loop";
import { runNcavScreening } from "./ncav-loop";
import { tradeSyncTick } from "./trade-sync-loop";
import { priceChangeLoop } from "./price-change-loop";
import { etfPdfLoop } from "./etf-pdf-loop";

const TWO_MINUTES_MS = 120_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let shuttingDown = false;
let lastKrxLoad = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function backgroundUpdate() {
  console.log("[worker] starting background update loop (2min interval)");
  while (!shuttingDown) {
    const startedAt = Date.now();
    try {
      if (Date.now() - lastKrxLoad > ONE_DAY_MS) {
        await loadKrxStocks();
        lastKrxLoad = Date.now();
      }

      await analyzeAllStocks({ shouldStop: () => shuttingDown });
      if (shuttingDown) break;

      // NCAV·재무제표 배치(runNcavScreening)는 전종목 DART fnlttSinglAcnt 호출로
      // 일일 사용한도를 크게 소비하므로 자동 루프에서 제외했다.
      // /stocks "데이터 업데이트" 메뉴에서 수동 실행한다 (refresh kind: ncav_financials).

      try {
        await tradeSyncTick();
      } catch (err) {
        console.error("[worker] trade sync error:", err);
      }
    } catch (err) {
      console.error("[worker] cycle error:", err);
    }

    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, TWO_MINUTES_MS - elapsed);
    if (wait > 0 && !shuttingDown) {
      console.log(
        `[worker] cycle finished in ${elapsed}ms; sleeping ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  console.log("[worker] shutdown complete");
}

process.on("SIGINT", () => {
  console.log("[worker] SIGINT received");
  shuttingDown = true;
});
process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM received");
  shuttingDown = true;
});

if (process.argv.includes("--once")) {
  (async () => {
    await loadKrxStocks();
    await analyzeAllStocks({ shouldStop: () => false });
    await runNcavScreening();
    await tradeSyncTick();
    process.exit(0);
  })();
} else {
  backgroundUpdate();
  priceChangeLoop().catch((err) =>
    console.error("[worker] price-change loop crashed:", err),
  );
  etfPdfLoop().catch((err) =>
    console.error("[worker] etf-pdf loop crashed:", err),
  );
}
