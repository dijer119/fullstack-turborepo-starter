"use server";

import { Prisma } from "@prisma-clients/company-map";
import { db } from "@/lib/db";

export type MarketFilter = "ALL" | "KOSPI" | "KOSDAQ";
export type StocksSort = "marcap_desc" | "name_asc" | "safetyMargin_desc";

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

  // PER/PBR 또는 safetyMargin 정렬 시 자동으로 analyzed 종목만 필터링.
  const needsAnalysis =
    params.analyzedOnly === true ||
    params.perMax != null ||
    params.pbrMax != null ||
    sort === "safetyMargin_desc";

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
      include: { analysis: true },
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
    marcap: m.marcap != null ? Number(m.marcap) : null,
    currentPrice: m.analysis?.currentPrice ?? null,
    per: m.analysis?.per ?? null,
    pbr: m.analysis?.pbr ?? null,
    dividendYield: m.analysis?.dividendYield ?? null,
    safetyMargin: m.analysis?.safetyMargin ?? null,
    analyzed: m.analysis != null,
  }));

  return { rows, total };
}
