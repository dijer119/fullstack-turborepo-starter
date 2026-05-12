import "../worker/setup-env";
import { ingestRange } from "../worker/trade-ingest";
import { CATEGORIES, type CategoryKey } from "../src/lib/trade/categories";

function currentYm(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

(async () => {
  // Usage: tsx scripts/ingest-trade.ts [category] [start] [end]
  //   category: semiconductor | cosmetics | all (default: all)
  //   start/end: YYYYMM (default: 202501 ~ current month)
  const arg = process.argv[2] ?? "all";
  const start = process.argv[3] ?? "202501";
  const end = process.argv[4] ?? currentYm();

  const keys: CategoryKey[] =
    arg === "all"
      ? CATEGORIES.map((c) => c.key)
      : [arg as CategoryKey];

  for (const cat of keys) {
    console.log(`\n=== ${cat} ${start} ~ ${end} ===`);
    const results = await ingestRange(cat, start, end, {
      sleepMs: 300,
      onProgress: (r) => {
        console.log(`  ${r.yearMonth}: fetched=${r.fetched} saved=${r.saved}`);
      },
    });
    const totalSaved = results.reduce((s, r) => s + r.saved, 0);
    console.log(`Done ${cat}. months=${results.length} rows=${totalSaved}`);
  }
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
