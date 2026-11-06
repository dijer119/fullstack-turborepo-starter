"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAccounts, isTossConfigured } from "@/lib/toss/client";
import {
  createLiveStrategy,
  startLiveStrategy,
  runLiveStrategy,
  recoverLiveOrder,
  finishEmptyLiveStrategy,
  updateFirstTakeProfitPct,
  updateLiveTranches,
  updateLiveCapital,
  updateReentryDrop,
  updateLiveReservation,
  type CreateLiveInput,
} from "@/lib/split/live-run";
import { tossLiveDeps } from "@/lib/split/live-toss";
import { lotTotals } from "@/lib/split/live-rules";
import { roundMoney } from "@/lib/split/engine";
import { parseTranches } from "@/lib/split/tranche-settings";
import type { TrancheSetting } from "@/lib/split/budget";
import type { ReservationInput } from "@/lib/split/reservation";

import { pendingOrderStatuses } from "@/lib/split/strategy-tranches";

const page = "/stocks/split";
async function action(work: () => Promise<unknown>, success: string) {
  try {
    await work();
    revalidatePath(page, "layout");
    return { ok: true, message: success };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "실거래 장부 처리 실패",
    };
  }
}

export async function getSplitLiveAvailability() {
  return { configured: isTossConfigured(), disabled: process.env.SPLIT_LIVE_DISABLED === "1" };
}

export async function listSplitLive(id?: string, includeOrders = true) {
  const rows = await db.splitLiveStrategy.findMany({
    where: id === undefined ? undefined : { id },
    orderBy: { createdAt: "desc" },
    include: {
      reservation: true,
      _count: { select: { orders: { where: { side: "SELL", filledQty: { gt: 0 } } } } },
      lots: { orderBy: [{ slot: "asc" }, { generation: "asc" }], include: { _count: { select: { orders: { where: { status: { in: pendingOrderStatuses } } } } } } },
      orders: includeOrders
        ? { orderBy: { sequence: "desc" }, take: 20 }
        : { orderBy: { sequence: "desc" }, where: { status: { in: pendingOrderStatuses } } },
    },
  });
  return {
    ...await getSplitLiveAvailability(),
    loadedAt: Date.now(),
    strategies: rows.map((s) => {
      const lots = s.lots.map(({ _count, ...l }) => ({ ...l, ...lotTotals(l), pendingOrderCount: _count.orders }));
      const holdingQty = lots.reduce((sum, l) => sum + l.remainingQty, 0);
      const marketValue =
        s.lastPrice === null ? null : roundMoney(holdingQty * s.lastPrice);
      const equity =
        marketValue === null ? null : roundMoney(s.cash + marketValue);
      return {
        id: s.id,
        reservation: s.reservation ? { ...s.reservation, expiresAt: s.reservation.expiresAt.toISOString(), createdAt: s.reservation.createdAt.toISOString(), updatedAt: s.reservation.updatedAt.toISOString() } : null,
        name: s.name,
        symbol: s.symbol,
        market: s.market,
        accountSeq: s.accountSeq,
        initialCash: s.initialCash,
        cash: s.cash,
        trancheBudget: s.trancheBudget,
        budgetMode: s.budgetMode,
        budgetMultiplier: s.budgetMultiplier,
        maxTranches: s.maxTranches,
        buyDropPct: s.buyDropPct,
        takeProfitPct: s.takeProfitPct,
        firstTakeProfitPct: s.firstTakeProfitPct,
        tranches: parseTranches(s.trancheSettingsJson, s.maxTranches, s.market),
        feeBufferPct: s.feeBufferPct,
        status: s.status,
        note: s.note,
        lastCheckedAt: s.lastCheckedAt?.toISOString() ?? null,
        lastPrice: s.lastPrice,
        reentryDropPct: s.reentryDropPct,
        holdingQty,
        sellCount: s._count.orders,
        marketValue,
        equity,
        totalPnl: equity === null ? null : roundMoney(equity - s.initialCash),
        realizedPnl: roundMoney(
          lots.reduce((sum, l) => sum + l.realizedPnl, 0),
        ),
        lots,
        orders: s.orders.map((o) => ({
          ...o,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
          lastSyncedAt: o.lastSyncedAt?.toISOString() ?? null,
        })),
      };
    }),
  };
}

