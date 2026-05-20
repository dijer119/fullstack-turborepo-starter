"use server";

import { db } from "@/lib/db";

export interface VipHoldingDetailRow {
  rcpNo: string;
  reportNm: string;
  reportType: string;
  rceptDt: string;     // ISO 8601
  dartUrl: string;
}

export async function getVipHoldingsByCode(
  code: string,
): Promise<VipHoldingDetailRow[]> {
  if (!/^\d{6}$/.test(code)) return [];

  const rows = await db.vipHolding.findMany({
    where: { code },
    orderBy: { rceptDt: "desc" },
  });

  return rows.map((r) => ({
    rcpNo: r.rcpNo,
    reportNm: r.reportNm,
    reportType: r.reportType,
    rceptDt: r.rceptDt.toISOString(),
    dartUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcpNo}`,
  }));
}
