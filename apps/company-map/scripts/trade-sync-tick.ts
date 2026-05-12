import "../worker/setup-env";
import { tradeSyncTick } from "../worker/trade-sync-loop";

// TRADE_SYNC_FORCE=1 yarn tsx scripts/trade-sync-tick.ts  → 날짜 무시하고 강제 실행
(async () => {
  const results = await tradeSyncTick();
  console.log("\nSummary:");
  for (const r of results) {
    console.log(`  ${r.category} ${r.ym6}: ${r.skipped ? `skipped (${r.reason})` : `${r.saved} saved`}`);
  }
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
