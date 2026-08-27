import { db } from "./db";
import { usRegularTradeDate } from "./us-market";
import { runDca } from "@/lib/dca/run-dca";
import { isDcaKilled, tossDcaDeps } from "@/lib/dca/toss-deps";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15분 폴

export async function dcaLoop(): Promise<void> {
  console.log("[dca-loop] starting (15min poll, US 정규장 거래일당 1회)");
  while (true) {
    try {
      const tradeDate = await usRegularTradeDate();
      if (tradeDate) {
        const accounts = await db.dcaAccount.findMany({ where: { status: "active" } });
        for (const a of accounts) {
          if (a.lastRunDate === tradeDate) continue; // 거래일당 1회
          try {
            const r = await runDca(db, tossDcaDeps(), a.id, tradeDate, isDcaKilled());
            console.log(`[dca] ${a.name} (${tradeDate}):`, r, a.dryRun ? "[dryRun]" : "[LIVE]");
          } catch (e) {
            console.error(`[dca] ${a.name} run failed:`, e);
          }
        }
      }
    } catch (e) {
      console.error("[dca-loop] iteration failed:", e);
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  }
}
