import type { DartDisclosureRow } from "./disclosure-list";
import { db } from "../../../worker/db";
import { iterateDartDisclosures } from "./disclosure-list";
import { loadCorpCodeReverseMap } from "./corp-code";
import { fetchMajorStockByCorp } from "./major-stock";

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

const ENRICH_DELAY_MS = 150;

/** 주어진 corp_code들에 대해 majorstock.json으로 보유율/증감/사유를 update.
 *  rcpNo가 vip_holdings에 없으면 그 row는 skip. */
export async function enrichVipHoldings(
  corpCodes: Iterable<string>,
): Promise<{ enriched: number }> {
  const uniqueCodes = [...new Set(corpCodes)];
  let enriched = 0;
  for (let i = 0; i < uniqueCodes.length; i++) {
    const corpCode = uniqueCodes[i];
    let rows;
    try {
      rows = await fetchMajorStockByCorp(corpCode);
    } catch (e) {
      console.error(`[vip] majorstock fetch failed for ${corpCode}:`, e);
      continue;
    }
    for (const r of rows) {
      const result = await db.vipHolding.updateMany({
        where: { rcpNo: r.rcpNo },
        data: {
          stockRatio: r.stockRatio,
          stockRatioChange: r.stockRatioChange,
          reportResn: r.reportResn,
        },
      });
      enriched += result.count;
    }
    if (i < uniqueCodes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, ENRICH_DELAY_MS));
    }
  }
  return { enriched };
}

export interface RefreshVipHoldingsResult {
  fetched: number;
  matchedVip: number;
  mapped: number;
  upserted: number;
  pruned: number;
  enriched: number;
}

/** 6개월 보유. DART list.json은 corp_code 없이 호출 시 90일 max라 청크 분할. */
const RETENTION_DAYS = 180;
const DART_MAX_WINDOW_DAYS = 90;
const DAY_MS = 1000 * 60 * 60 * 24;

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** [cutoff, now] 구간을 ≤90일 청크로 분할. 각 청크는 inclusive on both ends. */
export function dateChunks(
  cutoff: Date,
  now: Date,
  chunkDays: number,
): Array<{ bgnDe: string; endDe: string }> {
  const chunks: Array<{ bgnDe: string; endDe: string }> = [];
  let chunkEnd = new Date(now);
  while (chunkEnd >= cutoff) {
    const chunkStart = new Date(chunkEnd.getTime() - (chunkDays - 1) * DAY_MS);
    const effectiveStart = chunkStart < cutoff ? cutoff : chunkStart;
    chunks.push({
      bgnDe: toDateString(effectiveStart),
      endDe: toDateString(chunkEnd),
    });
    chunkEnd = new Date(effectiveStart.getTime() - DAY_MS);
  }
  return chunks;
}

export async function refreshVipHoldings(
  now: Date = new Date(),
): Promise<RefreshVipHoldingsResult> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  const reverseMap = await loadCorpCodeReverseMap();
  const chunks = dateChunks(cutoff, now, DART_MAX_WINDOW_DAYS);

  let fetched = 0;
  let matchedVip = 0;
  let mapped = 0;
  let upserted = 0;
  const upsertedCorpCodes = new Set<string>();
  const seen = new Set<string>(); // dedupe rcpNo across overlapping chunks

  for (const { bgnDe, endDe } of chunks) {
    for await (const row of iterateDartDisclosures({
      bgnDe,
      endDe,
      pblntfTy: "D",
    })) {
      fetched++;
      if (!isVipDisclosure(row)) continue;
      matchedVip++;
      if (seen.has(row.rcpNo)) continue;
      seen.add(row.rcpNo);

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
      upsertedCorpCodes.add(input.corpCode);
    }
  }

  const pruneResult = await db.vipHolding.deleteMany({
    where: { rceptDt: { lt: cutoff } },
  });

  const enrichResult = await enrichVipHoldings(upsertedCorpCodes);

  return {
    fetched,
    matchedVip,
    mapped,
    upserted,
    pruned: pruneResult.count,
    enriched: enrichResult.enriched,
  };
}
