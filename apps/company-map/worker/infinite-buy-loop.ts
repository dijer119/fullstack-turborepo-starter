import { db } from "./db";
import { getMarketCalendarUS } from "@/lib/toss/client";
import { runCycle, type CycleConfig } from "@/lib/infinite-buy/run";
import { tossRunDeps, prismaPersistence, isKilled } from "@/lib/infinite-buy/toss-adapter";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15분 폴

// US 정규장 진행 중이면 오늘 거래일 문자열 반환, 아니면 null.
async function usRegularTradeDate(): Promise<string | null> {
  try {
    const cal = await getMarketCalendarUS();
    const day = cal.today;
    const reg = day.regularMarket as { startTime?: string; endTime?: string };
    if (!reg?.startTime || !reg?.endTime) return null; // 휴장
    const now = Date.now();
    const open = new Date(reg.startTime).getTime();
    const close = new Date(reg.endTime).getTime();
    return now >= open && now < close ? day.date : null;
  } catch (e) {
    console.error("[infinite-buy] calendar fetch failed:", e);
    return null;
  }
}

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
          const config: CycleConfig = {
            id: c.id, symbol: c.symbol, accountSeq: c.accountSeq,
            principalUsd: c.principal, splits: c.splits, profitTarget: c.profitTarget,
            bigBuyPremium: c.bigBuyPremium, lossCut: c.lossCut, round: c.round, dryRun: c.dryRun,
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
