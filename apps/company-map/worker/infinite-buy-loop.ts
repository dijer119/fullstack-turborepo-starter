import { db } from "./db";
import { getMarketCalendarUS } from "@/lib/toss/client";
import { runCycle, type CycleConfig } from "@/lib/infinite-buy/run";
import { tossRunDeps, prismaPersistence, isKilled } from "@/lib/infinite-buy/toss-adapter";
import { runV4 } from "@/lib/infinite-buy/run-v4";
import { tossV4Deps } from "@/lib/infinite-buy/toss-adapter";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15분 폴

// 현재 진행 중인 US 정규장의 거래일 문자열 반환, 없으면 null.
// US 정규장은 KST 자정을 넘기므로(예: 월요일 세션 = KST 22:30~익일 05:00),
// 지금 열린 세션이 toss 캘린더의 previousBusinessDay에 있을 수 있다.
// 따라서 전·당·익일 세션을 모두 확인한다. (market.ts의 flatten과 동일한 이유)
async function usRegularTradeDate(): Promise<string | null> {
  try {
    const cal = await getMarketCalendarUS();
    const now = Date.now();
    for (const day of [cal.previousBusinessDay, cal.today, cal.nextBusinessDay]) {
      const reg = day?.regularMarket as { startTime?: string; endTime?: string } | undefined;
      if (!reg?.startTime || !reg?.endTime) continue; // 휴장/없음
      const open = new Date(reg.startTime).getTime();
      const close = new Date(reg.endTime).getTime();
      if (now >= open && now < close) return day.date;
    }
    return null;
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
