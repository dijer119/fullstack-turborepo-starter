// VR 2주 사이클 오케스트레이터. 순서 불변식: 체결 반영 → 사이클 갱신 → 주문 계산.
//   ① sync(dryRun: 과거 simulated를 일봉으로 판정) → ② apply(Pool·보유)
//   → ③ 사이클 경계면 V 갱신(+적립) → ④ 매수·매도표 → ⑤ 제출/기록
// blocked 시 lastRunDate를 갱신하지 않아 다음 폴에서 자동 재시도된다. (V4 패턴)
import type { PrismaClient } from "@prisma-clients/company-map";
import { judgeDryFill, type DryCandle } from "@/lib/infinite-buy/dry-fill";
import { band, nextV, round2, type VrFormula } from "./formula";
import { autoPoolLimitPct, weeksBetween, type VrType } from "./pool-limit";
import { buyTable, sellTable } from "./order-table";

export interface VrRunDeps {
  getDailyCandle(symbol: string, date: string): Promise<DryCandle | null>;
  /** before(미포함) 직전 US 거래일 종가 — 공식의 E 계산용 */
  getPrevTradeClose(symbol: string, before: string): Promise<number | null>;
}

export interface VrRunResult {
  simulated: number;
  cycled: boolean;
  blocked: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 오늘이 사이클 시작 +14일 이후인가. 매 거래일 폴이므로 "첫 거래일"은 자동 충족. */
export function isCycleBoundary(cycleStartDate: string, tradeDate: string): boolean {
  const start = new Date(`${cycleStartDate}T00:00:00Z`).getTime();
  const today = new Date(`${tradeDate}T00:00:00Z`).getTime();
  return today - start >= 14 * DAY_MS;
}

/** 파생 보유수량 = 체결(seed 포함) 누적. */
export function deriveHolding(fills: Array<{ side: string; filledQty: number | null }>): number {
  let qty = 0;
  for (const f of fills) {
    if (f.filledQty == null) continue;
    qty += f.side === "BUY" ? f.filledQty : -f.filledQty;
  }
  return qty;
}

export function resolvePoolLimitPct(
  acc: { poolLimitMode: string; poolLimitPct: number | null; type: string; startDate: string },
  tradeDate: string,
): number {
  if (acc.poolLimitMode === "manual" && acc.poolLimitPct != null) return acc.poolLimitPct;
  return autoPoolLimitPct(acc.type as VrType, weeksBetween(acc.startDate, tradeDate));
}

// ① 과거 거래일의 simulated 주문을 그 날 일봉으로 판정 (run-v4의 simulateDryFills와 동일 패턴).
async function simulateDryFills(
  db: PrismaClient,
  deps: VrRunDeps,
  account: { id: string; symbol: string },
  tradeDate: string,
): Promise<void> {
  const pending = await db.vrOrder.findMany({
    where: { accountId: account.id, dryRun: true, status: "simulated", tradeDate: { lt: tradeDate } },
    orderBy: { tradeDate: "asc" },
  });
  const candles = new Map<string, DryCandle | null>();
  for (const o of pending) {
    if (!candles.has(o.tradeDate)) {
      candles.set(o.tradeDate, await deps.getDailyCandle(account.symbol, o.tradeDate));
    }
    const candle = candles.get(o.tradeDate);
    if (!candle) continue; // 일봉 미확보(휴장/조회실패) — 다음 폴에서 재시도
    const r = judgeDryFill(
      { side: o.side as "BUY" | "SELL", orderType: o.orderType, tif: o.tif, price: o.price },
      candle,
    );
    await db.vrOrder.update({
      where: { id: o.id },
      data: r.filled
        ? { status: "simulated_filled", filledQty: o.quantity, filledPrice: r.fillPrice, filledAt: o.tradeDate }
        : { status: "expired" },
    });
  }
}

// ② 미반영 체결을 Pool에 반영 (BUY: −, SELL: +). stateApplied 마커로 멱등.
async function applyFills(db: PrismaClient, accountId: string): Promise<void> {
  const fills = await db.vrOrder.findMany({
    where: {
      accountId,
      status: { in: ["simulated_filled", "filled"] },
      OR: [{ stateApplied: false }, { stateApplied: null }],
    },
    orderBy: { tradeDate: "asc" },
  });
  for (const f of fills) {
    const amount = (f.filledPrice ?? 0) * (f.filledQty ?? 0);
    const delta = f.side === "BUY" ? -amount : amount;
    await db.$transaction([
      db.vrAccount.update({ where: { id: accountId }, data: { pool: { increment: round2(delta) } } }),
      db.vrOrder.update({ where: { id: f.id }, data: { stateApplied: true } }),
    ]);
  }
}

export async function runVr(
  db: PrismaClient,
  deps: VrRunDeps,
  accountId: string,
  tradeDate: string,
  killed: boolean,
): Promise<VrRunResult> {
  const none: VrRunResult = { simulated: 0, cycled: false, blocked: null };
  if (killed) return { ...none, blocked: "disabled" };

  let acc = await db.vrAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (acc.status !== "active") return { ...none, blocked: "not_active" };
  if (acc.lastRunDate === tradeDate) return { ...none, blocked: "already_ran" };
  if (!acc.dryRun) {
    // LIVE 게이팅: 현재 미지원. note만 남기고 실행하지 않는다.
    await db.vrAccount.update({ where: { id: acc.id }, data: { note: "LIVE 미지원 — dryRun만 실행됩니다" } });
    return { ...none, blocked: "live_not_supported" };
  }

  // ① 전일까지의 simulated 판정 → ② Pool 반영
  await simulateDryFills(db, deps, acc, tradeDate);
  await applyFills(db, acc.id);
  acc = await db.vrAccount.findUniqueOrThrow({ where: { id: acc.id } });

  const fills = await db.vrOrder.findMany({
    where: { accountId: acc.id, status: { in: ["simulated_filled", "filled"] } },
    select: { side: true, filledQty: true },
  });
  const holding = deriveHolding(fills);

  // ③ 사이클 경계: 적립 → V 갱신 → 로그 (cycleIndex 유니크로 멱등)
  let cycled = false;
  if (isCycleBoundary(acc.cycleStartDate, tradeDate)) {
    const prevClose = await deps.getPrevTradeClose(acc.symbol, tradeDate);
    if (prevClose == null) {
      await db.vrAccount.update({ where: { id: acc.id }, data: { note: "직전 종가 미확보 — 재시도 대기" } });
      return { ...none, blocked: "no_prev_close" };
    }
    // 62주차 슬라이드 순서 그대로: 공식의 Pool/G 항에는 "적립 전" Pool(76.73),
    // 적립금은 공식 마지막 항(+250), Pool 잔액에는 별도 가산(326.73).
    const evalAmount = round2(holding * prevClose);
    const newVRounded = nextV({
      v: acc.vValue, pool: acc.pool, g: acc.gValue,
      evalAmount, contribution: acc.contribution,
      formula: acc.formula as VrFormula,
    });
    const poolAfterContribution = round2(acc.pool + acc.contribution);
    const nextIndex = acc.cycleIndex + 1;
    const limitPct = resolvePoolLimitPct(acc, tradeDate);
    await db.$transaction([
      db.vrCycleLog.create({
        data: {
          accountId: acc.id, cycleIndex: nextIndex, date: tradeDate,
          vValue: newVRounded, evalAmount, pool: poolAfterContribution,
          contribution: acc.contribution, gValue: acc.gValue,
          poolLimitPct: limitPct, holdingQty: holding,
        },
      }),
      db.vrAccount.update({
        where: { id: acc.id },
        data: {
          vValue: newVRounded, pool: poolAfterContribution,
          cycleIndex: nextIndex, cycleStartDate: tradeDate, note: null,
        },
      }),
    ]);
    acc = await db.vrAccount.findUniqueOrThrow({ where: { id: acc.id } });
    cycled = true;
  }

  // 같은 거래일 중복 제출 방지: 이미 오늘 이 계좌에 생성한 주문이 있으면 재제출하지 않는다.
  // 주문 생성과 lastRunDate 갱신 사이 크래시/재시도 시, simulateDryFills/applyFills가
  // 중복 행을 각각 독립 판정해 Pool·보유를 이중 반영하는 것을 막는다 (run-v4.ts와 동일 패턴).
  // 주의: 계좌 생성일에 kind="seed" 체결이 같은 tradeDate로 이미 있으면 그날 신규 주문 생성도
  // 함께 스킵된다 — 중복 방지가 우선이므로 안전한 방향으로 그대로 둔다.
  const alreadyToday = await db.vrOrder.count({ where: { accountId: acc.id, tradeDate } });
  if (alreadyToday > 0) {
    await db.vrAccount.update({ where: { id: acc.id }, data: { lastRunDate: tradeDate, note: null } });
    return { simulated: 0, cycled, blocked: null };
  }

  // ④ 오늘의 매수·매도표 → ⑤ simulated 기록 (당일 만료 주문 — 매 거래일 재계산·재제출)
  const b = band(acc.vValue, acc.bandPct);
  const budget = round2(acc.pool * (resolvePoolLimitPct(acc, tradeDate) / 100));
  const orders = [...buyTable(holding, b, budget), ...sellTable(holding, b)];
  for (const o of orders) {
    await db.vrOrder.create({
      data: {
        accountId: acc.id, cycleIndex: acc.cycleIndex, tradeDate,
        side: o.side, kind: o.kind, orderType: o.orderType, tif: o.tif,
        price: o.price, quantity: o.quantity, dryRun: true, status: "simulated",
      },
    });
  }
  await db.vrAccount.update({ where: { id: acc.id }, data: { lastRunDate: tradeDate, note: null } });
  return { simulated: orders.length, cycled, blocked: null };
}