export async function loadSplitAccounts() {
  try {
    const accounts = await getAccounts();
    return {
      ok: true as const,
      accounts: accounts
        .filter((a) => a.accountType === "BROKERAGE")
        .map((a) => ({
          accountSeq: a.accountSeq,
          label: `계좌 ${a.accountSeq} · 끝 ${a.accountNo.slice(-4)}`,
        })),
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "계좌 조회 실패",
    };
  }
}
export async function updateSplitFirstTakeProfit(id: string, value: number) {
  return action(() => updateFirstTakeProfitPct(db, id, value), "1차 익절률을 저장했습니다. 재개 후 주문 판단에 적용됩니다.");
}
export async function updateSplitTranches(id: string, tranches: TrancheSetting[]) {
  return action(() => updateLiveTranches(db, id, tranches), "차수별 설정을 저장했습니다. 다음 신규 주문 판단부터 적용됩니다. 일시정지 상태라면 재개 후 적용됩니다.");
}
export async function updateSplitCapital(id: string, value: number, expectedCapital: number) {
  return action(() => updateLiveCapital(db, id, value, expectedCapital), "배정 자금과 전략 잔액을 변경했습니다. 차수별 설정도 확인한 뒤 저장하세요.");
}
export async function updateSplitReentry(id: string, value: number | null) {
  return action(() => updateReentryDrop(db, id, value), "1차 재매수 조건을 저장했습니다.");
}
export async function updateSplitReservation(id: string, input: ReservationInput) {
  return action(() => updateLiveReservation(db, id, input), "예약 조건을 저장했습니다. 설정을 확인한 뒤 감시를 시작하세요.");
}
export async function createSplitLive(input: CreateLiveInput) {
  let id: string | undefined;
  const result = await action(async () => {
    const accounts = await getAccounts();
    if (
      !accounts.some(
        (a) =>
          a.accountSeq === input.accountSeq && a.accountType === "BROKERAGE",
      )
    )
      throw new Error("접근 가능한 일반 위탁계좌를 선택하세요.");
    id = (await createLiveStrategy(db, input)).id;
  }, "정지 상태의 실거래 전략을 만들었습니다. 시작 전 설정을 확인하세요.");
  return { ...result, id: result.ok ? id : undefined };
}
export async function startSplitLive(id: string, confirmSymbol: string) {
  return action(async () => {
    const s = await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } });
    if (confirmSymbol !== s.symbol)
      throw new Error("실거래 시작 확인이 필요합니다.");
    await startLiveStrategy(db, tossLiveDeps(db), id);
  }, "자동매매를 시작했습니다. 워커가 정규장에 조건을 감시합니다.");
}
export async function pauseSplitLive(id: string) {
  return action(async () => {
    await db.splitLiveStrategy.updateMany({
      where: { id, status: { in: ["active", "reserved", "paused"] } },
      data: {
        status: "paused",
        revision: { increment: 1 },
        note: "신규 주문 일시정지. 이미 제출된 주문은 체결될 수 있습니다.",
      },
    });
  }, "신규 주문을 일시정지했습니다. 미체결 취소는 토스 앱에서 처리하세요.");
}
export async function syncSplitLive(id: string) {
  return action(async () => {
    const result = await runLiveStrategy(db, tossLiveDeps(db), id, true);
    if ("error" in result && result.error) throw new Error(result.note);
  }, "주문 상태 동기화를 마쳤습니다. 장부의 보류 사유도 확인하세요.");
}
export async function recoverSplitLive(
  orderId: string,
  input: { brokerId?: string; confirmNotCreated?: boolean },
) {
  return action(
    () => recoverLiveOrder(db, tossLiveDeps(db), orderId, input),
    "주문 대조 내용을 저장했습니다. 상태 동기화 후 장부를 확인하고 재개하세요.",
  );
}
export async function finishSplitLive(id: string) {
  return action(
    () => finishEmptyLiveStrategy(db, tossLiveDeps(db), id),
    "보유와 미해결 주문이 없는 전략을 종료했습니다.",
  );
}
