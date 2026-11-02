import { db } from "./db";
import { splitLiveTick } from "@/lib/split/live-tick";
import { tossLiveDeps } from "@/lib/split/live-toss";

const CHECK_INTERVAL_MS = 30000;
export async function splitLiveLoop(
  shouldStop: () => boolean = () => false,
): Promise<void> {
  console.log(
    "[split-live] starting (30s poll, regular + KR NXT after-market, actual orders)",
  );
  let failures = 0;
  const deps = tossLiveDeps(db);
  const isKilled = deps.killed;
  deps.killed = () => shouldStop() || isKilled();
  while (!shouldStop()) {
    try {
      const result = await splitLiveTick(db, deps);
      failures = result.errors ? Math.min(failures + 1, 2) : 0;
      if (result.placed)
        console.log(`[split-live] submitted ${result.placed} order(s)`);
    } catch (error) {
      failures = Math.min(failures + 1, 2);
      console.error(
        "[split-live] tick failed:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
    if (shouldStop()) break;
    await new Promise((resolve) =>
      setTimeout(resolve, CHECK_INTERVAL_MS * 2 ** failures),
    );
  }
}
