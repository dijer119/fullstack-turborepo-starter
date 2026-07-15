import { db } from "./db";
import { usRegularTradeDate } from "./us-market";
import { runCycle, type CycleConfig } from "@/lib/infinite-buy/run";
import { tossRunDeps, prismaPersistence, isKilled } from "@/lib/infinite-buy/toss-adapter";
import { runV4 } from "@/lib/infinite-buy/run-v4";
import { tossV4Deps } from "@/lib/infinite-buy/toss-adapter";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15분 폴

export async function infiniteBuyLoop(): Promise<void> {
  console.log("[infinite-buy-loop] starting (15min poll, US 정규장 거래일당 1회)");
  const deps = tossRunDeps();
  const persist = prismaPersistence(db);
  while (true) {
    try {
      const tradeDate = await usRegularTradeDate();
      if (tradeDate) {
        const cycles = await db.infiniteBuyCycle.findMany({ where: { status: "active" } });
        for (const c of cycles) {
          if (c.lastRunDate === tradeDate) continue; // 거래일당 1회
          if (c.version === "v4.0") {
            try {
              const r = await runV4(db, tossV4Deps(), c.id, tradeDate, isKilled());
              console.log(`[infinite-buy] ${c.symbol} v4 (${tradeDate}):`, r, c.dryRun ? "[dryRun]" : "[LIVE]");
            } catch (e) {
              console.error(`[infinite-buy] ${c.symbol} v4 run failed:`, e);
            }
            continue;
          }
          const config: CycleConfig = {
            id: c.id, symbol: c.symbol, accountSeq: c.accountSeq,
            principalUsd: c.principal, splits: c.splits, profitTarget: c.profitTarget,
            bigBuyPremium: c.bigBuyPremium, lossCut: c.lossCut, round: c.round, dryRun: c.dryRun, version: c.version as "v1" | "v2.2",
          };
          try {
            const r = await runCycle(persist, deps, config, tradeDate, isKilled());
            console.log(`[infinite-buy] ${c.symbol} (${tradeDate}):`, r, c.dryRun ? "[dryRun]" : "[LIVE]");
          } catch (e) {
            console.error(`[infinite-buy] ${c.symbol} run failed:`, e);
          }
        }
      }
    } catch (e) {
      console.error("[infinite-buy-loop] iteration failed:", e);
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  }
}
