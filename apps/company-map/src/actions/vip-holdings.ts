"use server";

import { isValidStockCode } from "@/lib/stocks/stock-code";
import { db } from "@/lib/db";

export interface VipHoldingDetailRow {
  rcpNo: string;
  reportNm: string;
  reportType: string;
  rceptDt: string;     // ISO 8601
  stockRatio: number | null;
  stockRatioChange: number | null;
  reportResn: string | null;
  dartUrl: string;
}

export async function getVipHoldingsByCode(
  code: string,
): Promise<VipHoldingDetailRow[]> {
  if (!isValidStockCode(code)) return [];

  const rows = await db.vipHolding.findMany({
    where: { code },
    orderBy: { rceptDt: "desc" },
  });

  return rows.map((r) => ({
    rcpNo: r.rcpNo,
    reportNm: r.reportNm,
    reportType: r.reportType,
    rceptDt: r.rceptDt.toISOString(),
    stockRatio: r.stockRatio,
    stockRatioChange: r.stockRatioChange,
    reportResn: r.reportResn,
    dartUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcpNo}`,
  }));
}
