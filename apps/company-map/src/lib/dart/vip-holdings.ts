import type { DartDisclosureRow } from "./disclosure-list";

export const VIP_FLR_NM = "브이아이피자산운용";

export type ReportType = "D001" | "D002";

/** report_nm 키워드 기반 분류. OpenDART는 pblntf_detail_ty를 list.json에서 제공하지 않는다. */
export function classifyReportType(reportNm: string): ReportType | null {
  if (reportNm.includes("대량보유")) return "D001";
  // "임원·주요주주" 표기는 가운뎃점(·) 또는 한자식 점(ㆍ) 두 가지가 섞임.
  if (reportNm.includes("임원ㆍ주요주주") || reportNm.includes("임원·주요주주")) {
    return "D002";
  }
  return null;
}

export function isVipDisclosure(row: DartDisclosureRow): boolean {
  if (row.flrNm !== VIP_FLR_NM) return false;
  return classifyReportType(row.reportNm) !== null;
}

export interface VipHoldingInput {
  rcpNo: string;
  code: string;
  corpCode: string;
  corpName: string;
  reportNm: string;
  reportType: ReportType;
  flrNm: string;
  rceptDt: Date;
}

/** YYYYMMDD → UTC midnight Date. */
function parseRceptDt(s: string): Date {
  const y = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
}

export function toVipHoldingInput(
  row: DartDisclosureRow,
  stockCode: string,
): VipHoldingInput {
  const reportType = classifyReportType(row.reportNm);
  if (!reportType) {
    throw new Error(`Cannot classify report: ${row.reportNm}`);
  }
  return {
    rcpNo: row.rcpNo,
    code: stockCode,
    corpCode: row.corpCode,
    corpName: row.corpName,
    reportNm: row.reportNm,
    reportType,
    flrNm: row.flrNm,
    rceptDt: parseRceptDt(row.rceptDt),
  };
}
