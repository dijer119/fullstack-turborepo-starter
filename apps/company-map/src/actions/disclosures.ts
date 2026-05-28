"use server";

import { db } from "@/lib/db";
import { fetchDartList } from "@/lib/dart/list";
import {
  buildEarningsPayload,
  type EarningsPayload,
} from "@/lib/dart/earnings-payload";
import type { ReprtCode } from "@/lib/dart/operating-income";
import { classifyOwnership } from "@/lib/dart/ownership-classify";
import { fetchAlotMatter, extractDividendPayload } from "@/lib/dart/alotMatter";
import { buildElestockMap } from "@/lib/dart/elestock";
import { buildMajorstockMap } from "@/lib/dart/majorstock-detail";
import { fetchContractDetail } from "@/lib/dart/contract-detail";
import type {
  OwnershipDetail,
  OwnershipPayload,
} from "@/lib/dart/disclosure-payloads";

const PERIODIC_REPORT_REGEX = /(사업|반기|분기)보고서/;
const MAX_REPORTS_PER_STOCK = 16;
const DIVIDEND_YEARS_LOOKBACK = 4;
const TSSTK_REGEX = /자기주식|자사주/;
const CONTRACT_REGEX = /단일판매[ㆍ··.]?공급계약|공급계약체결|판매계약체결/;

interface FetchStats {
  inserted: number;
  updated: number;
  failed: number;
}

function emptyStats(): FetchStats {
  return { inserted: 0, updated: 0, failed: 0 };
}

function mergeStats(a: FetchStats, b: FetchStats): FetchStats {
  return {
    inserted: a.inserted + b.inserted,
    updated: a.updated + b.updated,
    failed: a.failed + b.failed,
  };
}

function deriveReprtCode(reportNm: string, rceptDt: Date): ReprtCode | null {
  if (/사업보고서/.test(reportNm)) return "11011";
  if (/반기보고서/.test(reportNm)) return "11012";
  if (/분기보고서/.test(reportNm)) {
    const month = rceptDt.getMonth() + 1;
    return month <= 8 ? "11013" : "11014";
  }
  return null;
}

function deriveBsnsYear(rceptDt: Date, reprtCode: ReprtCode): number {
  const y = rceptDt.getFullYear();
  if (reprtCode === "11011" && rceptDt.getMonth() + 1 <= 4) return y - 1;
  return y;
}

function todayDateRange(): { bgnDe: string; endDe: string } {
  const now = new Date();
  const bgnDe = `${now.getFullYear() - 4}0101`;
  const endDe = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return { bgnDe, endDe };
}

function parseRceptDt(raw: string): Date {
  return new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
}

async function fetchEarnings(code: string, corpCode: string): Promise<FetchStats> {
  const { bgnDe, endDe } = todayDateRange();
  const resp = await fetchDartList({
    corpCode,
    pblntfTy: "A",
    bgnDe,
    endDe,
    pageCount: 100,
  });
  if (!resp || resp.status !== "000" || !resp.list) {
    return { inserted: 0, updated: 0, failed: 1 };
  }

  const reports = resp.list
    .filter((it) => PERIODIC_REPORT_REGEX.test(it.report_nm))
    .slice(0, MAX_REPORTS_PER_STOCK)
    .map((it) => ({
      rcpNo: it.rcept_no,
      reportNm: it.report_nm,
      rceptDt: parseRceptDt(it.rcept_dt),
    }));

  reports.sort((a, b) => a.rceptDt.getTime() - b.rceptDt.getTime());

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let prevPayload: EarningsPayload | null = null;

  for (const r of reports) {
    const reprtCode = deriveReprtCode(r.reportNm, r.rceptDt);
    if (!reprtCode) {
      failed++;
      continue;
    }
    const bsnsYear = deriveBsnsYear(r.rceptDt, reprtCode);
    const payload = await buildEarningsPayload(corpCode, bsnsYear, reprtCode, prevPayload);
    if (!payload) {
      failed++;
      continue;
    }
    prevPayload = payload;

    const existing = await db.disclosure.findUnique({ where: { rcpNo: r.rcpNo } });
    await db.disclosure.upsert({
      where: { rcpNo: r.rcpNo },
      create: {
        rcpNo: r.rcpNo,
        code,
        corpCode,
        reportNm: r.reportNm,
        pblntfTy: "A",
        rceptDt: r.rceptDt,
        category: "실적",
        payload: JSON.stringify(payload),
      },
      update: {
        payload: JSON.stringify(payload),
        fetchedAt: new Date(),
      },
    });
    if (existing) updated++;
    else inserted++;
  }
  return { inserted, updated, failed };
}

