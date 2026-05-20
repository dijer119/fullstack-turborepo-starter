import type { DartDisclosureRow } from "./disclosure-list";
import { db } from "@/lib/db";
import { iterateDartDisclosures } from "./disclosure-list";
import { loadCorpCodeReverseMap } from "./corp-code";

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

export interface RefreshVipHoldingsResult {
  fetched: number;        // total D disclosures iterated
  matchedVip: number;     // rows passing isVipDisclosure
  mapped: number;         // rows for which we could map to a stock_code
  upserted: number;       // upsert calls made
  pruned: number;         // rows deleted as out-of-window
}

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function refreshVipHoldings(
  now: Date = new Date(),
): Promise<RefreshVipHoldingsResult> {
  const cutoff = new Date(now.getTime() - SIX_MONTHS_MS);
  const bgnDe = toDateString(cutoff);
  const endDe = toDateString(now);

  const reverseMap = await loadCorpCodeReverseMap();

  let fetched = 0;
  let matchedVip = 0;
  let mapped = 0;
  let upserted = 0;

  for await (const row of iterateDartDisclosures({
    bgnDe,
    endDe,
    pblntfTy: "D",
  })) {
    fetched++;
    if (!isVipDisclosure(row)) continue;
    matchedVip++;

    // stock_code가 응답에 있으면 우선 사용, 없으면 corp_code → stock_code fallback.
    const stockCode = row.stockCode || reverseMap.get(row.corpCode) || "";
    if (!stockCode || stockCode.length !== 6) continue;
    mapped++;

    const input = toVipHoldingInput(row, stockCode);
    await db.vipHolding.upsert({
      where: { rcpNo: input.rcpNo },
      create: input,
      update: {
        code: input.code,
        corpCode: input.corpCode,
        corpName: input.corpName,
        reportNm: input.reportNm,
        reportType: input.reportType,
        flrNm: input.flrNm,
        rceptDt: input.rceptDt,
      },
    });
    upserted++;
  }

  const pruneResult = await db.vipHolding.deleteMany({
    where: { rceptDt: { lt: cutoff } },
  });

  return { fetched, matchedVip, mapped, upserted, pruned: pruneResult.count };
}
