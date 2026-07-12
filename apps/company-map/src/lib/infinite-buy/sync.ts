// V4.0 체결 동기화 — 순수 파트.
// V4의 상태(연속 T·잔금)는 오직 체결 이벤트로만 갱신된다 (레퍼런스 §2·§10).
//   매수: ΔT = 가중(전반 leg 0.5 / 후반·첫매수 1) × 체결비율. 잔금 −= 체결대금.
//   쿼터매도: T×0.75 / 지정가매도: T×0.25 (부분체결이어도 전량 기준 — 스펙 확정). 잔금 += 체결대금.
// 같은 거래일 적용 순서: 지정가매도(장중) → 쿼터매도(종가) → 매수(종가).
import type { PrismaClient } from "@prisma-clients/company-map";
import type { TossOrder } from "@/lib/toss/client";

export interface FillEvent {
  side: "BUY" | "SELL";
  kind: string;
  quantity: number;    // 주문 수량
  filledQty: number;   // 체결 수량
  filledPrice: number; // 체결가
  tradeDate: string;   // YYYY-MM-DD
}

const BUY_T_WEIGHT: Record<string, number> = {
  first_big_loc: 1,
  loc_star_full: 1,
  loc_star_half: 0.5,
  loc_avg_half: 0.5,
};

const KIND_PRIORITY: Record<string, number> = {
  sell_lim_target: 0, // 장중 체결 — 같은 날이면 가장 먼저
  sell_loc_star: 1,   // 종가 체결
};

export function sortFills<T extends FillEvent>(fills: T[]): T[] {
  return [...fills].sort((a, b) =>
    a.tradeDate !== b.tradeDate
      ? a.tradeDate.localeCompare(b.tradeDate)
      : (KIND_PRIORITY[a.kind] ?? 2) - (KIND_PRIORITY[b.kind] ?? 2),
  );
}

export function applyFills(
  init: { t: number; cash: number },
  fills: FillEvent[],
): { t: number; cash: number } {
  let { t, cash } = init;
  for (const fe of sortFills(fills)) {
    if (!(fe.filledQty > 0) || !(fe.filledPrice > 0)) continue;
    const amount = fe.filledQty * fe.filledPrice;
    if (fe.side === "BUY") {
      const weight = BUY_T_WEIGHT[fe.kind] ?? 1;
      t += weight * (fe.filledQty / fe.quantity);
      cash -= amount;
    } else {
      t *= fe.kind === "sell_loc_star" ? 0.75 : 0.25;
      cash += amount;
    }
  }
  return { t, cash };
}

// dryRun 포지션 파생: 매수 가중평균 평단, 매도는 수량만 감소(평단 유지).
export function derivePositionFromFills(fills: FillEvent[]): { avgPrice: number | null; holdingQty: number } {
  let qty = 0;
  let avg: number | null = null;
  for (const fe of sortFills(fills)) {
    if (!(fe.filledQty > 0) || !(fe.filledPrice > 0)) continue;
    if (fe.side === "BUY") {
      avg = avg == null || qty <= 0
        ? fe.filledPrice
        : (avg * qty + fe.filledPrice * fe.filledQty) / (qty + fe.filledQty);
      qty += fe.filledQty;
    } else {
      qty -= fe.filledQty;
      if (qty <= 0) { qty = 0; avg = null; }
    }
  }
  return { avgPrice: avg, holdingQty: qty };
}

// 정합성: Σ매수체결 − Σ매도체결 = 실제 보유수량 (LIVE 오염 방어선)
export function crossCheckHolding(fills: FillEvent[], actualQty: number): { ok: boolean; expected: number } {
  let expected = 0;
  for (const fe of fills) {
    if (!(fe.filledQty > 0) || !(fe.filledPrice > 0)) continue;
    expected += fe.side === "BUY" ? fe.filledQty : -fe.filledQty;
  }
  return { ok: Math.abs(expected - actualQty) < 1e-6, expected };
}

// ───────────────────────── IO 파트 ─────────────────────────

export interface SyncTossDeps {
  getDefaultAccountSeq(): Promise<number>;
  getClosedOrders(accountSeq: number, symbol: string, from: string): Promise<TossOrder[]>;
}

// 토스 CLOSED 주문 ↔ 우리 주문(tossOrderId) 대조, BUY·SELL 모두 체결 기록. 멱등.
// (기존 syncSellFills의 확장판 — SELL 필터 제거. 서버 액션은 이 함수의 래퍼가 된다.)
export async function syncFillsFromToss(
  db: PrismaClient,
  cycleId: string,
  deps: SyncTossDeps,
): Promise<{ updated: number }> {
  const cycle = await db.infiniteBuyCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return { updated: 0 };
  const accountSeq = cycle.accountSeq ?? (await deps.getDefaultAccountSeq());
  const from = cycle.createdAt.toISOString().slice(0, 10);
  const tossOrders = await deps.getClosedOrders(accountSeq, cycle.symbol, from);
  let updated = 0;
  for (const to of tossOrders) {
    if (to.filledQuantity <= 0) continue;
    const our = await db.infiniteBuyOrder.findFirst({ where: { cycleId, tossOrderId: to.orderId } });
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
  return { updated };
}

const FILLED_STATUSES = ["filled", "simulated_filled"];

function toFillEvent(o: {
  side: string; kind: string; quantity: number;
  filledQty: number | null; filledPrice: number | null; tradeDate: string;
}): FillEvent {
  return {
    side: o.side as "BUY" | "SELL",
    kind: o.kind,
    quantity: o.quantity,
    filledQty: o.filledQty ?? 0,
    filledPrice: o.filledPrice ?? 0,
    tradeDate: o.tradeDate,
  };
}

// 체결된 전체 이벤트 (포지션 파생·크로스체크용)
export async function loadFillEvents(db: PrismaClient, cycleId: string): Promise<FillEvent[]> {
  const rows = await db.infiniteBuyOrder.findMany({
    where: { cycleId, status: { in: FILLED_STATUSES } },
    orderBy: { tradeDate: "asc" },
  });
  return rows.map(toFillEvent);
}

// 미반영 체결(stateApplied ≠ true)을 T/잔금에 반영하고 마킹. 트랜잭션으로 원자성 보장.
export async function applyPendingFillsV4(
  db: PrismaClient,
  cycleId: string,
): Promise<{ t: number; cash: number; applied: number }> {
  return db.$transaction(async (tx) => {
    const cycle = await tx.infiniteBuyCycle.findUniqueOrThrow({ where: { id: cycleId } });
    const pending = await tx.infiniteBuyOrder.findMany({
      where: { cycleId, status: { in: FILLED_STATUSES }, OR: [{ stateApplied: null }, { stateApplied: false }] },
      orderBy: { tradeDate: "asc" },
    });
    let t = cycle.tValue ?? 0;
    let cash = cycle.cashRemaining ?? cycle.principal;
    if (pending.length > 0) {
      ({ t, cash } = applyFills({ t, cash }, pending.map(toFillEvent)));
      await tx.infiniteBuyCycle.update({ where: { id: cycleId }, data: { tValue: t, cashRemaining: cash } });
      await tx.infiniteBuyOrder.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { stateApplied: true },
      });
    }
    return { t, cash, applied: pending.length };
  });
}
