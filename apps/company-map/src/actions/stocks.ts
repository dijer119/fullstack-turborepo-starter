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
 * 안전마진 상위 종목 + 배당 + NCAV 비율 필터.
 * NCAV 비율은 보통주(코드 끝 0)로 fallback 매핑.
 *
 * NCAV 필터가 활성화되면 candidate를 더 크게 가져온 뒤 NCAV 매핑을 적용해
 * 필터링한 후 최종 limit로 자른다. 우선주는 보통주의 NCAV로 매칭하므로
 * 단순 SQL JOIN으로는 처리할 수 없어서 메모리 매핑이 필요.
 */
export async function getTopStocks(opts: {
  limit?: number;
  dividend?: number | null;
  ncavRatio?: number | null;
  /** PER 상한 (이하만 포함). null/undefined면 무필터. */
  perMax?: number | null;
  /** PBR 상한 (이하만 포함). */
  pbrMax?: number | null;
}): Promise<TopStockRow[]> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 30));
  const where: Record<string, unknown> = { safetyMargin: { not: null } };
  if (opts.dividend != null) {
    where.dividendYield = { gte: opts.dividend };
  }
  if (opts.perMax != null) {
    // PER은 양수만 의미 있음 (적자 종목은 PER이 음수이거나 null) — 양수 + 상한.
    where.per = { gt: 0, lte: opts.perMax };
  }
  if (opts.pbrMax != null) {
    where.pbr = { gt: 0, lte: opts.pbrMax };
  }

  // NCAV 필터가 있으면 candidate를 충분히 크게 가져와서 메모리에서 필터.
  const fetchLimit =
    opts.ncavRatio != null ? Math.max(limit * 5, 500) : limit;

  const rows = await db.stockAnalysis.findMany({
    where,
    orderBy: [{ safetyMargin: "desc" }],
    take: fetchLimit,
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

  let mapped = rows.map((r) => {
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
      per: r.per,
      pbr: r.pbr,
      lastUpdated: r.lastUpdated.toISOString(),
      ncavRatio: direct ?? fallback,
    } satisfies TopStockRow;
  });

  if (opts.ncavRatio != null) {
    mapped = mapped.filter(
      (r) => r.ncavRatio != null && r.ncavRatio >= opts.ncavRatio!,
    );
  }

  return mapped.slice(0, limit);
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
    per: r.per,
    pbr: r.pbr,
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
    per: saved.per,
    pbr: saved.pbr,
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
    per: r.per,
    pbr: r.pbr,
    lastUpdated: r.lastUpdated.toISOString(),
    ncavRatio: ncavMap.get(r.code) ?? null,
  }));
}