async function fetchOwnership(code: string, corpCode: string): Promise<FetchStats> {
  const { bgnDe, endDe } = todayDateRange();

  // D: 임원·주요주주, 주식대량보유
  const respD = await fetchDartList({
    corpCode,
    pblntfTy: "D",
    bgnDe,
    endDe,
    pageCount: 100,
  });
  // B: 자기주식 결정 (취득/처분/소각 등)
  const respB = await fetchDartList({
    corpCode,
    pblntfTy: "B",
    bgnDe,
    endDe,
    pageCount: 100,
  });

  const okD = respD?.status === "000" && !!respD.list;
  const okB = respB?.status === "000" && !!respB.list;
  if (!okD && !okB) {
    return { inserted: 0, updated: 0, failed: 1 };
  }

  const [elestockMap, majorMap] = await Promise.all([
    buildElestockMap({ corpCode, bgnDe, endDe }),
    buildMajorstockMap({ corpCode, bgnDe, endDe }),
  ]);

  type Row = { rcpNo: string; reportNm: string; rceptDt: Date; pblntfTy: string };
  const rows: Row[] = [];

  if (respD?.status === "000" && respD.list) {
    for (const it of respD.list) {
      rows.push({
        rcpNo: it.rcept_no,
        reportNm: it.report_nm,
        pblntfTy: "D",
        rceptDt: parseRceptDt(it.rcept_dt),
      });
    }
  }
  if (respB?.status === "000" && respB.list) {
    for (const it of respB.list) {
      if (!TSSTK_REGEX.test(it.report_nm)) continue;
      rows.push({
        rcpNo: it.rcept_no,
        reportNm: it.report_nm,
        pblntfTy: "B",
        rceptDt: parseRceptDt(it.rcept_dt),
      });
    }
  }

  rows.sort((a, b) => b.rceptDt.getTime() - a.rceptDt.getTime());
  const limited = rows.slice(0, MAX_REPORTS_PER_STOCK);

  let inserted = 0;
  let updated = 0;
  for (const r of limited) {
    const base = classifyOwnership(r.reportNm);
    let detail: OwnershipDetail | null = null;
    if (base.reportType === "임원·주요주주") {
      detail = elestockMap.get(r.rcpNo) ?? null;
    } else if (base.reportType === "주식대량보유") {
      detail = majorMap.get(r.rcpNo) ?? null;
    }
    const payload: OwnershipPayload = { ...base, detail };

    const existing = await db.disclosure.findUnique({ where: { rcpNo: r.rcpNo } });
    await db.disclosure.upsert({
      where: { rcpNo: r.rcpNo },
      create: {
        rcpNo: r.rcpNo,
        code,
        corpCode,
        reportNm: r.reportNm,
        pblntfTy: r.pblntfTy,
        rceptDt: r.rceptDt,
        category: "지분",
        payload: JSON.stringify(payload),
      },
      update: {
        payload: JSON.stringify(payload),
        fetchedAt: new Date(),
      },
    });
    if (existing) updated++;
    else inserted++;
  }
  return { inserted, updated, failed: 0 };
}

