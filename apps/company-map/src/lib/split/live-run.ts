import { randomUUID } from "node:crypto";
import { transitionReservation, validateReservation, type ReservationInput } from "./reservation";
import type {
  PrismaClient,
  SplitLiveStrategy,
  SplitLiveOrder,
} from "@prisma-clients/company-map";
import { validateConfig, roundMoney } from "./engine";
import { getBudgetSchedule, type BudgetSettings, type TrancheSetting } from "./budget";
import { parseTranches, validateTranches } from "./tranche-settings";
import {
  lotTotals,
  planLiveOrder,
  validateExecution,
  validateFirstTakeProfitPct,
  type Execution,
} from "./live-rules";

export interface BrokerOrder extends Execution {
  orderId: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number | null;
  currency: string;
  orderedAt: string;
  status: string;
}
export interface LiveSnapshot {
  price: number;
  observedAt: Date;
  isOpen: boolean;
  sessionEndsAt: Date | null;
  holdingQty: number;
  buyingPower: number;
  sellableQty: number;
  openOrderIds: string[];
  conflict: string | null;
  tickSize?: number;
}
export interface LiveDeps {
  now(): Date;
  killed(): boolean;
  snapshot(strategy: SplitLiveStrategy): Promise<LiveSnapshot>;
  detail(accountSeq: number, orderId: string): Promise<BrokerOrder>;
  submit(
    strategy: SplitLiveStrategy,
    order: SplitLiveOrder,
    validUntil: Date,
  ): Promise<{ orderId: string }>;
}
export type CreateLiveInput = Pick<
  SplitLiveStrategy,
  | "name"
  | "symbol"
  | "market"
  | "accountSeq"
  | "initialCash"
  | "trancheBudget"
  | "maxTranches"
  | "buyDropPct"
  | "takeProfitPct"
  | "feeBufferPct"
> & BudgetSettings & { firstTakeProfitPct?: number; reservation?: ReservationInput };
const unresolved = [
  "submitting",
  "submit_unknown",
  "submitted",
  "cost_pending",
  "blocked",
];
const known = [
  "PENDING",
  "PENDING_CANCEL",
  "PENDING_REPLACE",
  "PARTIAL_FILLED",
  "FILLED",
  "CANCELED",
  "REJECTED",
];
const message = (error: unknown) =>
  error instanceof Error ? error.message : "실거래 처리 실패";
const orderPrevious = (o: SplitLiveOrder): Execution => ({
  filledQty: o.filledQty,
  filledAmount: o.filledAmount,
  commission: o.commission,
  tax: o.tax,
});

export async function createLiveStrategy(
  db: PrismaClient,
  input: CreateLiveInput,
  now = new Date(),
) {
  const reservation = input.reservation === undefined ? undefined : validateReservation(input.reservation, input.market, now);
  const symbol =
    typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  const name =
    typeof input.name === "string" ? input.name.trim() || symbol : symbol;
  if (input.tranches !== undefined) validateTranches(input.tranches, input.maxTranches, input.market);
  const firstTakeProfitPct = input.tranches?.[0].takeProfitPct ?? (input.firstTakeProfitPct === undefined ? 10 : input.firstTakeProfitPct);
  validateFirstTakeProfitPct(firstTakeProfitPct);
  validateConfig({
    symbol,
    name,
    market: input.market as "KR" | "US",
    source: "toss",
    initialCash: input.initialCash,
    trancheBudget: input.trancheBudget,
    maxTranches: input.maxTranches,
    buyDropPct: input.buyDropPct,
    takeProfitPct: input.takeProfitPct,
    feePct: input.feeBufferPct,
    sellTaxPct: 0,
  }, { budgetMode: input.budgetMode, budgetMultiplier: input.budgetMultiplier, tranches: input.tranches });
  if (!Number.isSafeInteger(input.accountSeq) || input.accountSeq <= 0)
    throw new Error("계좌를 선택하세요.");
  return db.splitLiveStrategy.create({
    data: {
      name,
      symbol,
      market: input.market,
      accountSeq: input.accountSeq,
      initialCash: input.initialCash,
      cash: input.initialCash,
      trancheBudget: input.trancheBudget,
      budgetMode: input.budgetMode,
      budgetMultiplier: input.budgetMultiplier,
      maxTranches: input.maxTranches,
      buyDropPct: input.buyDropPct,
      takeProfitPct: input.takeProfitPct,
      firstTakeProfitPct,
      trancheSettingsJson: input.tranches === undefined ? null : JSON.stringify(input.tranches),
      feeBufferPct: input.feeBufferPct,
      status: "paused",
      ...(reservation ? { reservation: { create: {
        ...reservation, note: "예약 매수 등록 · 감시 시작 전",
        events: { create: { ...reservation, type: "registered", message: "예약 매수 등록 · 감시 시작 전", createdAt: now } },
      } } } : {}),
    },
  });
}

