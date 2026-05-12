"use server";

import { db } from "@/lib/db";
import { getCategory, type CategoryKey } from "@/lib/trade/categories";
import { syncMonth, type SyncMonthResult } from "@/lib/trade/upsert";
import { revalidatePath } from "next/cache";

export type MonthlySummary = {
  yearMonth: string;
  expDlr: number;
  impDlr: number;
  balPayments: number;
};

export type MonthlyBreakdown = {
  yearMonth: string;
  /** Map of subcategory label → export USD. */
  bySubCategory: Record<string, number>;
  totalExp: number;
  totalImp: number;
};

export type CountryRow = {
  countryCd: string;
  countryName: string;
  expDlr: number;
  impDlr: number;
  balPayments: number;
};

function n(v: bigint | null | undefined): number {
  return v == null ? 0 : Number(v);
}

export async function listMonths(category: CategoryKey): Promise<string[]> {
  const rows = await db.tradeStat.findMany({
    where: { category },
    select: { yearMonth: true },
    distinct: ["yearMonth"],
    orderBy: { yearMonth: "asc" },
  });
  return rows.map((r) => r.yearMonth);
}

export async function getMonthlySummary(
  category: CategoryKey,
): Promise<MonthlySummary[]> {
  const grouped = await db.tradeStat.groupBy({
    by: ["yearMonth"],
    where: { category },
    _sum: { expDlr: true, impDlr: true, balPayments: true },
    orderBy: { yearMonth: "asc" },
  });
  return grouped.map((g) => ({
    yearMonth: g.yearMonth,
    expDlr: n(g._sum.expDlr),
    impDlr: n(g._sum.impDlr),
    balPayments: n(g._sum.balPayments),
  }));
}

export async function getMonthlyBreakdown(
  category: CategoryKey,
): Promise<MonthlyBreakdown[]> {
  const def = getCategory(category);
  const grouped = await db.tradeStat.groupBy({
    by: ["yearMonth", "hsCode"],
    where: { category },
    _sum: { expDlr: true, impDlr: true },
    orderBy: { yearMonth: "asc" },
  });

  const map = new Map<string, MonthlyBreakdown>();
  for (const row of grouped) {
    let cur = map.get(row.yearMonth);
    if (!cur) {
      cur = { yearMonth: row.yearMonth, bySubCategory: {}, totalExp: 0, totalImp: 0 };
      for (const sub of def.subCategories) cur.bySubCategory[sub.label] = 0;
      map.set(row.yearMonth, cur);
    }
    const exp = n(row._sum.expDlr);
    const imp = n(row._sum.impDlr);
    cur.totalExp += exp;
    cur.totalImp += imp;
    for (const sub of def.subCategories) {
      if (row.hsCode.startsWith(sub.hsPrefix)) {
        cur.bySubCategory[sub.label] += exp;
        break;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.yearMonth.localeCompare(b.yearMonth),
  );
}

/** UI 동기화 버튼 — 단일 (sector, YYYYMM)에 대해 관세청 API 호출 후 DB upsert. */
export async function syncTradeMonth(
  category: CategoryKey,
  yearMonth6: string,
): Promise<SyncMonthResult> {
  const result = await syncMonth(db, category, yearMonth6);
  revalidatePath("/trade");
  return result;
}

export async function getTopCountries(
  category: CategoryKey,
  yearMonth: string,
  limit = 10,
): Promise<CountryRow[]> {
  const grouped = await db.tradeStat.groupBy({
    by: ["countryCd", "countryName"],
    where: { category, yearMonth },
    _sum: { expDlr: true, impDlr: true, balPayments: true },
  });
  return grouped
    .map((g) => ({
      countryCd: g.countryCd,
      countryName: g.countryName,
      expDlr: n(g._sum.expDlr),
      impDlr: n(g._sum.impDlr),
      balPayments: n(g._sum.balPayments),
    }))
    .sort((a, b) => b.expDlr - a.expDlr)
    .slice(0, limit);
}