async function fetchDividends(code: string, corpCode: string): Promise<FetchStats> {
  const now = new Date();
  const stats = emptyStats();
  for (let i = 0; i < DIVIDEND_YEARS_LOOKBACK; i++) {
    const bsnsYear = now.getFullYear() - 1 - i;
    const resp = await fetchAlotMatter({
      corpCode,
      bsnsYear,
      reprtCode: "11011",
    });
    const payload = extractDividendPayload(resp);
    if (!payload) continue;

    // 합성 키만 사용. alotMatter 응답의 rcept_no는 사업보고서의 것이라
    // 같은 종목의 실적 카테고리 rcpNo와 충돌해 update가 카테고리를 안 바꾸는 문제 회피.
    const rcpNo = `alotMatter-${code}-${bsnsYear}-11011`;
    const reportNm = `${bsnsYear}년 현금배당`;
    const rceptDt = new Date(`${bsnsYear + 1}-03-31`);

    const existing = await db.disclosure.findUnique({ where: { rcpNo } });
    await db.disclosure.upsert({
      where: { rcpNo },
      create: {
        rcpNo,
        code,
        corpCode,
        reportNm,
        pblntfTy: "alotMatter",
        rceptDt,
        category: "배당",
        payload: JSON.stringify(payload),
      },
      update: {
        payload: JSON.stringify(payload),
        fetchedAt: new Date(),
      },
    });
    if (existing) stats.updated++;
    else stats.inserted++;
  }
  return stats;
}

async function fetchContracts(code: string, corpCode: string): Promise<FetchStats> {
  const { bgnDe, endDe } = todayDateRange();
  // 단일판매·공급계약체결은 거래소공시(pblntf_ty=I)에 속함. 주요사항보고(B) 아님.
  const resp = await fetchDartList({
    corpCode,
    pblntfTy: "I",
    bgnDe,
    endDe,
    pageCount: 100,
  });
  if (!resp || resp.status !== "000" || !resp.list) {
    return { inserted: 0, updated: 0, failed: 1 };
  }

  const rows = resp.list
    .filter((it) => CONTRACT_REGEX.test(it.report_nm))
    .slice(0, MAX_REPORTS_PER_STOCK)
    .map((it) => ({
      rcpNo: it.rcept_no,
      reportNm: it.report_nm,
      rceptDt: parseRceptDt(it.rcept_dt),
    }));

  // DART 본문 HTML 스크래핑으로 상세 정보 추출. 실패는 emptyPayload로 폴백.
  const emptyPayload = {
    contractDate: null,
    startDate: null,
    endDate: null,
    contractContent: null,
    counterparty: null,
    supplyRegion: null,
    amount: null,
    recentSalesRatio: null,
  };
  const detailEntries = await Promise.all(
    rows.map(async (r) => {
      try {
        const d = await fetchContractDetail(r.rcpNo);
        return [r.rcpNo, d] as const;
      } catch (err) {
        console.warn(`[contract-detail] failed ${r.rcpNo}:`, err);
        return [r.rcpNo, null] as const;
      }
    }),
  );
  const detailMap = new Map(detailEntries);

  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const payload = detailMap.get(r.rcpNo) ?? emptyPayload;
    const existing = await db.disclosure.findUnique({ where: { rcpNo: r.rcpNo } });
    await db.disclosure.upsert({
      where: { rcpNo: r.rcpNo },
      create: {
        rcpNo: r.rcpNo,
        code,
        corpCode,
        reportNm: r.reportNm,
        pblntfTy: "I",
        rceptDt: r.rceptDt,
        category: "계약",
        payload: JSON.stringify(payload),
      },
      update: {
        payload: JSON.stringify(payload),
        fetchedAt: new Date(),
      },
    });
    if (existing) updated++;
    else inserted++;
  }
  return { inserted, updated, failed: 0 };
}

export async function fetchDisclosuresForStock(code: string): Promise<FetchStats> {
  if (!/^\d{6}$/.test(code)) return emptyStats();

  const master = await db.stockMaster.findUnique({ where: { code } });
  if (!master?.corpCode) return emptyStats();
  const corpCode = master.corpCode;

  let total = emptyStats();
  for (const fn of [fetchEarnings, fetchOwnership, fetchDividends, fetchContracts]) {
    try {
      total = mergeStats(total, await fn(code, corpCode));
    } catch (err) {
      console.error(`[disclosures] ${fn.name} failed for ${code}:`, err);
      total.failed++;
    }
  }
  return total;
}
