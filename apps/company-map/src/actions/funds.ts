"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { diffHoldings } from "@/lib/etf/diff";
import type { Holding, HoldingChange } from "@/lib/etf/types";
import { FUND } from "@/lib/funds/kb-fund";
import { snapshotFundWith, fundStamp } from "@/lib/funds/snapshot";

// 펀드 보유(name 기반)를 ETF diff가 쓰는 Holding 형태로 변환. 코드/주식수/평가금액은 없음.
function toHolding(h: { name: string; weight: number | null }): Holding {
  return {
    constituentCode: "",
    constituentName: h.name,
    weight: h.weight,
    shares: null,
    amount: null,
  };
}

export interface FundDetailView {
  code: string;
  name: string;
  manager: string;
  latestTrdDd: string | null;
  prevTrdDd: string | null;
  latestNav: number | null;
  changes: HoldingChange[];
}

// 최신·직전 스냅샷의 보유 TOP10 diff(신규/이탈/비중변동). 스냅샷이 없으면 빈 changes.
export async function getFundDetail(): Promise<FundDetailView> {
  const snaps = await db.fundSnapshot.findMany({
    where: { fundCode: FUND.code },
    orderBy: { trdDd: "desc" },
    take: 2,
    include: { holdings: { orderBy: { rank: "asc" } } },
  });
  const latest = snaps[0] ?? null;
  const prev = snaps[1] ?? null;
  const changes = latest
    ? diffHoldings(
        latest.holdings.map(toHolding),
        prev ? prev.holdings.map(toHolding) : null,
      )
    : [];
  return {
    code: FUND.code,
    name: FUND.name,
    manager: FUND.manager,
    latestTrdDd: latest?.trdDd ?? null,
    prevTrdDd: prev?.trdDd ?? null,
    latestNav: latest?.nav ?? null,
    changes,
  };
}

export interface FundWeightHistoryRow {
  name: string;
  latestWeight: number | null; // 최신 비중(정렬 기준)
  inLatest: boolean; // 최신 TOP10 포함 여부
  weights: (number | null)[]; // dates 순서, TOP10 밖이면 null
}

export interface FundWeightHistory {
  dates: string[]; // trdDd(YYYYMMDD) 오름차순
  rows: FundWeightHistoryRow[];
}

// 최근 N개 스냅샷의 "종목 × 날짜" 비중 이력 매트릭스.
export async function getFundWeightHistory(limit = 60): Promise<FundWeightHistory> {
  const snaps = await db.fundSnapshot.findMany({
    where: { fundCode: FUND.code },
    orderBy: { trdDd: "desc" },
    take: limit,
    include: { holdings: true },
  });
  const sorted = [...snaps].sort((a, b) => a.trdDd.localeCompare(b.trdDd));
  const dates = sorted.map((s) => s.trdDd);

  const rowMap = new Map<string, FundWeightHistoryRow>();
  sorted.forEach((snap, i) => {
    for (const h of snap.holdings) {
      let row = rowMap.get(h.name);
      if (!row) {
        row = { name: h.name, latestWeight: null, inLatest: false, weights: dates.map(() => null) };
        rowMap.set(h.name, row);
      }
      row.weights[i] = h.weight;
    }
  });

  const latest = sorted[sorted.length - 1];
  if (latest) {
    for (const h of latest.holdings) {
      const row = rowMap.get(h.name);
      if (row) {
        row.inLatest = true;
        row.latestWeight = h.weight;
      }
    }
  }

  const rows = [...rowMap.values()].sort((a, b) => {
    if (a.inLatest !== b.inLatest) return a.inLatest ? -1 : 1;
    return (b.latestWeight ?? 0) - (a.latestWeight ?? 0);
  });
  return { dates, rows };
}

export interface FundNavPoint {
  date: string; // YYYYMMDD
  nav: number;
}

// 기준가(NAV) 시계열(오름차순).
export async function getFundNavHistory(): Promise<FundNavPoint[]> {
  const rows = await db.fundNav.findMany({
    where: { fundCode: FUND.code },
    orderBy: { date: "asc" },
    select: { date: true, nav: true },
  });
  return rows;
}

// 수동 새로고침: 인라인으로 fetch→스냅샷(내용 dedup). ETF의 무거운 spawn 잡 불필요.
export async function refreshFund(): Promise<{ result: "saved" | "skipped" | "failed" }> {
  const result = await snapshotFundWith(db, fundStamp());
  revalidatePath("/stocks/funds");
  return { result };
}
