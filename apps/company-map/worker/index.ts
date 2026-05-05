import { loadKrxStocks } from "./load-krx";
import { analyzeAllStocks } from "./analyze-loop";
import { runNcavScreening } from "./ncav-loop";

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

      try {
        await runNcavScreening();
      } catch (err) {
        console.error("[worker] NCAV screening error:", err);
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
    process.exit(0);
  })();
} else {
  backgroundUpdate();
}
