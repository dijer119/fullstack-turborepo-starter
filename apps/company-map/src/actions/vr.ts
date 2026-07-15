"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getMarketCalendarUS, getPrices } from "@/lib/toss/client";
import { band } from "@/lib/vr/formula";
import { buyTable, sellTable, type VrIntendedOrder } from "@/lib/vr/order-table";
import { deriveHolding, resolvePoolLimitPct, runVr } from "@/lib/vr/run-vr";
import { isVrKilled, tossVrDeps } from "@/lib/vr/toss-deps";

const PAGE = "/stocks/vr";

export interface VrAccountView {
  id: string;
  symbol: string;
  name: string;
  type: string;
  formula: string;
  status: string;
  dryRun: boolean;
  gValue: number;
  bandPct: number;
  contribution: number;
  vValue: number;
  pool: number;
  bandMin: number;
  bandMax: number;
  poolLimitPct: number;
  holdingQty: number;
  evalAmount: number | null;   // 표시용: 보유 × 현재가 (시세 실패 시 null)
  currentPrice: number | null;
  cycleIndex: number;
  cycleStartDate: string;
  startDate: string;
  lastRunDate: string | null;
  note: string | null;
  buyOrders: VrIntendedOrder[];  // 오늘 기준 미리보기
  sellOrders: VrIntendedOrder[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listVrAccounts(): Promise<VrAccountView[]> {
  const accounts = await db.vrAccount.findMany({ orderBy: { createdAt: "asc" } });
  const views: VrAccountView[] = [];
  for (const acc of accounts) {
    const fills = await db.vrOrder.findMany({
      where: { accountId: acc.id, status: { in: ["simulated_filled", "filled"] } },
      select: { side: true, filledQty: true },
    });
    const holding = deriveHolding(fills);
    let currentPrice: number | null = null;
    try {
      const [p] = await getPrices([acc.symbol]);
      currentPrice = Number(p?.lastPrice ?? 0) || null;
    } catch {
      currentPrice = null;
    }
    const today = todayIso();
    const b = band(acc.vValue, acc.bandPct);
    const limitPct = resolvePoolLimitPct(acc, today);
    views.push({
      id: acc.id, symbol: acc.symbol, name: acc.name, type: acc.type, formula: acc.formula,
      status: acc.status, dryRun: acc.dryRun, gValue: acc.gValue, bandPct: acc.bandPct,
      contribution: acc.contribution, vValue: acc.vValue, pool: acc.pool,
      bandMin: b.min, bandMax: b.max, poolLimitPct: limitPct, holdingQty: holding,
      evalAmount: currentPrice != null ? Math.round(holding * currentPrice * 100) / 100 : null,
      currentPrice, cycleIndex: acc.cycleIndex, cycleStartDate: acc.cycleStartDate,
      startDate: acc.startDate, lastRunDate: acc.lastRunDate, note: acc.note,
      buyOrders: buyTable(holding, b, Math.round(acc.pool * limitPct) / 100),
      sellOrders: sellTable(holding, b),
    });
  }
  return views;
}

export interface CreateVrInput {
  symbol: string;
  name: string;
  type: "accumulate" | "lumpsum";
  formula: "basic" | "skill";
  initialV: number;
  initialPool: number;
  initialQty: number;
  contribution: number;
  gValue: number;
  bandPct: number;
}

export async function createVrAccount(input: CreateVrInput): Promise<{ ok: boolean; error?: string }> {
  // LIVE 게이팅: dryRun은 항상 true로 생성. (스키마 default지만 명시적으로 고정)
  if (!input.symbol || input.initialV <= 0) return { ok: false, error: "symbol/초기 V가 유효하지 않습니다" };
  if (input.initialPool < 0 || input.initialQty < 0) return { ok: false, error: "Pool/보유수량은 음수 불가" };
  const today = todayIso();
  const acc = await db.vrAccount.create({
    data: {
      symbol: input.symbol.toUpperCase(), name: input.name || input.symbol.toUpperCase(),
      type: input.type, formula: input.formula,
      gValue: input.gValue, bandPct: input.bandPct,
      contribution: input.type === "lumpsum" ? 0 : input.contribution,
      vValue: input.initialV, pool: input.initialPool,
      startDate: today, cycleStartDate: today,
      dryRun: true,
    },
  });
  if (input.initialQty > 0) {
    // 초기 보유 seed — 이미 반영된 체결로 기록 (filledPrice 0 → Pool 영향 없음)
    await db.vrOrder.create({
      data: {
        accountId: acc.id, cycleIndex: 0, tradeDate: today,
        side: "BUY", kind: "seed", orderType: "MARKET", tif: "DAY",
        price: null, quantity: input.initialQty,
        filledQty: input.initialQty, filledPrice: 0, filledAt: today,
        stateApplied: true, dryRun: true, status: "simulated_filled",
      },
    });
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function setVrStatus(id: string, status: "active" | "paused" | "stopped"): Promise<void> {
  await db.vrAccount.update({ where: { id }, data: { status } });
  revalidatePath(PAGE);
}

export async function updateVrSettings(
  id: string,
  patch: { gValue?: number; contribution?: number; bandPct?: number; poolLimitMode?: string; poolLimitPct?: number | null },
): Promise<void> {
  await db.vrAccount.update({ where: { id }, data: patch });
  revalidatePath(PAGE);
}

/** 현재 열린 US 정규장 세션의 거래일. 없으면 null. (worker와 동일 판정) */
async function currentUsTradeDate(): Promise<string | null> {
  const cal = await getMarketCalendarUS();
  const now = Date.now();
  for (const day of [cal.previousBusinessDay, cal.today, cal.nextBusinessDay]) {
    const reg = day?.regularMarket as { startTime?: string; endTime?: string } | undefined;
    if (!reg?.startTime || !reg?.endTime) continue;
    const open = new Date(reg.startTime).getTime();
    const close = new Date(reg.endTime).getTime();
    if (now >= open && now < close) return day.date;
  }
  return null;
}

export async function runVrNow(id: string): Promise<{ ok: boolean; message: string }> {
  const tradeDate = await currentUsTradeDate();
  if (!tradeDate) return { ok: false, message: "US 정규장이 열려있지 않습니다" };
  const r = await runVr(db, tossVrDeps(), id, tradeDate, isVrKilled());
  revalidatePath(PAGE);
  if (r.blocked) return { ok: false, message: `보류: ${r.blocked}` };
  return { ok: true, message: `주문 ${r.simulated}건 기록${r.cycled ? " · 사이클 갱신" : ""}` };
}

export async function getVrCycleLogs(id: string) {
  return db.vrCycleLog.findMany({ where: { accountId: id }, orderBy: { cycleIndex: "asc" } });
}

export async function getVrOrders(id: string, limit = 100) {
  return db.vrOrder.findMany({
    where: { accountId: id },
    orderBy: [{ tradeDate: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}