async function acquire(db: PrismaClient, id: string, now: Date) {
  const token = randomUUID();
  const claim = await db.splitLiveStrategy.updateMany({
    where: { id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 120000) },
  });
  if (!claim.count)
    throw new Error("다른 실행이 진행 중입니다. 잠시 후 다시 시도하세요.");
  return token;
}
async function release(db: PrismaClient, id: string, token: string) {
  await db.splitLiveStrategy.updateMany({
    where: { id, leaseToken: token },
    data: { leaseToken: null, leaseUntil: null },
  });
}
async function pause(db: PrismaClient, id: string, note: string) {
  await db.$transaction(async (tx) => {
    await tx.splitLiveStrategy.update({ where: { id }, data: { status: "paused", note, revision: { increment: 1 } } });
    await transitionReservation(tx, id, "failed", note, new Date());
  });
}

export async function updateFirstTakeProfitPct(db: PrismaClient, id: string, value: number, now = new Date()) {
  validateFirstTakeProfitPct(value);
  const token = await acquire(db, id, now);
  try {
    const s = await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } });
    if (s.status !== "paused") throw new Error("일시정지한 전략에서만 익절률을 수정할 수 있습니다.");
    if (await db.splitLiveOrder.count({ where: { strategyId: id, status: { in: unresolved } } }))
      throw new Error("미체결·미확정 주문을 먼저 정리하고 동기화하세요.");
    const tranches = parseTranches(s.trancheSettingsJson, s.maxTranches, s.market);
    if (tranches) tranches[0].takeProfitPct = value;
    const saved = await db.splitLiveStrategy.updateMany({
      where: { id, status: "paused", revision: s.revision, leaseToken: token },
      data: { firstTakeProfitPct: value, trancheSettingsJson: tranches ? JSON.stringify(tranches) : null, revision: { increment: 1 }, note: "1차 익절률 변경 완료. 설정을 확인한 뒤 재개하세요." },
    });
    if (!saved.count) throw new Error("전략 상태가 변경됐습니다. 새로고침 후 다시 시도하세요.");
  } finally {
    await release(db, id, token);
  }
}

export async function updateLiveReservation(db: PrismaClient, id: string, input: ReservationInput, now = new Date()) {
  const token = await acquire(db, id, now);
  try {
    await db.$transaction(async tx => {
      const s = await tx.splitLiveStrategy.findUniqueOrThrow({ where: { id }, include: { reservation: true, lots: true, orders: true } });
      if (!s.reservation || s.status !== "paused" || s.reservation.status === "executed" || s.lots.some(l => l.boughtQty > 0))
        throw new Error("1차 체결 전 일시정지한 예약 매수만 수정할 수 있습니다.");
      if (s.orders.some(o => unresolved.includes(o.status))) throw new Error("미체결·미확정 주문을 먼저 정리하고 동기화하세요.");
      const values = validateReservation(input, s.market, now);
      const saved = await tx.splitLiveStrategy.updateMany({ where: { id, status: "paused", revision: s.revision, leaseToken: token, leaseUntil: { gt: now } },
        data: { revision: { increment: 1 }, note: "예약 조건 저장 완료 — 감시를 시작하세요." } });
      if (!saved.count) throw new Error("전략 상태가 변경됐습니다. 새로고침 후 다시 시도하세요.");
      await tx.splitBuyReservation.update({ where: { strategyId: id }, data: { ...values, status: "waiting", orderId: null, note: "예약 조건 변경 · 감시 시작 전" } });
      await tx.splitReservationEvent.create({ data: { strategyId: id, ...values, type: "updated", message: "예약 조건 변경 · 감시 시작 전", createdAt: now } });
    });
  } finally { await release(db, id, token); }
}

