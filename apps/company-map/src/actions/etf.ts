"use server";

import { spawn } from "node:child_process";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { diffHoldings } from "@/lib/etf/diff";
import type { Holding, HoldingChange } from "@/lib/etf/types";
import { buildShareHistory, type ShareHistory } from "@/lib/etf/history";

export interface EtfWatchView {
  code: string;
  name: string;
  isin: string | null;
  latestTrdDd: string | null;
}

export interface EtfDetailView {
  code: string;
  name: string;
  latestTrdDd: string | null;
  prevTrdDd: string | null;
  marketValue: number | null; // 최신 스냅샷 시가총액(원). BigInt는 직렬화 불가라 Number 변환
  changes: HoldingChange[];
}

const CODE_RE = /^[0-9A-Z]{6}$/;

export async function listEtfWatches(): Promise<EtfWatchView[]> {
  const rows = await db.etfWatch.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { snapshots: { orderBy: { trdDd: "desc" }, take: 1, select: { trdDd: true } } },
  });
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    isin: r.isin,
    latestTrdDd: r.snapshots[0]?.trdDd ?? null,
  }));
}

export async function registerEtf(rawCode: string): Promise<{ ok: boolean; reason?: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) return { ok: false, reason: "코드 형식 오류 (6자리 영숫자)" };
  const exists = await db.etfWatch.findUnique({ where: { code } });
  if (exists) return { ok: false, reason: "이미 등록됨" };

  const max = await db.etfWatch.aggregate({ _max: { sortOrder: true } });
  await db.etfWatch.create({
    data: { code, name: code, sortOrder: (max._max.sortOrder ?? -1) + 1 }, // name/isin은 스냅샷 잡이 보강
  });
  const child = spawn("npx", ["tsx", "scripts/refresh-etf-pdf.ts"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  revalidatePath("/stocks/etf");
  return { ok: true };
}

export async function removeEtf(code: string): Promise<{ ok: boolean }> {
  await db.etfWatch.delete({ where: { code } }).catch(() => {});
  revalidatePath("/stocks/etf");
  return { ok: true };
}

// 드래그 정렬 결과 저장. codes는 등록된 전체 코드 집합과 정확히 일치해야 한다(중복·누락 불가).
export async function reorderEtfWatches(codes: string[]): Promise<{ ok: boolean }> {
  const rows = await db.etfWatch.findMany({ select: { code: true } });
  const existing = new Set(rows.map((r) => r.code));
  const unique = new Set(codes);
  if (
    unique.size !== codes.length ||
    unique.size !== existing.size ||
    !codes.every((c) => existing.has(c))
  ) {
    return { ok: false };
  }
  await db.$transaction(
    codes.map((code, i) => db.etfWatch.update({ where: { code }, data: { sortOrder: i } })),
  );
  revalidatePath("/stocks/etf");
  return { ok: true };
}

// 최근 N개 스냅샷의 구성종목 주식수 이력 매트릭스. 워치 미등록이면 null.
export async function getEtfShareHistory(
  code: string,
  limit = 30,
): Promise<ShareHistory | null> {
  const watch = await db.etfWatch.findUnique({ where: { code } });
  if (!watch) return null;
  const snaps = await db.etfPdfSnapshot.findMany({
    where: { etfCode: code },
    orderBy: { trdDd: "desc" },
    take: limit,
    include: { holdings: true },
  });
  return buildShareHistory(
    snaps.map((s) => ({
      trdDd: s.trdDd,
      holdings: s.holdings.map((h) => ({
        constituentCode: h.constituentCode,
        constituentName: h.constituentName,
        weight: h.weight,
        shares: h.shares,
        amount: h.amount,
      })),
    })),
  );
}

export interface CombinedEtfColumn {
  code: string;
  name: string;
  trdDd: string | null; // 최신 기준일
  prevTrdDd: string | null; // 직전 기준일(전일 대비 비교 대상)
}

export type CombinedRowStatus = "신규" | "이탈" | "유지";

export interface CombinedHoldingRow {
  constituentCode: string;
  constituentName: string;
  total: number; // 합산 비중(%) — 최신
  count: number; // 보유 ETF 수 — 최신
  byEtf: (number | null)[]; // columns 순서, 미보유면 null
  // 전일 대비
  rank: number | null; // 최신 순위(1-based), 이탈이면 null
  prevRank: number | null; // 직전 순위
  rankDelta: number | null; // prevRank - rank (>0 상승), 신규/이탈이면 null
  totalPrev: number | null; // 직전 합산 비중
  weightDelta: number | null; // total - totalPrev (신규/이탈은 null)
  status: CombinedRowStatus;
}

export interface CombinedEtfView {
  columns: CombinedEtfColumn[]; // 데이터가 있는 ETF (입력 순서 유지)
  rows: CombinedHoldingRow[]; // 최신 순위 오름차순(이탈은 뒤)
  missing: string[]; // 등록/수집 데이터가 없는 코드
  hasPrev: boolean; // 전일 비교 데이터 존재 여부
}

// 종목 합산 비중 맵을 만들고, total로 순위(1-based)를 매겨 반환.
function rankMap(totals: Map<string, number>): Map<string, number> {
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return new Map(ranked.map(([key], i) => [key, i + 1]));
}

const keyOf = (code: string, name: string) => code || name;

// 여러 ETF의 최신·직전 스냅샷을 합쳐 비중 총합 + 전일 대비 순위/비중 변동을 계산.
// 각 스냅샷은 Top10만 저장되므로 합산도 각 ETF Top10 기준이다.
export async function getCombinedEtfHoldings(
  rawCodes: string[],
): Promise<CombinedEtfView> {
  // 입력 순서 보존 + 중복/형식 정리
  const codes: string[] = [];
  for (const c of rawCodes) {
    const code = c.trim().toUpperCase();
    if (CODE_RE.test(code) && !codes.includes(code)) codes.push(code);
  }
  if (codes.length === 0)
    return { columns: [], rows: [], missing: [], hasPrev: false };

  // 각 ETF의 스냅샷을 최신순으로 모두 가져와 ETF별 최신 2개(최신/직전)만 사용
  const snaps = await db.etfPdfSnapshot.findMany({
    where: { etfCode: { in: codes } },
    orderBy: { trdDd: "desc" },
    include: { watch: { select: { name: true } }, holdings: true },
  });
  type Snap = (typeof snaps)[number];
  const twoByCode = new Map<string, Snap[]>();
  for (const s of snaps) {
    const arr = twoByCode.get(s.etfCode) ?? [];
    if (arr.length < 2) arr.push(s);
    twoByCode.set(s.etfCode, arr);
  }

  // 데이터 있는 코드만 컬럼으로(입력 순서 유지), 나머지는 missing
  const columns: CombinedEtfColumn[] = [];
  const missing: string[] = [];
  for (const code of codes) {
    const arr = twoByCode.get(code);
    if (arr && arr[0]) {
      columns.push({
        code,
        name: arr[0].watch.name,
        trdDd: arr[0].trdDd,
        prevTrdDd: arr[1]?.trdDd ?? null,
      });
    } else {
      missing.push(code);
    }
  }
  const colIndex = new Map(columns.map((c, i) => [c.code, i]));
  const hasPrev = columns.some((c) => c.prevTrdDd != null);

  // 최신: 종목별 ETF 비중 배열 + 메타
  interface Agg {
    code: string;
    name: string;
    byEtf: (number | null)[];
  }
  const latestAgg = new Map<string, Agg>();
  const latestTotals = new Map<string, number>();
  const prevTotals = new Map<string, number>();
  const nameByKey = new Map<string, { code: string; name: string }>();

  for (const col of columns) {
    const ci = colIndex.get(col.code)!;
    const arr = twoByCode.get(col.code)!;
    // 최신
    for (const h of arr[0].holdings) {
      const key = keyOf(h.constituentCode, h.constituentName);
      nameByKey.set(key, { code: h.constituentCode, name: h.constituentName });
      let agg = latestAgg.get(key);
      if (!agg) {
        agg = { code: h.constituentCode, name: h.constituentName, byEtf: new Array(columns.length).fill(null) };
        latestAgg.set(key, agg);
      }
      agg.byEtf[ci] = (agg.byEtf[ci] ?? 0) + (h.weight ?? 0);
      latestTotals.set(key, (latestTotals.get(key) ?? 0) + (h.weight ?? 0));
    }
    // 직전
    if (arr[1]) {
      for (const h of arr[1].holdings) {
        const key = keyOf(h.constituentCode, h.constituentName);
        if (!nameByKey.has(key)) nameByKey.set(key, { code: h.constituentCode, name: h.constituentName });
        prevTotals.set(key, (prevTotals.get(key) ?? 0) + (h.weight ?? 0));
      }
    }
  }

  const latestRanks = rankMap(latestTotals);
  const prevRanks = rankMap(prevTotals);

  const allKeys = new Set<string>([...latestTotals.keys(), ...prevTotals.keys()]);
  const rows: CombinedHoldingRow[] = [...allKeys].map((key) => {
    const meta = nameByKey.get(key)!;
    const inLatest = latestTotals.has(key);
    const inPrev = prevTotals.has(key);
    const total = latestTotals.get(key) ?? 0;
    const totalPrev = inPrev ? prevTotals.get(key)! : null;
    const rank = latestRanks.get(key) ?? null;
    const prevRank = prevRanks.get(key) ?? null;
    const status: CombinedRowStatus = !inPrev ? "신규" : !inLatest ? "이탈" : "유지";
    return {
      constituentCode: meta.code,
      constituentName: meta.name,
      total,
      count: latestAgg.get(key)?.byEtf.filter((w) => w != null).length ?? 0,
      byEtf: latestAgg.get(key)?.byEtf ?? new Array(columns.length).fill(null),
      rank,
      prevRank,
      rankDelta: status === "유지" && rank != null && prevRank != null ? prevRank - rank : null,
      totalPrev,
      weightDelta: status === "유지" && totalPrev != null ? total - totalPrev : null,
      status,
    };
  });

  // 최신 순위 오름차순, 이탈(rank null)은 직전 비중 큰 순으로 뒤에
  rows.sort((a, b) => {
    const ra = a.rank ?? Infinity;
    const rb = b.rank ?? Infinity;
    if (ra !== rb) return ra - rb;
    return (b.totalPrev ?? 0) - (a.totalPrev ?? 0);
  });

  return { columns, rows, missing, hasPrev };
}

export async function getEtfDetail(code: string): Promise<EtfDetailView | null> {
  const watch = await db.etfWatch.findUnique({ where: { code } });
  if (!watch) return null;
  const snaps = await db.etfPdfSnapshot.findMany({
    where: { etfCode: code },
    orderBy: { trdDd: "desc" },
    take: 2,
    include: { holdings: true },
  });
  const toHoldings = (hs: (typeof snaps)[number]["holdings"]): Holding[] =>
    hs.map((h) => ({
      constituentCode: h.constituentCode,
      constituentName: h.constituentName,
      weight: h.weight,
      shares: h.shares,
      amount: h.amount,
    }));
  const latest = snaps[0] ? toHoldings(snaps[0].holdings) : [];
  const prev = snaps[1] ? toHoldings(snaps[1].holdings) : null;
  return {
    code: watch.code,
    name: watch.name,
    latestTrdDd: snaps[0]?.trdDd ?? null,
    prevTrdDd: snaps[1]?.trdDd ?? null,
    marketValue: snaps[0]?.marketValue != null ? Number(snaps[0].marketValue) : null,
    changes: latest.length ? diffHoldings(latest, prev) : [],
  };
}
