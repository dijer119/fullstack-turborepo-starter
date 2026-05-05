import { db } from "@/lib/db";
import { analyzeStock } from "@/lib/stocks/analyze-stock";

const ONE_HOUR_MS = 60 * 60 * 1000;

interface RunOpts {
  shouldStop: () => boolean;
}

/**
 * StockMasters 전체 순회, 1시간 내 분석된 종목 스킵.
 * 가장 오래된(또는 미분석) 종목부터 처리.
 */
export async function analyzeAllStocks({
  shouldStop,
}: RunOpts): Promise<{ analyzed: number; skipped: number; failed: number }> {
  const masters = await db.stockMaster.findMany({
    select: { code: true, name: true },
  });
  const analyses = await db.stockAnalysis.findMany({
    select: { code: true, lastUpdated: true },
  });
  const lastByCode = new Map(
    analyses.map((a) => [a.code, a.lastUpdated.getTime()]),
  );

  const ordered = [...masters].sort((a, b) => {
    const la = lastByCode.get(a.code) ?? 0;
    const lb = lastByCode.get(b.code) ?? 0;
    return la - lb;
  });

  const now = Date.now();
  let analyzed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < ordered.length; i++) {
    if (shouldStop()) {
      console.log("[analyze] stop requested, breaking out");
      break;
    }
    const m = ordered[i];
    const last = lastByCode.get(m.code);
    if (last && now - last < ONE_HOUR_MS) {
      skipped++;
      continue;
    }

    try {
      const r = await analyzeStock(m.code);
      const data = {
        name: r.stockName,
        currentPrice: r.currentPrice,
        intrinsicValue: r.intrinsicValue,
        safetyMargin: r.safetyMargin,
        treasuryRatio: r.treasuryRatio,
        dividendYield: r.dividendYield,
        lastUpdated: new Date(),
      };
      await db.stockAnalysis.upsert({
        where: { code: m.code },
        create: { code: m.code, ...data },
        update: data,
      });
      analyzed++;
    } catch (err) {
      failed++;
      console.warn(
        `[analyze] ${m.code} (${m.name}) failed:`,
        err instanceof Error ? err.message : err,
      );
    }

    if ((i + 1) % 100 === 0) {
      console.log(
        `[analyze] progress ${i + 1}/${ordered.length} analyzed=${analyzed} skipped=${skipped} failed=${failed}`,
      );
    }
  }

  console.log(
    `[analyze] done — analyzed=${analyzed}, skipped=${skipped}, failed=${failed}`,
  );
  return { analyzed, skipped, failed };
}