export async function updateLiveTranches(db: PrismaClient, id: string, tranches: TrancheSetting[], now = new Date()) {
  const token = await acquire(db, id, now);
  try {
    const s = await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } });
    if (!["active", "reserved", "paused"].includes(s.status)) throw new Error("종료된 전략의 차수별 설정은 수정할 수 없습니다.");
    validateTranches(tranches, s.maxTranches, s.market);
    if (getBudgetSchedule({ ...s, tranches }).total > s.initialCash)
      throw new Error("차수별 매수금액 합계가 배정 자금을 초과합니다.");
    // Submitted orders keep their original price/quantity. The worker reconciles
    // unresolved orders before reading these settings for the next decision.
    const saved = await db.splitLiveStrategy.updateMany({
      where: { id, status: s.status, revision: s.revision, leaseToken: token, leaseUntil: { gt: now } },
      data: { trancheSettingsJson: JSON.stringify(tranches), firstTakeProfitPct: tranches[0].takeProfitPct,
        revision: { increment: 1 }, note: s.status === "active"
          ? "차수별 설정 변경 완료. 다음 신규 주문 판단부터 적용합니다."
          : "차수별 설정 변경 완료. 재개 후 신규 주문 판단부터 적용합니다." },
    });
    if (!saved.count) throw new Error("전략 상태가 변경됐습니다. 새로고침 후 다시 시도하세요.");
  } finally { await release(db, id, token); }
}

export async function startLiveStrategy(
  db: PrismaClient,
  deps: LiveDeps,
  id: string,
) {
  if (deps.killed())
    throw new Error("SPLIT_LIVE_DISABLED로 신규 주문이 차단되어 있습니다.");
  const token = await acquire(db, id, deps.now());
  let addedOwner = false;
  try {
    const s = await db.splitLiveStrategy.findUniqueOrThrow({
      where: { id },
      include: { lots: true, orders: true, reservation: true },
    });
    if (s.status === "completed")
      throw new Error("종료된 전략은 새로 만드세요.");
    if (s.reservation && s.reservation.status !== "executed") {
      if (s.reservation.status !== "waiting") throw new Error("예약 매수 실패·만료 내역을 확인하고 예약 조건을 다시 저장하세요.");
      if (s.reservation.expiresAt <= deps.now()) throw new Error("예약 매수 유효기간이 만료됐습니다. 유효일을 변경하세요.");
    }
    if (["active", "reserved"].includes(s.status)) return;
    if (s.status !== "paused")
      throw new Error("시작할 수 없는 전략 상태입니다.");
    if (
      s.orders.some((o) =>
        ["submitting", "submit_unknown", "blocked", "cost_pending"].includes(
          o.status,
        ),
      )
    )
      throw new Error("미확인 주문을 먼저 대조하세요.");
    const owner = await db.splitSymbolOwner.findUnique({
      where: {
        accountSeq_symbol: { accountSeq: s.accountSeq, symbol: s.symbol },
      },
    });
    if (owner && owner.strategyId !== id)
      throw new Error("다른 실거래 전략이 같은 계좌·종목을 관리 중입니다.");
    if (!owner) {
      await db.splitSymbolOwner.create({
        data: { accountSeq: s.accountSeq, symbol: s.symbol, strategyId: id },
      });
      addedOwner = true;
    }
    const snap = await deps.snapshot(s);
    const qty = s.lots.reduce((sum, l) => sum + lotTotals(l).remainingQty, 0);
    if (snap.conflict) throw new Error(snap.conflict);
    if (!Number.isFinite(snap.holdingQty) || snap.holdingQty !== qty)
      throw new Error(
        "실보유와 장부 잔량이 다릅니다. 기존 보유 종목을 가져올 수 없습니다.",
      );
    const ourIds = new Set(s.orders.map((o) => o.tossOrderId));
    if (snap.openOrderIds.some((o) => !ourIds.has(o)))
      throw new Error("같은 종목에 다른 미체결 주문이 있습니다.");
    if (
      !s.orders.length &&
      (!Number.isFinite(snap.buyingPower) || snap.buyingPower < s.initialCash)
    )
      throw new Error("실제 주문 가능 금액이 배정 자금보다 적습니다.");
    const r = await db.splitLiveStrategy.updateMany({
      where: {
        id,
        status: "paused",
        revision: s.revision,
        leaseToken: token,
        leaseUntil: { gt: deps.now() },
      },
      data: {
        status: s.reservation?.status === "waiting" ? "reserved" : "active",
        note: s.reservation?.status === "waiting" ? "예약 가격 감시 시작 대기" : "자동 감시 시작 대기",
        revision: { increment: 1 },
      },
    });
    if (!r.count)
      throw new Error("전략 상태가 변경됐거나 시작 처리 시간이 초과됐습니다.");
  } catch (error) {
    if (addedOwner)
      await db.splitSymbolOwner.deleteMany({ where: { strategyId: id } });
    throw error;
  } finally {
    await release(db, id, token);
  }
}

