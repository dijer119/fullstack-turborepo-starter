import { db } from "./db";
import { refreshPriceChanges } from "@/lib/stocks/refresh-price-changes";

const KIND = "price_changes";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SCHEDULE_HOUR_KST = 18;

async function shouldRunNow(now: Date = new Date()): Promise<boolean> {
  const today6pm = new Date(now);
  today6pm.setHours(SCHEDULE_HOUR_KST, 0, 0, 0);
  if (now < today6pm) return false;
  const state = await db.refreshState.findUnique({ where: { kind: KIND } });
  if (!state?.finishedAt) return true;
  return state.finishedAt < today6pm;
}

export async function priceChangeLoop(): Promise<void> {
  console.log("[price-change-loop] starting (5min poll, schedule 18:00 KST)");
  while (true) {
    try {
      if (await shouldRunNow()) {
        console.log("[price-change-loop] running at", new Date().toISOString());
        await refreshPriceChanges();
      }
    } catch (e) {
      console.error("[price-change-loop] iteration failed:", e);
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  }
}
