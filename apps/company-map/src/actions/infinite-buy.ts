"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  getHoldings, getDefaultAccountSeq, getBuyingPower, getDailyCandles, getOrders,
  isTossConfigured, type DailyCandle,
} from "@/lib/toss/client";
import { runCycle, type CycleConfig } from "@/lib/infinite-buy/run";
import { tossRunDeps, prismaPersistence, isKilled } from "@/lib/infinite-buy/toss-adapter";
import { rsi14, RSI_UNIVERSE } from "@/lib/infinite-buy/rsi";

export interface CycleView {
  id: string;
  symbol: string;
  name: string;
  status: string;
  dryRun: boolean;
  version: string;
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

// 토스 읽기 호출 재시도. worker와 토큰/요청한도 경합으로 간헐 실패 시 대시보드가
// "—"로 비는 것을 막는다. 읽기 전용에만 사용(주문 경로엔 적용 안 함).
async function retryRead<T>(fn: () => Promise<T>, tries = 3, delayMs = 400): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

async function liveHoldingMap(): Promise<Map<string, { avg: number; qty: number; pnl: number }>> {
  const map = new Map<string, { avg: number; qty: number; pnl: number }>();
  if (!isTossConfigured()) return map;
  try {
    const accountSeq = await getDefaultAccountSeq();
    const overview = await retryRead(() => getHoldings(accountSeq));
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
    return await retryRead(() => getDailyCandles(symbol, count));
  } catch {
    return [];
  }
}

// 기본 계좌의 USD 매수가능금액(달러 잔고). 토스 미설정/조회 실패 시 null.
export async function getUsdBuyingPower(): Promise<number | null> {
  if (!isTossConfigured()) return null;
  try {
    const accountSeq = await getDefaultAccountSeq();
    return await retryRead(() => getBuyingPower(accountSeq, "USD"));
  } catch {
    return null;
  }
}

export interface RsiRow {
  symbol: string;
  rsi: number | null;
  close: number | null;
  date: string | null; // 마지막 캔들 기준일
  error: string | null;
}

export interface RsiTable {
  rows: RsiRow[];
  fetchedAt: string | null; // ISO. null이면 아직 수집 전
}

// 모듈 캐시(프로세스 생명주기). RSI는 참고 지표라 영속 저장까진 불필요.
let rsiCache: RsiTable = { rows: [], fetchedAt: null };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 무한매수 유니버스(3배 ETF 15종) RSI(14) 테이블.
// force=false: 캐시만 반환(네트워크 0). force=true: 토스 일봉 200개 × 15종 순차 수집(~20초).
export async function getRsiTable(force = false): Promise<RsiTable> {
  if (!force || !isTossConfigured()) return rsiCache;
  const rows: RsiRow[] = [];
  for (const symbol of RSI_UNIVERSE) {
    try {
      const candles = await retryRead(() => getDailyCandles(symbol, 200), 2, 800);
      const closes = candles.map((c) => c.close);
      rows.push({
        symbol,
        rsi: rsi14(closes),
        close: closes[closes.length - 1] ?? null,
        date: candles[candles.length - 1]?.date ?? null,
        error: null,
      });
    } catch (e) {
      rows.push({ symbol, rsi: null, close: null, date: null, error: e instanceof Error ? e.message : String(e) });
    }
    await sleep(800); // MARKET_DATA 요청한도 완화
  }
  rows.sort((a, b) => (a.rsi ?? 999) - (b.rsi ?? 999));
  rsiCache = { rows, fetchedAt: new Date().toISOString() };
  return rsiCache;
}

export async function listCycles(): Promise<CycleView[]> {
  const rows = await db.infiniteBuyCycle.findMany({ orderBy: { createdAt: "asc" } });
  const live = await liveHoldingMap();
  return rows.map((c) => {
    const h = live.get(c.symbol) ?? null;
    return {
      id: c.id, symbol: c.symbol, name: c.name, status: c.status, dryRun: c.dryRun, version: c.version,
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
  version?: "v1" | "v2.2";
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
      version: input.version === "v2.2" ? "v2.2" : "v1",
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
  avgCost: number | null; // SELL 시점 평단
  filledQty: number | null; // 실제 체결 수량(토스 동기화)
  filledPrice: number | null; // 평균 체결가
  filledAt: string | null; // 체결 시각
  realizedPnl: number | null; // (체결가 − 평단) × 체결수량. 체결 확인된 SELL만.
}

function toOrderView(o: {
  id: string; tradeDate: string; round: number; side: string; kind: string;
  price: number | null; quantity: number; status: string; dryRun: boolean;
  error: string | null; createdAt: Date; avgCost: number | null;
  filledQty: number | null; filledPrice: number | null; filledAt: string | null;
}): OrderView {
  const sellPrice = o.filledPrice ?? o.price;
  const sellQty = o.filledQty ?? o.quantity;
  const realizedPnl =
    o.side === "SELL" && o.avgCost != null && sellPrice != null
      ? (sellPrice - o.avgCost) * sellQty
      : null;
  return {
    id: o.id, tradeDate: o.tradeDate, round: o.round, side: o.side, kind: o.kind,
    price: o.price, quantity: o.quantity, status: o.status, dryRun: o.dryRun,
    error: o.error, createdAt: o.createdAt.toISOString(),
    avgCost: o.avgCost, filledQty: o.filledQty, filledPrice: o.filledPrice,
    filledAt: o.filledAt, realizedPnl,
  };
}

export async function getCycleOrders(id: string, limit = 100): Promise<OrderView[]> {
  const rows = await db.infiniteBuyOrder.findMany({
    where: { cycleId: id }, orderBy: { createdAt: "desc" }, take: limit,
  });
  return rows.map(toOrderView);
}

// 실제 체결(status=filled)된 매도만. 자동 리셋 뒤에도 같은 사이클에 누적.
export async function getSellHistory(id: string, limit = 200): Promise<OrderView[]> {
  const rows = await db.infiniteBuyOrder.findMany({
    where: { cycleId: id, side: "SELL", status: "filled" },
    orderBy: { filledAt: "desc" },
    take: limit,
  });
  return rows.map(toOrderView);
}

// 토스 주문내역과 대조해, 우리가 낸 매도 주문의 실제 체결을 확인·저장(status=filled).
// dryRun/미체결/취소는 filled로 바뀌지 않아 매도 이력에서 자연히 제외된다.
export async function syncSellFills(id: string): Promise<{ ok: boolean; updated: number; reason?: string }> {
  if (!isTossConfigured()) return { ok: false, updated: 0, reason: "토스 미설정" };
  const cycle = await db.infiniteBuyCycle.findUnique({ where: { id } });
  if (!cycle) return { ok: false, updated: 0, reason: "사이클 없음" };
  try {
    const accountSeq = cycle.accountSeq ?? (await getDefaultAccountSeq());
    const from = cycle.createdAt.toISOString().slice(0, 10);
    const orders = await retryRead(() =>
      getOrders(accountSeq, { status: "CLOSED", symbol: cycle.symbol, from }),
    );
    let updated = 0;
    for (const to of orders) {
      if (to.side !== "SELL" || to.filledQuantity <= 0) continue; // 체결된 매도만
      const our = await db.infiniteBuyOrder.findFirst({
        where: { cycleId: id, tossOrderId: to.orderId },
      });
      if (!our) continue;
      if (our.status === "filled" && our.filledQty === to.filledQuantity) continue; // 이미 반영
      await db.infiniteBuyOrder.update({
        where: { id: our.id },
        data: {
          status: "filled",
          filledQty: to.filledQuantity,
          filledPrice: to.averageFilledPrice,
          filledAt: to.filledAt,
        },
      });
      updated++;
    }
    revalidatePath("/stocks/infinite-buy");
    return { ok: true, updated };
  } catch (e) {
    return { ok: false, updated: 0, reason: e instanceof Error ? e.message : String(e) };
  }
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
    lossCut: c.lossCut, round: c.round, dryRun: c.dryRun, version: c.version as "v1" | "v2.2",
  };
  const tradeDate = new Date().toISOString().slice(0, 10);
  await runCycle(prismaPersistence(db), tossRunDeps(), config, tradeDate, isKilled());
  revalidatePath("/stocks/infinite-buy");
  return { ok: true };
}