function verifyOrder(
  s: SplitLiveStrategy,
  o: SplitLiveOrder,
  b: BrokerOrder,
  recovery = false,
) {
  if (!b || !known.includes(b.status))
    throw new Error(
      "알 수 없는 주문 상태 또는 정정된 주문입니다. 토스에서 대조하세요.",
    );
  if (
    b.symbol !== s.symbol ||
    b.side !== o.side ||
    b.quantity !== o.quantity ||
    b.price !== o.price ||
    b.currency !== (s.market === "KR" ? "KRW" : "USD")
  )
    throw new Error(
      "브로커 주문과 계좌 장부의 종목·방향·수량·가격·통화가 다릅니다.",
    );
  if (!recovery && b.orderId !== o.tossOrderId)
    throw new Error("주문번호가 일치하지 않습니다.");
  if (recovery) {
    const time = Date.parse(b.orderedAt),
      created = o.createdAt.getTime();
    if (
      !Number.isFinite(time) ||
      time < created - 60000 ||
      time > created + 300000
    )
      throw new Error("주문 생성 시각이 일치하지 않습니다.");
  }
  if (b.status === "FILLED" && b.filledQty !== o.quantity)
    throw new Error("전량 체결 수량이 일치하지 않습니다.");
  if (
    b.filledQty > 0 &&
    b.filledAmount !== null &&
    (o.side === "BUY"
      ? b.filledAmount > roundMoney(o.price * b.filledQty) + 0.0001
      : b.filledAmount < roundMoney(o.price * b.filledQty) - 0.0001)
  )
    throw new Error("지정가와 실제 체결 금액이 일치하지 않습니다.");
}

