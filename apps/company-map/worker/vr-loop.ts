import { db } from "./db";
import { usRegularTradeDate } from "./us-market";
import { runVr } from "@/lib/vr/run-vr";
import { isVrKilled, tossVrDeps } from "@/lib/vr/toss-deps";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15분 폴

export async function vrLoop(): Promise<void> {
  console.log("[vr-loop] starting (15min poll, US 정규장 거래일당 1회)");
  while (true) {
    try {
      const tradeDate = await usRegularTradeDate();
      if (tradeDate) {
        const accounts = await db.vrAccount.findMany({ where: { status: "active" } });
        for (const a of accounts) {
          if (a.lastRunDate === tradeDate) continue; // 거래일당 1회
          try {
            const r = await runVr(db, tossVrDeps(), a.id, tradeDate, isVrKilled());
            console.log(`[vr] ${a.symbol} (${tradeDate}):`, r, a.dryRun ? "[dryRun]" : "[LIVE-blocked]");
          } catch (e) {
            console.error(`[vr] ${a.symbol} run failed:`, e);
          }
        }
      }
    } catch (e) {
      console.error("[vr-loop] iteration failed:", e);
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  }
}
