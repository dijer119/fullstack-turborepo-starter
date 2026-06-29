"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  getHoldings, getDefaultAccountSeq, getBuyingPower, getDailyCandles,
  isTossConfigured, type DailyCandle,
} from "@/lib/toss/client";
import { runCycle, type CycleConfig } from "@/lib/infinite-buy/run";
import { tossRunDeps, prismaPersistence, isKilled } from "@/lib/infinite-buy/toss-adapter";

export interface CycleView {
  id: string;
  symbol: string;
  name: string;
  status: string;
  dryRun: boolean;
  principal: number;
  splits: number;
  round: number;
  profitTarget: number;
  bigBuyPremium: number;
  lossCut: number;
  lastRunDate: string | null;
  // 라이브(토스) — 조회 실패 시 null
  avgPrice: number | null;
  holdingQty: number | null;
  pnlPct: number | null;
  targetSellPrice: number | null;
}

async function liveHoldingMap(): Promise<Map<string, { avg: number; qty: number; pnl: number }>> {
  const map = new Map<string, { avg: number; qty: number; pnl: number }>();
  if (!isTossConfigured()) return map;
  try {
    const accountSeq = await getDefaultAccountSeq();
    const overview = await getHoldings(accountSeq);
    for (const i of overview.items) {
      map.set(i.symbol, {
        avg: Number(i.averagePurchasePrice),
        qty: Number(i.quantity),
        pnl: Number(i.profitLoss.rate) * 100,
      });
    }
  } catch {
    /* 토스 조회 실패는 무시(라이브 필드 null) */
  }
  return map;
}

// 종목 일별 종가 시계열(차트용). 기본 90거래일. 미설정/실패 시 빈 배열.
export async function getPriceHistory(symbol: string, count = 90): Promise<DailyCandle[]> {
  if (!isTossConfigured()) return [];
  try {
    return await getDailyCandles(symbol, count);
  } catch {
    return [];
  }
}

// 기본 계좌의 USD 매수가능금액(달러 잔고). 토스 미설정/조회 실패 시 null.
export async function getUsdBuyingPower(): Promise<number | null> {
  if (!isTossConfigured()) return null;
  try {
    const accountSeq = await getDefaultAccountSeq();
    return await getBuyingPower(accountSeq, "USD");
  } catch {
    return null;
  }
}

export async function listCycles(): Promise<CycleView[]> {
  const rows = await db.infiniteBuyCycle.findMany({ orderBy: { createdAt: "asc" } });
  const live = await liveHoldingMap();
  return rows.map((c) => {
    const h = live.get(c.symbol) ?? null;
    return {
      id: c.id, symbol: c.symbol, name: c.name, status: c.status, dryRun: c.dryRun,
      principal: c.principal, splits: c.splits, round: c.round, profitTarget: c.profitTarget,
      bigBuyPremium: c.bigBuyPremium, lossCut: c.lossCut, lastRunDate: c.lastRunDate,
      avgPrice: h?.avg ?? null, holdingQty: h?.qty ?? null, pnlPct: h?.pnl ?? null,
      targetSellPrice: h && h.avg > 0 ? Math.round(h.avg * (1 + c.profitTarget / 100) * 100) / 100 : null,
    };
  });
}

export async function createCycle(input: {
  symbol: string; name: string; principal: number;
  splits?: number; profitTarget?: number; bigBuyPremium?: number; lossCut?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false, reason: "심볼 필요" };
  if (!(input.principal > 0)) return { ok: false, reason: "원금은 0보다 커야 함" };
  const exists = await db.infiniteBuyCycle.findFirst({ where: { symbol, status: "active" } });
  if (exists) return { ok: false, reason: "이미 active 사이클이 있는 종목" };
  await db.infiniteBuyCycle.create({
    data: {
      symbol, name: input.name.trim() || symbol, principal: input.principal,
      splits: input.splits ?? 40, profitTarget: input.profitTarget ?? 10,
      bigBuyPremium: input.bigBuyPremium ?? 12, lossCut: input.lossCut ?? 10,
      dryRun: true, // 항상 dryRun으로 시작
    },
  });
  revalidatePath("/stocks/infinite-buy");
  return { ok: true };
}

export async function updateCycle(
  id: string,
  data: Partial<{ dryRun: boolean; status: string; principal: number; profitTarget: number; bigBuyPremium: number; lossCut: number }>,
): Promise<{ ok: boolean }> {
  await db.infiniteBuyCycle.update({ where: { id }, data });
  revalidatePath("/stocks/infinite-buy");
  return { ok: true };
}

export async function deleteCycle(id: string): Promise<{ ok: boolean }> {
  await db.infiniteBuyCycle.delete({ where: { id } }).catch(() => {});
  revalidatePath("/stocks/infinite-buy");
  return { ok: true };
}

export interface OrderView {
  id: string; tradeDate: string; round: number; side: string; kind: string;
  price: number | null; quantity: number; status: string; dryRun: boolean; error: string | null;
  createdAt: string;
}

export async function getCycleOrders(id: string, limit = 100): Promise<OrderView[]> {
  const rows = await db.infiniteBuyOrder.findMany({
    where: { cycleId: id }, orderBy: { createdAt: "desc" }, take: limit,
  });
  return rows.map((o) => ({
    id: o.id, tradeDate: o.tradeDate, round: o.round, side: o.side, kind: o.kind,
    price: o.price, quantity: o.quantity, status: o.status, dryRun: o.dryRun,
    error: o.error, createdAt: o.createdAt.toISOString(),
  }));
}

// 수동 트리거(검증용). lastRunDate 무시하고 1회 실행.
export async function runCycleNow(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isTossConfigured()) return { ok: false, reason: "토스 미설정" };
  const c = await db.infiniteBuyCycle.findUnique({ where: { id } });
  if (!c) return { ok: false, reason: "사이클 없음" };
  if (c.status !== "active") return { ok: false, reason: "active 사이클만 실행 가능 (재개 후 시도)" };
  const config: CycleConfig = {
    id: c.id, symbol: c.symbol, accountSeq: c.accountSeq, principalUsd: c.principal,
    splits: c.splits, profitTarget: c.profitTarget, bigBuyPremium: c.bigBuyPremium,
    lossCut: c.lossCut, round: c.round, dryRun: c.dryRun,
  };
  const tradeDate = new Date().toISOString().slice(0, 10);
  await runCycle(prismaPersistence(db), tossRunDeps(), config, tradeDate, isKilled());
  revalidatePath("/stocks/infinite-buy");
  return { ok: true };
}