async function applyOrder(
  db: PrismaClient,
  s: SplitLiveStrategy,
  o: SplitLiveOrder,
  b: BrokerOrder,
  now: Date,
) {
  verifyOrder(s, o, b);
  await db.$transaction(async (tx) => {
    const current = await tx.splitLiveOrder.findUniqueOrThrow({
      where: { id: o.id },
    });
    const delta = validateExecution(
      current.quantity,
      orderPrevious(current),
      b,
    );
    const lot = await tx.splitLiveLot.findUniqueOrThrow({
      where: { id: o.lotId },
    });
    if (o.side === "SELL" && lot.soldQty + delta.qty > lot.boughtQty)
      throw new Error("차수 잔량을 초과한 매도 체결입니다.");
    await tx.splitLiveLot.update({
      where: { id: o.lotId },
      data:
        o.side === "BUY"
          ? {
              boughtQty: lot.boughtQty + delta.qty,
              boughtAmount: roundMoney(lot.boughtAmount + delta.amount),
              buyFees: roundMoney(lot.buyFees + delta.fees),
              buyTax: roundMoney(lot.buyTax + delta.tax),
            }
          : {
              soldQty: lot.soldQty + delta.qty,
              soldAmount: roundMoney(lot.soldAmount + delta.amount),
              sellFees: roundMoney(lot.sellFees + delta.fees),
              sellTax: roundMoney(lot.sellTax + delta.tax),
            },
    });
    const account = await tx.splitLiveStrategy.findUniqueOrThrow({
      where: { id: s.id },
    });
    const cash = roundMoney(
      account.cash +
        (o.side === "BUY"
          ? -delta.amount - delta.fees - delta.tax
          : delta.amount - delta.fees - delta.tax),
    );
    await tx.splitLiveStrategy.update({
      where: { id: s.id },
      data: {
        cash,
        revision: { increment: 1 },
        ...(cash < 0
          ? { status: "paused", note: "실제 비용이 배정 잔액을 초과했습니다." }
          : {}),
      },
    });
    const closed = ["FILLED", "CANCELED", "REJECTED"].includes(b.status);
    await tx.splitLiveOrder.update({
      where: { id: o.id },
      data: {
        filledQty: b.filledQty,
        filledAmount: b.filledAmount ?? 0,
        commission: b.commission ?? 0,
        tax: b.tax ?? 0,
        brokerStatus: b.status,
        status: closed ? "closed" : "submitted",
        error: null,
        lastSyncedAt: now,
      },
    });
    const reservation = await tx.splitBuyReservation.findUnique({ where: { strategyId: s.id } });
    if (reservation?.orderId === o.id && reservation.status !== "executed") {
      if (b.filledQty > 0) {
        await transitionReservation(tx, s.id, "executed", "1차 매수 체결 확인 — 기존 분할매매로 이어갑니다.", now, o.id);
        await tx.splitLiveStrategy.updateMany({ where: { id: s.id, status: "reserved" }, data: { status: "active" } });
      } else if (closed) {
        const note = "예약 매수 주문이 체결 없이 종료됐습니다. 예약 조건을 다시 저장한 뒤 재개하세요.";
        await transitionReservation(tx, s.id, "failed", note, now, o.id);
        await tx.splitLiveStrategy.update({ where: { id: s.id }, data: { status: "paused", note, revision: { increment: 1 } } });
      }
    }
    if (b.status === "REJECTED")
      await tx.splitLiveStrategy.update({
        where: { id: s.id },
        data: {
          status: "paused",
          note: "브로커가 주문을 거절했습니다. 주문 이력을 확인하세요.",
        },
      });
  });
}

