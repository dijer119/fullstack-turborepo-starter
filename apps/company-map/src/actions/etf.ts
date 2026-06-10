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
  changes: HoldingChange[];
}

const CODE_RE = /^[0-9A-Z]{6}$/;

export async function listEtfWatches(): Promise<EtfWatchView[]> {
  const rows = await db.etfWatch.findMany({
    orderBy: { createdAt: "asc" },
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

  await db.etfWatch.create({ data: { code, name: code } }); // name/isin은 스냅샷 잡이 보강
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
    changes: latest.length ? diffHoldings(latest, prev) : [],
  };
}
