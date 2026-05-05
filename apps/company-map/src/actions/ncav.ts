"use server";

import { db } from "@/lib/db";
import { bigintToString } from "@/lib/serialization";
import type { NcavRow } from "@/types/stocks";

export async function getNcavStocks(opts: {
  positive?: boolean;
  limit?: number;
  dividend?: number | null;
}): Promise<{ stocks: NcavRow[]; total: number; positiveCount: number }> {
  const limit = Math.max(1, Math.min(1000, opts.limit ?? 50));

  const where: Record<string, unknown> = {};
  if (opts.positive) where.ncavPositive = true;

  const rows = await db.ncavResult.findMany({
    where,
    orderBy: [{ ncavRatio: "desc" }],
    take: limit,
  });

  const allCodes = new Set<string>();
  for (const r of rows) {
    allCodes.add(r.code);
    if (!r.code.endsWith("0")) allCodes.add(r.code.slice(0, -1) + "0");
  }
  const analyses = await db.stockAnalysis.findMany({
    where: { code: { in: Array.from(allCodes) } },
    select: { code: true, dividendYield: true },
  });
  const divMap = new Map(analyses.map((a) => [a.code, a.dividendYield]));

  let mapped: NcavRow[] = rows.map((r) => {
    const direct = divMap.get(r.code) ?? null;
    const fallback = !r.code.endsWith("0")
      ? (divMap.get(r.code.slice(0, -1) + "0") ?? null)
      : null;
    const dividendYield = direct ?? fallback;
    const big = bigintToString({
      ncav: r.ncav,
      marcap: r.marcap,
      currentAssets: r.currentAssets,
      totalLiabilities: r.totalLiabilities,
      totalAssets: r.totalAssets,
      totalEquity: r.totalEquity,
    });
    return {
      code: r.code,
      name: r.name,
      ncav: big.ncav,
      marcap: big.marcap,
      currentAssets: big.currentAssets,
      totalLiabilities: big.totalLiabilities,
      totalAssets: big.totalAssets,
      totalEquity: big.totalEquity,
      ncavRatio: r.ncavRatio,
      bsnsYear: r.bsnsYear,
      ncavPositive: r.ncavPositive,
      dividendYield,
      lastUpdated: r.lastUpdated.toISOString(),
    } satisfies NcavRow;
  });

  if (opts.dividend != null) {
    mapped = mapped.filter(
      (r) => r.dividendYield != null && r.dividendYield >= opts.dividend!,
    );
  }

  const [total, positiveCount] = await Promise.all([
    db.ncavResult.count(),
    db.ncavResult.count({ where: { ncavPositive: true } }),
  ]);

  return { stocks: mapped, total, positiveCount };
}