export async function runLiveStrategy(
  db: PrismaClient,
  deps: LiveDeps,
  id: string,
  syncOnly = false,
) {
  let token: string;
  try {
    token = await acquire(db, id, deps.now());
  } catch {
    return { placed: 0, note: "다른 실행 진행 중" };
  }
  try {
    const s = await db.splitLiveStrategy.findUniqueOrThrow({
      where: { id },
      include: { lots: true, reservation: true },
    });
    await db.splitLiveStrategy.update({
      where: { id },
      data: { lastCheckedAt: deps.now() },
    });
    if (s.reservation?.status === "waiting" && s.reservation.expiresAt <= deps.now()) {
      await db.$transaction(async (tx) => {
        await transitionReservation(tx, id, "expired", "감시 유효기간 만료 — 신규 매수하지 않습니다.", deps.now());
        await tx.splitLiveStrategy.update({ where: { id }, data: { status: "paused", note: "예약 매수 감시 기간 만료", revision: { increment: 1 } } });
      });
      return { placed: 0, note: "감시 기간 만료" };
    }
    const pending = await db.splitLiveOrder.findMany({
      where: { strategyId: id, status: { in: unresolved } },
      orderBy: { sequence: "asc" },
    });
    const recent = await db.splitLiveOrder.findMany({
      where: { strategyId: id, status: "closed", tossOrderId: { not: null } },
      orderBy: [{ lastSyncedAt: "asc" }, { sequence: "asc" }],
      take: 3,
    });
    for (const o of [...pending, ...recent]) {
      if (!o.tossOrderId) {
        await pause(
          db,
          id,
          "주문 접수 결과 미확인 — 자동 재전송하지 않습니다. 토스에서 대조하세요.",
        );
        return { placed: 0, note: "접수 미확인" };
      }
      const detail = await deps.detail(s.accountSeq, o.tossOrderId);
      try {
        await applyOrder(db, s, o, detail, deps.now());
      } catch (error) {
        await db.splitLiveOrder.update({
          where: { id: o.id },
          data: {
            status: message(error).includes("미확정")
              ? "cost_pending"
              : "blocked",
            error: message(error),
          },
        });
        await pause(db, id, message(error));
        return { placed: 0, note: message(error) };
      }
    }
    if (
      await db.splitLiveOrder.count({
        where: { strategyId: id, status: { in: unresolved } },
      })
    )
      return { placed: 0, note: "미체결·미확정 주문 대기" };
    const current = await db.splitLiveStrategy.findUniqueOrThrow({
      where: { id },
      include: { lots: true, reservation: true },
    });
    if (syncOnly || !["active", "reserved"].includes(current.status) || deps.killed())
      return { placed: 0, note: "신규 주문 중지" };
    if (
      s.lots.some((l) => lotTotals(l).remainingQty > 0) &&
      current.lots.every((l) => lotTotals(l).remainingQty === 0)
    ) {
      // Keep cash, historical lots and ownership. The next poll creates a new
      // slot-1 generation after the usual quote/account/order checks.
      const note = "전량 익절 정산 완료 — 다음 감시에 같은 설정으로 1차 재매수";
      await db.splitLiveStrategy.updateMany({
        where: { id, status: "active", revision: current.revision, leaseToken: token },
        data: { note },
      });
      return { placed: 0, note };
    }
    const reservation = current.reservation;
    if (reservation && !["waiting", "executed"].includes(reservation.status))
      return { placed: 0, note: "예약 매수 실행·실패 내역을 확인하세요." };
    const reserving = reservation?.status === "waiting";
    const owner = await db.splitSymbolOwner.findUnique({
      where: { strategyId: id },
    });
    if (
      !owner ||
      owner.accountSeq !== current.accountSeq ||
      owner.symbol !== current.symbol
    ) {
      await pause(db, id, "계좌·종목 소유권이 없습니다.");
      return { placed: 0, note: "소유권 불일치" };
    }
    const snap = await deps.snapshot(current);
    if (snap.conflict) {
      await pause(db, id, snap.conflict);
      return { placed: 0, note: snap.conflict };
    }
    if (
      !snap.isOpen ||
      !snap.sessionEndsAt ||
      !Number.isFinite(snap.sessionEndsAt.getTime()) ||
      deps.now() >= snap.sessionEndsAt
    ) {
      const note = current.market === "KR"
        ? "거래 시간 대기 — 정규장 또는 NXT 지원·거래 가능 종목의 애프터마켓"
        : "정규장 대기";
      await db.splitLiveStrategy.update({
        where: { id },
        data: { note },
      });
      return { placed: 0, note };
    }
    const age = deps.now().getTime() - snap.observedAt.getTime();
    if (!Number.isFinite(age) || age > 60000 || age < -1000)
      throw new Error("최근 60초 이내 시세가 아닙니다.");
    if (
      snap.holdingQty !==
      current.lots.reduce((sum, l) => sum + lotTotals(l).remainingQty, 0)
    ) {
      await pause(db, id, "실보유와 장부 잔량 불일치");
      return { placed: 0, note: "잔량 불일치" };
    }
    if (snap.openOrderIds.length) {
      await pause(db, id, "같은 종목에 외부 미체결 주문이 있습니다.");
      return { placed: 0, note: "외부 주문" };
    }
    if (reserving) {
      if (!Number.isFinite(snap.price) || snap.price <= 0) throw new Error("유효한 감시 시세가 아닙니다.");
      if (current.lots.some(l => l.boughtQty > 0)) throw new Error("예약 매수는 신규 1차 진입에만 사용할 수 있습니다.");
      if (snap.price > reservation.watchPrice) {
        await db.splitLiveStrategy.update({ where: { id }, data: { lastPrice: snap.price, note: `예약 매수 감시 중 — ${reservation.watchPrice} 이하 대기` } });
        return { placed: 0, note: "예약 가격 미도달" };
      }
    }
    const config = {
      ...current,
      tranches: parseTranches(current.trancheSettingsJson, current.maxTranches, current.market),
      market: current.market as "KR" | "US",
      tickSize: snap.tickSize,
    };
    const plan = planLiveOrder(config, current.lots, snap.price, current.cash);
    await db.splitLiveStrategy.update({
      where: { id },
      data: {
        lastPrice: snap.price,
        note: plan ? "주문 전 확인" : "매매 조건 미충족",
      },
    });
    if (!plan) {
      if (reserving) throw new Error("예약 가격에 도달했지만 1주를 매수할 차수 예산·잔액이 부족합니다.");
      return { placed: 0, note: "조건 미충족" };
    }
    if (
      !Number.isFinite(snap.buyingPower) ||
      !Number.isFinite(snap.sellableQty)
    )
      throw new Error("주문 가능 금액·수량을 확인할 수 없습니다.");
    if (
      plan.side === "BUY" &&
      plan.price * plan.quantity * (1 + current.feeBufferPct / 100) >
        Math.min(current.cash, snap.buyingPower) + 0.0001
    )
      throw new Error("실제 주문 가능 금액 또는 배정 잔액 부족");
    if (plan.side === "SELL" && snap.sellableQty < plan.quantity)
      throw new Error("실제 매도 가능 수량 부족");
    if (deps.killed()) return { placed: 0, note: "신규 주문 중지" };
    const order = await db.$transaction(async (tx) => {
      const claimed = await tx.splitLiveStrategy.updateMany({
        where: {
          id,
          status: current.status,
          revision: current.revision,
          leaseToken: token,
          leaseUntil: { gt: deps.now() },
        },
        data: { revision: { increment: 1 } },
      });
      if (!claimed.count)
        throw new Error("전략 상태가 변경되어 주문하지 않았습니다.");
      const last = await tx.splitLiveOrder.findFirst({
        where: { strategyId: id },
        orderBy: { sequence: "desc" },
      });
      const lotId =
        plan.lotId ??
        (
          await tx.splitLiveLot.create({
            data: {
              strategyId: id,
              slot: plan.slot,
              generation: plan.generation,
            },
          })
        ).id;
      if (reserving && reservation.expiresAt <= deps.now()) throw new Error("주문 전 예약 매수 유효기간이 만료됐습니다.");
      const created = await tx.splitLiveOrder.create({
        data: {
          strategyId: id,
          lotId,
          sequence: (last?.sequence ?? 0) + 1,
          clientOrderId: randomUUID().replaceAll("-", ""),
          side: plan.side,
          quantity: plan.quantity,
          price: plan.price,
          createdAt: deps.now(),
        },
      });
      if (reserving) await transitionReservation(tx, id, "ordering", "감시 가격 도달 — 1차 매수 주문 생성, 체결 확인 중", deps.now(), created.id);
      return created;
    });
    try {
      const deadline = new Date(
        Math.min(
          snap.sessionEndsAt.getTime(),
          snap.observedAt.getTime() + 60000,
          current.leaseUntil?.getTime() ?? 0,
          reserving ? reservation.expiresAt.getTime() : Infinity,
        ),
      );
      const result = await deps.submit(current, order, deadline);
      if (!result.orderId) throw new Error("주문번호 응답 없음");
      await db.splitLiveOrder.update({
        where: { id: order.id },
        data: { tossOrderId: result.orderId, status: "submitted" },
      });
      await db.splitLiveStrategy.update({
        where: { id },
        data: {
          note: `${plan.slot}차 ${plan.side === "BUY" ? "매수" : "매도"} 주문 접수 — 체결 대기`,
        },
      });
      return { placed: 1, note: "접수" };
    } catch (error) {
      const definite =
        error instanceof Error &&
        error.name === "TossApiError" &&
        [400, 422].includes((error as Error & { status: number }).status);
      await db.splitLiveOrder.update({
        where: { id: order.id },
        data: {
          status: definite ? "rejected" : "submit_unknown",
          error: message(error),
        },
      });
      await pause(
        db,
        id,
        definite
          ? `주문 거절: ${message(error)}`
          : `접수 결과 미확인: ${message(error)}`,
      );
      return { placed: 0, note: message(error) };
    }
  } catch (error) {
    const reservation = await db.splitBuyReservation.findUnique({ where: { strategyId: id } });
    if (reservation && ["waiting", "ordering"].includes(reservation.status)) await pause(db, id, message(error));
    else await db.splitLiveStrategy.update({ where: { id }, data: { note: message(error) } });
    return { placed: 0, note: message(error), error: true };
  } finally {
    await release(db, id, token);
  }
}

