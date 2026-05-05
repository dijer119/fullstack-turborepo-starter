import { db } from "@/lib/db";
import { loadCorpCodeMap } from "./corp-code";
import { getLatestFinancial } from "./financial";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function runNcavScreening(): Promise<{
  analyzed: number;
  skipped: number;
  ncavPositive: number;
}> {
  const corpMap = await loadCorpCodeMap();
  const masters = await db.stockMaster.findMany({
    select: { code: true, name: true, marcap: true, corpCode: true },
  });

  const now = Date.now();
  const existing = await db.ncavResult.findMany({
    select: { code: true, lastUpdated: true },
  });
  const existingMap = new Map(
    existing.map((r) => [r.code, r.lastUpdated.getTime()]),
  );

  let analyzed = 0;
  let skipped = 0;

  for (let i = 0; i < masters.length; i++) {
    const m = masters[i];
    const corpCode = m.corpCode ?? corpMap.get(m.code);
    if (!corpCode) continue;

    if (!m.corpCode && corpCode) {
      await db.stockMaster.update({
        where: { code: m.code },
        data: { corpCode },
      });
    }

    const last = existingMap.get(m.code);
    if (last && now - last < TWENTY_FOUR_HOURS_MS) {
      skipped++;
      continue;
    }

    const fin = await getLatestFinancial(corpCode);
    if (!fin) continue;

    const marcap = m.marcap ?? 0n;
    const ncav = fin.currentAssets - fin.totalLiabilities;
    const ncavRatio =
      marcap > 0n ? Number((ncav * 10000n) / marcap) / 100 : null;
    const ncavPositive = ncav > marcap && marcap > 0n;

    const data = {
      name: m.name,
      ncav,
      marcap,
      ncavRatio,
      currentAssets: fin.currentAssets,
      totalLiabilities: fin.totalLiabilities,
      totalAssets: fin.totalAssets,
      totalEquity: fin.totalEquity,
      bsnsYear: fin.bsnsYear,
      ncavPositive,
      lastUpdated: new Date(),
    };

    await db.ncavResult.upsert({
      where: { code: m.code },
      create: { code: m.code, ...data },
      update: data,
    });
    analyzed++;

    if ((i + 1) % 50 === 0) {
      console.log(
        `[ncav] progress ${i + 1}/${masters.length} (analyzed=${analyzed})`,
      );
    }
  }

  const positiveCount = await db.ncavResult.count({
    where: { ncavPositive: true },
  });
  console.log(
    `[ncav] done — analyzed=${analyzed}, skipped=${skipped}, positive=${positiveCount}`,
  );
  return { analyzed, skipped, ncavPositive: positiveCount };
}
