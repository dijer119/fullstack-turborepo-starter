"use server";

import { db } from "@/lib/db";
import { analyzeStock } from "@/lib/stocks/analyze-stock";
import type { TopStockRow } from "@/types/stocks";

export interface StockListItem {
  code: string;
  name: string;
  currentPrice: number | null;
  safetyMargin: number | null;
  lastUpdated: string;
}

/** 분석된 종목(StockAnalysis)에서 이름/코드 부분일치 검색. 원본 /search 동등. */
export async function searchStocks(keyword: string): Promise<StockListItem[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const isCode = /^\d{6}$/.test(trimmed);
  const where = isCode
    ? { code: trimmed }
    : {
        OR: [
          { name: { contains: trimmed } },
          { code: { contains: trimmed } },
        ],
      };

  const rows = await db.stockAnalysis.findMany({
    where,
    orderBy: [{ safetyMargin: "desc" }, { name: "asc" }],
    take: 20,
  });
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    currentPrice: r.currentPrice,
    safetyMargin: r.safetyMargin,
    lastUpdated: r.lastUpdated.toISOString(),
  }));
}

/**
 * 안전마진 상위 종목 + 배당 필터.
 * NCAV 비율은 보통주(코드 끝 0)로 fallback 매핑.
 */
export async function getTopStocks(opts: {
  limit?: number;
  dividend?: number | null;
}): Promise<TopStockRow[]> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 30));
  const where: Record<string, unknown> = { safetyMargin: { not: null } };
  if (opts.dividend != null) {
    where.dividendYield = { gte: opts.dividend };
  }

  const rows = await db.stockAnalysis.findMany({
    where,
    orderBy: [{ safetyMargin: "desc" }],
    take: limit,
  });

  const allCodes = new Set<string>();
  for (const r of rows) {
    allCodes.add(r.code);
    if (!r.code.endsWith("0")) allCodes.add(r.code.slice(0, -1) + "0");
  }
  const ncavRows = await db.ncavResult.findMany({
    where: { code: { in: Array.from(allCodes) } },
    select: { code: true, ncavRatio: true },
  });
  const ncavMap = new Map(ncavRows.map((n) => [n.code, n.ncavRatio]));

  return rows.map((r) => {
    const direct = ncavMap.get(r.code) ?? null;
    const fallback = !r.code.endsWith("0")
      ? (ncavMap.get(r.code.slice(0, -1) + "0") ?? null)
      : null;
    return {
      code: r.code,
      name: r.name,
      currentPrice: r.currentPrice,
      intrinsicValue: r.intrinsicValue,
      safetyMargin: r.safetyMargin,
      treasuryRatio: r.treasuryRatio,
      dividendYield: r.dividendYield,
      lastUpdated: r.lastUpdated.toISOString(),
      ncavRatio: direct ?? fallback,
    } satisfies TopStockRow;
  });
}

/** 즉시 네이버 크롤링 + DB 갱신. 워커 안 도는 환경에서 사용. */
export async function analyzeStockOnDemand(code: string): Promise<TopStockRow> {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed))
    throw new Error("종목코드는 6자리 숫자여야 합니다");

  const r = await analyzeStock(trimmed);
  const now = new Date();
  await db.stockMaster.upsert({
    where: { code: trimmed },
    create: { code: trimmed, name: r.stockName },
    update: { name: r.stockName },
  });
  const data = {
    name: r.stockName,
    currentPrice: r.currentPrice,
    intrinsicValue: r.intrinsicValue,
    safetyMargin: r.safetyMargin,
    treasuryRatio: r.treasuryRatio,
    dividendYield: r.dividendYield,
    lastUpdated: now,
  };
  const saved = await db.stockAnalysis.upsert({
    where: { code: trimmed },
    create: { code: trimmed, ...data },
    update: data,
  });
  const ncav = await db.ncavResult.findUnique({ where: { code: trimmed } });
  return {
    code: saved.code,
    name: saved.name,
    currentPrice: saved.currentPrice,
    intrinsicValue: saved.intrinsicValue,
    safetyMargin: saved.safetyMargin,
    treasuryRatio: saved.treasuryRatio,
    dividendYield: saved.dividendYield,
    lastUpdated: saved.lastUpdated.toISOString(),
    ncavRatio: ncav?.ncavRatio ?? null,
  };
}

export async function getStocksByCodes(codes: string[]): Promise<TopStockRow[]> {
  if (codes.length === 0) return [];
  const rows = await db.stockAnalysis.findMany({
    where: { code: { in: codes } },
  });
  const ncavRows = await db.ncavResult.findMany({
    where: { code: { in: codes } },
  });
  const ncavMap = new Map(ncavRows.map((n) => [n.code, n.ncavRatio]));
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    currentPrice: r.currentPrice,
    intrinsicValue: r.intrinsicValue,
    safetyMargin: r.safetyMargin,
    treasuryRatio: r.treasuryRatio,
    dividendYield: r.dividendYield,
    lastUpdated: r.lastUpdated.toISOString(),
    ncavRatio: ncavMap.get(r.code) ?? null,
  }));
}