export async function finishEmptyLiveStrategy(
  db: PrismaClient,
  deps: LiveDeps,
  id: string,
) {
  const token = await acquire(db, id, deps.now());
  try {
    await db.$transaction(async (tx) => {
      const s = await tx.splitLiveStrategy.findUniqueOrThrow({
        where: { id },
        include: { lots: true, orders: true, reservation: true },
      });
      if (
        ["active", "reserved"].includes(s.status) ||
        s.lots.some((l) => lotTotals(l).remainingQty !== 0) ||
        s.orders.some((o) => unresolved.includes(o.status))
      )
        throw new Error(
          "일시정지 후 보유·미해결 주문이 없어야 종료할 수 있습니다.",
        );
      await tx.splitLiveStrategy.update({
        where: { id },
        data: { status: "completed", note: "빈 장부 종료" },
      });
      if (s.reservation?.status === "waiting") await transitionReservation(tx, id, "cancelled", "사용자가 감시 전략을 종료했습니다.", deps.now());
      await tx.splitSymbolOwner.deleteMany({ where: { strategyId: id } });
    });
  } finally {
    await release(db, id, token);
  }
}

export async function recoverLiveOrder(
  db: PrismaClient,
  deps: LiveDeps,
  orderId: string,
  input: { brokerId?: string; confirmNotCreated?: boolean },
) {
  const original = await db.splitLiveOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { strategy: true },
  });
  const token = await acquire(db, original.strategyId, deps.now());
  try {
    const o = await db.splitLiveOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { strategy: true },
    });
    if (
      ["active", "reserved"].includes(o.strategy.status) ||
      !["submitting", "submit_unknown", "blocked"].includes(o.status)
    )
      throw new Error("일시정지한 미확인 주문만 대조할 수 있습니다.");
    if (input.brokerId) {
      if (typeof input.brokerId !== "string" || input.brokerId.length > 256)
        throw new Error("주문번호를 확인하세요.");
      const detail = await deps.detail(o.strategy.accountSeq, input.brokerId);
      verifyOrder(o.strategy, o, detail, true);
      await db.splitLiveOrder.update({
        where: { id: orderId },
        data: {
          tossOrderId: detail.orderId,
          status: "submitted",
          error: "사용자 주문번호 대조 완료",
        },
      });
    } else {
      if (!input.confirmNotCreated || o.tossOrderId)
        throw new Error("토스에서 미접수를 확인한 주문만 해제할 수 있습니다.");
      await db.splitLiveOrder.update({
        where: { id: orderId },
        data: {
          status: "not_created",
          error: "사용자가 토스에서 미접수 확인 — 자동 재전송하지 않음",
        },
      });
    }
  } finally {
    await release(db, original.strategyId, token);
  }
}
