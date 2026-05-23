"use server";

import { Prisma } from "@prisma-clients/company-map";
import type { TagView } from "./tags";
import { db } from "@/lib/db";

export type MarketFilter = "ALL" | "KOSPI" | "KOSDAQ";
export type StocksSort =
  | "marcap_desc"
  | "name_asc"
  | "safetyMargin_desc"
  | "dividendYield_desc"
  | "yoy_desc";

export interface StocksExplorerParams {
  market?: MarketFilter;
  search?: string;
  /** 억원 단위. null/undefined면 무제한. */
  minMarcapEok?: number | null;
  maxMarcapEok?: number | null;
  perMax?: number | null;
  pbrMax?: number | null;
  analyzedOnly?: boolean;
  sort?: StocksSort;
  page?: number;
  pageSize?: number;
  vipOnly?: boolean;
  tagIds?: number[];
}

export interface StocksExplorerRow {
  code: string;
  name: string;
  market: string | null;
  /** 원 단위. BigInt → Number 안전 변환 (KOSPI 1위 시총 ~600조 < 2^53). */
  marcap: number | null;
  currentPrice: number | null;
  per: number | null;
  pbr: number | null;
  dividendYield: number | null;
  safetyMargin: number | null;
  analyzed: boolean;
  vipHoldingsCount: number;
  vipLatestRceptDt: string | null;   // ISO 8601 or null
  opIncome: number | null;
  opIncomeYoyBase: number | null;
  opIncomePrevReport: number | null;
  latestReprtCode: string | null;
  tags: TagView[];
  pctChange3M: number | null;
  hasMemo: boolean;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function eokToBigInt(eok: number): bigint {
  return BigInt(Math.round(eok * 1e8));
}

export async function getStocksExplorer(
  params: StocksExplorerParams,
): Promise<{ rows: StocksExplorerRow[]; total: number }> {
  const market = params.market ?? "ALL";
  const sort = params.sort ?? "marcap_desc";
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)),
  );

  // PER/PBR 또는 safetyMargin/dividendYield 정렬 시 자동으로 analyzed 종목만 필터링.
  const needsAnalysis =
    params.analyzedOnly === true ||
    params.perMax != null ||
    params.pbrMax != null ||
    sort === "safetyMargin_desc" ||
    sort === "dividendYield_desc";

  // YoY 정렬은 financialSnapshot의 yoyPct가 채워진 row만 의미 있음.
  const needsFinancialSnapshot = sort === "yoy_desc";

  const where: Prisma.StockMasterWhereInput = {};
  if (market !== "ALL") where.market = market;

  const search = params.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { code: { contains: search } },
    ];
  }

  const marcapFilter: Prisma.BigIntNullableFilter = {};
  if (params.minMarcapEok != null && params.minMarcapEok > 0) {
    marcapFilter.gte = eokToBigInt(params.minMarcapEok);
  }
  if (params.maxMarcapEok != null && params.maxMarcapEok > 0) {
    marcapFilter.lte = eokToBigInt(params.maxMarcapEok);
  }
  if (Object.keys(marcapFilter).length > 0) where.marcap = marcapFilter;

  if (needsAnalysis) {
    const analysisFilter: Prisma.StockAnalysisWhereInput = {};
    if (params.perMax != null) analysisFilter.per = { gt: 0, lte: params.perMax };
    if (params.pbrMax != null) analysisFilter.pbr = { gt: 0, lte: params.pbrMax };
    where.analysis = { is: analysisFilter };
  }

  if (params.vipOnly) {
    where.vipHoldings = { some: {} };
  }

  if (params.tagIds && params.tagIds.length > 0) {
    where.AND = params.tagIds.map((tagId) => ({
      tags: { some: { tagId } },
    }));
  }

  if (needsFinancialSnapshot) {
    where.financialSnapshot = { is: { opIncomeYoyPct: { not: null } } };
  }

  // SQLite의 NULLS LAST 지원이 불안정해 분기 처리.
  // marcap_desc: marcap이 nullable이라 raw SQL로 NULL을 끝에 강제.
  // safetyMargin_desc: analyzed only이므로 NULL 없음 → 안전.
  let orderBy:
    | Prisma.StockMasterOrderByWithRelationInput
    | Prisma.StockMasterOrderByWithRelationInput[];
  switch (sort) {
    case "name_asc":
      orderBy = [{ name: "asc" }, { code: "asc" }];
      break;
    case "safetyMargin_desc":
      orderBy = [
        { analysis: { safetyMargin: "desc" } },
        { marcap: "desc" },
      ];
      break;
    case "dividendYield_desc":
      orderBy = [
        { analysis: { dividendYield: "desc" } },
        { marcap: "desc" },
      ];
      break;
    case "yoy_desc":
      orderBy = [
        { financialSnapshot: { opIncomeYoyPct: "desc" } },
        { marcap: "desc" },
      ];
      break;
    case "marcap_desc":
    default:
      // marcap NULL은 SQLite에서 desc 시 끝쪽으로 가는 게 기본이지만 보장은 안 됨.
      // 실용적으로 KRX 시드는 marcap 보장이라 NULL row가 거의 없음.
      orderBy = [{ marcap: "desc" }, { name: "asc" }];
      break;
  }

  const [masters, total] = await Promise.all([
    db.stockMaster.findMany({
      where,
      include: {
        analysis: true,
        vipHoldings: {
          orderBy: { rceptDt: "desc" },
          take: 1,
          select: { rceptDt: true },
        },
        _count: { select: { vipHoldings: true } },
        financialSnapshot: true,
        tags: { include: { tag: true } },
        priceChange: true,
        memo: { select: { code: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.stockMaster.count({ where }),
  ]);

  const rows: StocksExplorerRow[] = masters.map((m) => ({
    code: m.code,
    name: m.name,
    market: m.market,
    // 우선 최신 네이버 시총(PriceChange.marcap) → fallback KRX 시드(stock_masters.marcap).
    marcap:
      m.priceChange?.marcap != null
        ? Number(m.priceChange.marcap)
        : m.marcap != null
          ? Number(m.marcap)
          : null,
    // 우선 최신 일별 종가(PriceChange) → fallback NCAV/안전마진 worker가 채운 가격.
    currentPrice:
      m.priceChange?.currentPrice ?? m.analysis?.currentPrice ?? null,
    per: m.analysis?.per ?? null,
    pbr: m.analysis?.pbr ?? null,
    dividendYield: m.analysis?.dividendYield ?? null,
    safetyMargin: m.analysis?.safetyMargin ?? null,
    analyzed: m.analysis != null,
    vipHoldingsCount: m._count.vipHoldings,
    vipLatestRceptDt: m.vipHoldings[0]?.rceptDt.toISOString() ?? null,
    opIncome: m.financialSnapshot?.opIncome != null ? Number(m.financialSnapshot.opIncome) : null,
    opIncomeYoyBase: m.financialSnapshot?.opIncomeYoyBase != null ? Number(m.financialSnapshot.opIncomeYoyBase) : null,
    opIncomePrevReport: m.financialSnapshot?.opIncomePrevReport != null ? Number(m.financialSnapshot.opIncomePrevReport) : null,
    latestReprtCode: m.financialSnapshot?.latestReprtCode ?? null,
    tags: m.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
    pctChange3M: m.priceChange?.pctChange ?? null,
    hasMemo: m.memo != null,
  }));

  return { rows, total };
}
