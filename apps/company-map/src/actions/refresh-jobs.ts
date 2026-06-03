"use server";

import { spawn } from "node:child_process";
import { db } from "@/lib/db";

export type RefreshKind = "krx_stocks" | "vip_holdings" | "operating_income" | "trade" | "price_changes" | "ncav_financials" | "etf_pdf";

const VALID_KINDS = new Set<RefreshKind>([
  "krx_stocks",
  "vip_holdings",
  "operating_income",
  "trade",
  "price_changes",
  "ncav_financials",
  "etf_pdf",
]);

export interface RefreshStateView {
  kind: RefreshKind;
  status: "running" | "done" | "failed" | "idle";
  startedAt: string | null;
  finishedAt: string | null;
  output: string | null;
}

export async function listRefreshStates(): Promise<RefreshStateView[]> {
  const rows = await db.refreshState.findMany();
  const map = new Map(rows.map((r) => [r.kind, r]));
  return Array.from(VALID_KINDS).map((kind) => {
    const r = map.get(kind);
    if (!r) {
      return {
        kind,
        status: "idle",
        startedAt: null,
        finishedAt: null,
        output: null,
      };
    }
    return {
      kind,
      status: r.status as "running" | "done" | "failed",
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      output: r.output,
    };
  });
}

export async function triggerRefresh(
  kind: RefreshKind,
): Promise<{ ok: boolean; reason?: string }> {
  if (!VALID_KINDS.has(kind)) return { ok: false, reason: "unknown kind" };

  const current = await db.refreshState.findUnique({ where: { kind } });
  if (current?.status === "running") {
    return { ok: false, reason: "이미 실행 중" };
  }

  const cwd = process.cwd();
  const child = spawn("npx", ["tsx", "scripts/run-refresh-job.ts", kind], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  await db.refreshState.upsert({
    where: { kind },
    create: { kind, status: "running", startedAt: new Date() },
    update: {
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      output: null,
    },
  });
  return { ok: true };
}
