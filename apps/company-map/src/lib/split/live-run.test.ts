import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma-clients/company-map";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertSymbolOwnership } from "@/lib/toss/order-ownership";
import { splitLiveTick } from "./live-tick";
import { firstBuyReentryPrice, lotTotals } from "./live-rules";
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
  type LiveDeps,
  type BrokerOrder,
} from "./live-run";

let db: PrismaClient, folder: string;
const cfg = {
  name: "LIVE test",
  symbol: "AAPL",
  market: "US" as const,
  accountSeq: 42,
  initialCash: 300,
  trancheBudget: 100,
  maxTranches: 3,
  buyDropPct: 10,
  takeProfitPct: 10,
  feeBufferPct: 0,
};
const now = new Date("2026-10-30T01:00:00Z");
let snapshot: {
  price: number;
  observedAt: Date;
  isOpen: boolean;
  sessionEndsAt: Date | null;
  holdingQty: number;
  buyingPower: number;
  sellableQty: number;
  openOrderIds: string[];
  conflict: string | null;
};
let details: Record<string, BrokerOrder>;
let deps: LiveDeps;

beforeEach(async () => {
  folder = mkdtempSync(path.join(tmpdir(), "split-live-"));
  db = new PrismaClient({
    datasources: { db: { url: `file:${path.join(folder, "test.db")}` } },
  });
  const sql = ["20261030010000_add_split_live", "20261030020000_add_split_budget_modes", "20261031000000_add_split_first_take_profit", "20261031010000_add_split_tranche_settings", "20261101000000_add_split_reservations", "20261104000000_add_split_reentry", "20261105000000_split_reentry_buy_price"]
    .map((migration) => readFileSync(path.resolve(__dirname, `../../../prisma/migrations/${migration}/migration.sql`), "utf8"))
    .join("\n");
  for (const statement of sql
    .split(/;(?!\s*END\b)/i)
    .map((s) => s.trim())
    .filter(Boolean))
    await db.$executeRawUnsafe(statement);
  snapshot = {
    price: 10,
    observedAt: now,
    isOpen: true,
    sessionEndsAt: new Date(now.getTime() + 3600000),
    holdingQty: 0,
    buyingPower: 300,
    sellableQty: 0,
    openOrderIds: [],
    conflict: null,
  };
  details = {};
  deps = {
    now: () => now,
    killed: () => false,
    snapshot: vi.fn(async () => snapshot),
    detail: vi.fn(async (_account, id) => details[id]),
    submit: vi.fn(async (_strategy, order) => ({
      orderId: `broker-${order.sequence}`,
    })),
  };
});

it("1차 실제 평균 체결가는 통화 정밀도로 내림하며 비용을 포함하지 않는다", () => {
  expect(firstBuyReentryPrice({ boughtQty: 3, boughtAmount: 100001 }, "KR")).toBe(33333);
  expect(firstBuyReentryPrice({ boughtQty: 3, boughtAmount: 1 }, "US")).toBe(0.3333);
  expect(firstBuyReentryPrice({ boughtQty: 0, boughtAmount: 0 }, "KR")).toBeNull();
});

describe("배정 자금 변경", () => {
  it("보유와 손익을 보존하면서 증액·감액하고 재요청으로 잔액을 중복 증액하지 않는다", async () => {
    const id = await started();
    await runLiveStrategy(db, deps, id);
    details["broker-1"] = filled("broker-1");
    snapshot.holdingQty = 10;
    await runLiveStrategy(db, deps, id);
    const lots = await db.splitLiveLot.findMany();
    const orders = await db.splitLiveOrder.findMany();
    const before = await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } });
    await updateLiveCapital(db, id, 550, 300, now);
    const increased = await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } });
    expect(increased).toMatchObject({ initialCash: 550, cash: 450, status: "active", leaseToken: null });
    expect(increased.cash - increased.initialCash).toBe(before.cash - before.initialCash);
    await expect(updateLiveCapital(db, id, 550, 300, now)).rejects.toThrow(/이미 변경/);
    await updateLiveCapital(db, id, 300, 550, now);
    expect(await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).toMatchObject({ cash: 200, initialCash: 300 });
    expect(await db.splitLiveLot.findMany()).toEqual(lots);
    expect(await db.splitLiveOrder.findMany()).toEqual(orders);
  });
  it("증액 후 550만원 차수별 예산을 저장하고 일시정지 상태를 보존한다", async () => {
    const s = await createLiveStrategy(db, { ...cfg, market: "KR", symbol: "005930", initialCash: 1000000, trancheBudget: 100000 });
    await updateLiveCapital(db, s.id, 5500000, 1000000, now);
    const tranches = [1000000, 1500000, 3000000].map((budget, i) => ({ budget, buyDropPct: i ? 5 : null, takeProfitPct: 5 }));
    await updateLiveTranches(db, s.id, tranches, now);
    expect(await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ initialCash: 5500000, cash: 5500000, status: "paused" });
    await expect(updateLiveCapital(db, s.id, 1000000, 5500000, now)).rejects.toThrow(/차수별/);
    await expect(updateLiveCapital(db, s.id, 5500000.5, 5500000, now)).rejects.toThrow(/정수/);
  });
  it("잘못된 금액·잔액 부족·종료 전략·다른 실행 중에는 변경하지 않는다", async () => {
    const s = await createLiveStrategy(db, { ...cfg, initialCash: 500 });
    for (const value of [NaN, Infinity, 0, -1, 1e10 + 1, 500.001])
      await expect(updateLiveCapital(db, s.id, value, 500, now)).rejects.toThrow(/배정 자금/);
    await db.splitLiveStrategy.update({ where: { id: s.id }, data: { cash: 100 } });
    await expect(updateLiveCapital(db, s.id, 300, 500, now)).rejects.toThrow(/잔액/);
    await db.splitLiveStrategy.update({ where: { id: s.id }, data: { status: "completed" } });
    await expect(updateLiveCapital(db, s.id, 600, 500, now)).rejects.toThrow(/종료/);
    await db.splitLiveStrategy.update({ where: { id: s.id }, data: { status: "paused", leaseToken: "worker", leaseUntil: new Date(now.getTime() + 10000) } });
    await expect(updateLiveCapital(db, s.id, 600, 500, now)).rejects.toThrow(/다른 실행/);
    expect(await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ initialCash: 500, cash: 100 });
  });
  it("미해결 주문은 증감액과 관계없이 변경을 막는다", async () => {
    const id = await started();
    await runLiveStrategy(db, deps, id);
    for (const status of ["submitting", "submitted", "submit_unknown", "cost_pending", "blocked"]) {
      await db.splitLiveOrder.updateMany({ data: { status } });
      await expect(updateLiveCapital(db, id, 500, 300, now)).rejects.toThrow(/미체결/);
    }
    expect(await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).toMatchObject({ initialCash: 300, cash: 300 });
  });
  it("읽은 뒤 일시정지·revision 변경이 발생하면 자금을 덮어쓰지 않는다", async () => {
    const s = await createLiveStrategy(db, cfg);
    const concurrentDb = db.$extends({ query: { splitLiveStrategy: {
      async findUniqueOrThrow({ args, query }) {
        const result = await query(args);
        await db.splitLiveStrategy.update({ where: { id: s.id }, data: { status: "paused", revision: { increment: 1 } } });
        return result;
      },
    } } });
    await expect(updateLiveCapital(concurrentDb as unknown as PrismaClient, s.id, 500, 300, now)).rejects.toThrow(/상태가 변경/);
    expect(await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ initialCash: 300, cash: 300, leaseToken: null });
  });
});

describe("예약 매수", () => {
  const reserve = (watchPrice = 10) => createLiveStrategy(db, { ...cfg, reservation: { watchPrice, expiresOn: "2026-10-30" } }, now);
  it("1차 체결 후 만료일과 최초 감시가에 관계없이 2차 매수로 이어진다", async () => {
    const s = await reserve();
    await startLiveStrategy(db, deps, s.id);
    await runLiveStrategy(db, deps, s.id);
    expect((await db.splitBuyReservation.findUniqueOrThrow({ where: { strategyId: s.id } })).status).toBe("ordering");
    details["broker-1"] = filled("broker-1");
    const later = new Date("2026-10-31T01:00:00Z");
    deps.now = () => later;
    snapshot.observedAt = later; snapshot.sessionEndsAt = new Date(later.getTime() + 3600000);
    snapshot.holdingQty = 10; snapshot.sellableQty = 10; snapshot.price = 9;
    await runLiveStrategy(db, deps, s.id);
    expect(await db.splitLiveOrder.findFirstOrThrow({ where: { sequence: 2 }, include: { lot: true } })).toMatchObject({ side: "BUY", lot: { slot: 2 } });
    expect((await db.splitBuyReservation.findUniqueOrThrow({ where: { strategyId: s.id } })).status).toBe("executed");
    expect(await db.splitReservationEvent.count({ where: { type: "executed" } })).toBe(1);
  });
  it("한국시간 유효일 다음날 0시에 정지 중인 감시도 만료시키고 재개를 막는다", async () => {
    const s = await reserve();
    const r = await db.splitBuyReservation.findUniqueOrThrow({ where: { strategyId: s.id } });
    expect(r.expiresAt.toISOString()).toBe("2026-10-30T15:00:00.000Z");
    deps.now = () => r.expiresAt;
    await splitLiveTick(db, deps);
    expect((await db.splitBuyReservation.findUniqueOrThrow({ where: { strategyId: s.id } })).status).toBe("expired");
    expect(deps.submit).not.toHaveBeenCalled();
    await expect(startLiveStrategy(db, deps, s.id)).rejects.toThrow(/예약/);
  });
  it("감시 시세 조회 중 만료되면 주문 의도도 남기지 않는다", async () => {
    const s = await reserve();
    await startLiveStrategy(db, deps, s.id);
    const end = new Date("2026-10-30T15:00:00Z");
    deps.snapshot = async () => { deps.now = () => end; return { ...snapshot, observedAt: end, sessionEndsAt: new Date(end.getTime() + 3600000) }; };
    await runLiveStrategy(db, deps, s.id);
    expect(await db.splitLiveOrder.count()).toBe(0);
    expect(deps.submit).not.toHaveBeenCalled();
  });
  it("부분 체결과 접수 상태 반복 조회는 실행 기록을 중복하지 않는다", async () => {
    const s = await reserve(); await startLiveStrategy(db, deps, s.id); await runLiveStrategy(db, deps, s.id);
    details["broker-1"] = filled("broker-1", 4, 40);
    snapshot.holdingQty = 4;
    await runLiveStrategy(db, deps, s.id); await runLiveStrategy(db, deps, s.id);
    expect(deps.submit).toHaveBeenCalledTimes(1);
    expect(await db.splitReservationEvent.count({ where: { type: "executed" } })).toBe(1);
  });
  it("lease가 유효해도 주문 직전 감시 만료이면 의도와 주문을 생성하지 않는다", async () => {
    const s = await reserve();
    await startLiveStrategy(db, deps, s.id);
    const end = new Date("2026-10-30T15:00:00Z");
    deps.now = () => new Date(end.getTime() - 30000);
    deps.snapshot = async () => { deps.now = () => end; return { ...snapshot, observedAt: end, sessionEndsAt: new Date(end.getTime() + 3600000) }; };
    const result = await runLiveStrategy(db, deps, s.id);
    expect(result.note).toMatch(/유효기간이 만료/);
    expect(await db.splitLiveOrder.count()).toBe(0);
    expect(deps.submit).not.toHaveBeenCalled();
  });
  it("예약 만료 시각을 HTTP 전송 유효시각에 전달하고 시작은 reserved로 저장한다", async () => {
    const s = await reserve(); await startLiveStrategy(db, deps, s.id);
    expect((await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("reserved");
    await expect(assertSymbolOwnership(db, cfg.accountSeq, cfg.symbol, s.id)).resolves.toBeUndefined();
    const end = new Date("2026-10-30T15:00:00Z");
    const before = new Date(end.getTime() - 30000);
    deps.now = () => before; snapshot.observedAt = before; snapshot.sessionEndsAt = new Date(end.getTime() + 3600000);
    await runLiveStrategy(db, deps, s.id);
    expect(vi.mocked(deps.submit).mock.calls[0][2]).toEqual(end);
  });
  it("접수 미확인은 실패 기록을 남기며 재개·수정·재전송을 막고 대조 후 체결을 반영한다", async () => {
    const s = await reserve(); await startLiveStrategy(db, deps, s.id);
    deps.submit = vi.fn(async () => { throw new Error("network timeout"); });
    await runLiveStrategy(db, deps, s.id);
    const order = await db.splitLiveOrder.findFirstOrThrow();
    expect(order.status).toBe("submit_unknown");
    expect(await db.splitReservationEvent.count({ where: { type: "failed" } })).toBe(1);
    await expect(startLiveStrategy(db, deps, s.id)).rejects.toThrow(/예약/);
    await expect(updateLiveReservation(db, s.id, { watchPrice: 10, expiresOn: "2026-10-31" }, now)).rejects.toThrow(/미체결/);
    await runLiveStrategy(db, deps, s.id);
    expect(deps.submit).toHaveBeenCalledTimes(1);
    details["broker-1"] = filled("broker-1");
    await recoverLiveOrder(db, deps, order.id, { brokerId: "broker-1" });
    await runLiveStrategy(db, deps, s.id, true);
    expect((await db.splitBuyReservation.findUniqueOrThrow({ where: { strategyId: s.id } })).status).toBe("executed");
  });
  it("체결 없이 취소된 주문은 자동 재시도하지 않고 조건 재저장 후에만 재개한다", async () => {
    const s = await reserve(); await startLiveStrategy(db, deps, s.id); await runLiveStrategy(db, deps, s.id);
    details["broker-1"] = { ...filled("broker-1", 0, 0), status: "CANCELED" };
    await runLiveStrategy(db, deps, s.id);
    expect((await db.splitBuyReservation.findUniqueOrThrow({ where: { strategyId: s.id } })).status).toBe("failed");
    expect(deps.submit).toHaveBeenCalledTimes(1);
    await updateLiveReservation(db, s.id, { watchPrice: 9, expiresOn: "2026-10-31" }, now);
    await startLiveStrategy(db, deps, s.id); await runLiveStrategy(db, deps, s.id);
    expect(deps.submit).toHaveBeenCalledTimes(1);
    snapshot.price = 9; await runLiveStrategy(db, deps, s.id);
    expect(deps.submit).toHaveBeenCalledTimes(2);
  });
  it("조건 도달 후 예산 부족은 실패 내역으로 보존한다", async () => {
    const s = await reserve(); await startLiveStrategy(db, deps, s.id);
    snapshot.buyingPower = 0;
    await runLiveStrategy(db, deps, s.id);
    expect((await db.splitReservationEvent.findFirstOrThrow({ where: { type: "failed" } })).message).toMatch(/금액|잔액/);
    expect(deps.submit).not.toHaveBeenCalled();
  });
  it.each([{ watchPrice: 0, expiresOn: "2026-10-30" }, { watchPrice: NaN, expiresOn: "2026-10-30" }, { watchPrice: 10, expiresOn: "2026-02-30" }, { watchPrice: 10, expiresOn: "2026-10-29" }])("잘못된 예약 조건은 전략도 만들지 않는다: %j", async reservation => {
    await expect(createLiveStrategy(db, { ...cfg, reservation }, now)).rejects.toThrow(/감시/);
    expect(await db.splitLiveStrategy.count()).toBe(0);
  });
  it("감시가보다 높으면 주문하지 않고 도달 시 한 번만 1차 주문한다", async () => {
    const s = await createLiveStrategy(db, { ...cfg, reservation: { watchPrice: 9, expiresOn: "2026-10-30" } }, now);
    await startLiveStrategy(db, deps, s.id);
    await runLiveStrategy(db, deps, s.id);
    expect(deps.submit).not.toHaveBeenCalled();
    snapshot.price = 9;
    await runLiveStrategy(db, deps, s.id);
    expect(deps.submit).toHaveBeenCalledTimes(1);
  });
});

describe("브로커 불일치와 수동 종료", () => {
  it("개별 설정을 저장·수정하고 워커가 해당 차수의 금액과 기준으로 주문한다", async () => {
    const tranches = [
      { budget: 100, buyDropPct: null, takeProfitPct: 15 },
      { budget: 160, buyDropPct: 20, takeProfitPct: 5 },
      { budget: 40, buyDropPct: 25, takeProfitPct: 7 },
    ];
    const s = await createLiveStrategy(db, { ...cfg, tranches });
    expect(JSON.parse(s.trancheSettingsJson!)).toEqual(tranches);
    await updateLiveTranches(db, s.id, tranches.map((r, i) => ({ ...r, takeProfitPct: i === 0 ? 12 : r.takeProfitPct })), now);
    await db.$disconnect();
    expect((await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } })).firstTakeProfitPct).toBe(12);
    await startLiveStrategy(db, deps, s.id);
    await runLiveStrategy(db, deps, s.id);
    details["broker-1"] = filled("broker-1");
    snapshot.holdingQty = 10; snapshot.sellableQty = 10; snapshot.price = 9;
    await runLiveStrategy(db, deps, s.id);
    expect(await db.splitLiveOrder.count()).toBe(1);
    snapshot.price = 8;
    await runLiveStrategy(db, deps, s.id);
    expect(await db.splitLiveOrder.findFirstOrThrow({ where: { sequence: 2 }, include: { lot: true } })).toMatchObject({ quantity: 20, price: 8, lot: { slot: 2 } });
    details["broker-2"] = { ...filled("broker-2", 20, 160), quantity: 20, price: 8, status: "FILLED" };
    snapshot.holdingQty = 30; snapshot.sellableQty = 30; snapshot.price = 8.4;
    await runLiveStrategy(db, deps, s.id);
    expect(await db.splitLiveOrder.findFirstOrThrow({ where: { sequence: 3 }, include: { lot: true } })).toMatchObject({ side: "SELL", quantity: 20, price: 8.4, lot: { slot: 2 } });
  });
  it("차수별 예산 합계와 종료 상태·lease 조건을 지킨다", async () => {
    const tranches = [100, 100, 100].map((budget, i) => ({ budget, buyDropPct: i ? 10 : null, takeProfitPct: 10 }));
    await expect(createLiveStrategy(db, { ...cfg, tranches: tranches.map(r => ({ ...r, budget: 200 })) })).rejects.toThrow(/합계/);
    const s = await createLiveStrategy(db, cfg);
    await expect(updateLiveTranches(db, s.id, tranches.slice(1), now)).rejects.toThrow(/차수/);
    await expect(updateLiveTranches(db, s.id, tranches.map(r => ({ ...r, budget: 200 })), now)).rejects.toThrow(/합계/);
    await db.splitLiveStrategy.update({ where: { id: s.id }, data: { status: "completed" } });
    await expect(updateLiveTranches(db, s.id, tranches, now)).rejects.toThrow(/종료/);
    await db.splitLiveStrategy.update({ where: { id: s.id }, data: { status: "active" } });
    await db.splitLiveStrategy.update({ where: { id: s.id }, data: { leaseToken: "worker", leaseUntil: new Date(now.getTime() + 10000) } });
    await expect(updateLiveTranches(db, s.id, tranches, now)).rejects.toThrow(/다른 실행/);
    expect((await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } })).trancheSettingsJson).toBeNull();
  });
  it("LIVE 중 설정 변경은 상태·기존 주문을 보존하고 다음 판단부터 반영한다", async () => {
    const s = await createLiveStrategy(db, cfg);
    await startLiveStrategy(db, deps, s.id);
    await runLiveStrategy(db, deps, s.id);
    const original = await db.splitLiveOrder.findFirstOrThrow({ where: { strategyId: s.id } });
    const before = await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } });
    const tranches = [100, 160, 40].map((budget, i) => ({ budget, buyDropPct: i ? 20 : null, takeProfitPct: i ? 5 : 15 }));
    await updateLiveTranches(db, s.id, tranches, now);
    const saved = await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } });
    expect(saved).toMatchObject({ status: "active", cash: before.cash, revision: before.revision + 1, leaseToken: null });
    expect(await db.splitLiveOrder.findFirstOrThrow({ where: { id: original.id } })).toEqual(original);
    details["broker-1"] = { ...filled("broker-1", 0, 0), status: "PENDING" };
    expect(await runLiveStrategy(db, deps, s.id)).toMatchObject({ placed: 0 });
    expect(deps.submit).toHaveBeenCalledTimes(1);
    details["broker-1"] = filled("broker-1");
    snapshot.holdingQty = 10; snapshot.sellableQty = 10; snapshot.price = 11;
    await runLiveStrategy(db, deps, s.id);
    expect(deps.submit).toHaveBeenCalledTimes(1); // old 10% target must no longer sell
    snapshot.price = 8;
    await runLiveStrategy(db, deps, s.id);
    expect(await db.splitLiveOrder.findFirstOrThrow({ where: { sequence: 2 } })).toMatchObject({ side: "BUY", price: 8, quantity: 20 });
  });
  it("설정 저장 중 일시정지되면 상태나 설정을 덮어쓰지 않는다", async () => {
    const s = await createLiveStrategy(db, cfg);
    await startLiveStrategy(db, deps, s.id);
    const concurrentDb = db.$extends({ query: { splitLiveStrategy: {
      async findUniqueOrThrow({ args, query }) {
        const result = await query(args);
        await db.splitLiveStrategy.update({ where: { id: s.id }, data: { status: "paused", revision: { increment: 1 } } });
        return result;
      },
    } } });
    const rows = [100, 100, 100].map((budget, i) => ({ budget, buyDropPct: i ? 10 : null, takeProfitPct: 12 }));
    // The extension retains the Prisma delegates used by this operation.
    await expect(updateLiveTranches(concurrentDb as unknown as PrismaClient, s.id, rows, now)).rejects.toThrow(/상태가 변경/);
    expect(await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ status: "paused", trancheSettingsJson: null, leaseToken: null });
  });
  it("새 전략 1차 익절률은 기본 10%이며 변경값을 저장한다", async () => {
    const s = await createLiveStrategy(db, { ...cfg, takeProfitPct: 3 });
    expect(s.firstTakeProfitPct).toBe(10);
    await updateFirstTakeProfitPct(db, s.id, 5.25, now);
    await db.$disconnect();
    expect(await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
      firstTakeProfitPct: 5.25, takeProfitPct: 3, status: "paused", revision: 1, leaseToken: null,
    });
    await startLiveStrategy(db, deps, s.id);
    await runLiveStrategy(db, deps, s.id);
    details["broker-1"] = filled("broker-1");
    snapshot.holdingQty = 10;
    snapshot.sellableQty = 10;
    snapshot.price = 10.53;
    await runLiveStrategy(db, deps, s.id);
    expect(await db.splitLiveOrder.findFirstOrThrow({ where: { strategyId: s.id, side: "SELL" } })).toMatchObject({ price: 10.53 });
  });
  it.each([0, -1, 1000, NaN, Infinity, 1.001, null])("잘못된 1차 익절률 %s를 거절한다", async (value) => {
    await expect(createLiveStrategy(db, { ...cfg, firstTakeProfitPct: value as number })).rejects.toThrow(/1차 익절률/);
    const s = await createLiveStrategy(db, cfg);
    await expect(updateFirstTakeProfitPct(db, s.id, value as number, now)).rejects.toThrow(/1차 익절률/);
  });
  it("감시 중·미해결 주문·lease 보유 상태에서는 익절률을 바꾸지 않는다", async () => {
    const s = await createLiveStrategy(db, cfg);
    await startLiveStrategy(db, deps, s.id);
    await expect(updateFirstTakeProfitPct(db, s.id, 5, now)).rejects.toThrow(/일시정지/);
    await runLiveStrategy(db, deps, s.id);
    await db.splitLiveStrategy.update({ where: { id: s.id }, data: { status: "paused" } });
    await expect(updateFirstTakeProfitPct(db, s.id, 5, now)).rejects.toThrow(/미체결/);
    await db.splitLiveStrategy.update({ where: { id: s.id }, data: { leaseToken: "worker", leaseUntil: new Date(now.getTime() + 10000) } });
    await expect(updateFirstTakeProfitPct(db, s.id, 5, now)).rejects.toThrow(/다른 실행/);
    expect((await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } })).firstTakeProfitPct).toBe(10);
  });
  it("구 버전 입력은 동일 금액·1배로 저장한다", async () => {
    const strategy = await createLiveStrategy(db, cfg);
    expect(strategy).toMatchObject({ budgetMode: "fixed", budgetMultiplier: 1 });
  });
  it.each(["geometric", "linear"])("%s의 전체 필요 자금 미달은 생성하지 않는다", async (budgetMode) => {
    await expect(createLiveStrategy(db, { ...cfg, budgetMode, budgetMultiplier: 2 })).rejects.toThrow(/합계/);
    expect(await db.splitLiveStrategy.count()).toBe(0);
  });
  it.each([
    { budgetMode: "unknown" }, { budgetMode: null }, { budgetMultiplier: NaN },
    { budgetMultiplier: 0 }, { budgetMultiplier: 1.001 }, { budgetMultiplier: null },
  ])("서버가 잘못된 배수 설정 %j을 거절한다", async (patch) => {
    await expect(createLiveStrategy(db, { ...cfg, ...patch } as typeof cfg)).rejects.toThrow();
    expect(await db.splitLiveStrategy.count()).toBe(0);
  });
  it.each([["geometric", 49], ["linear", 37]] as const)("%s 설정은 재연결 후 3차 주문까지 유지된다", async (budgetMode, quantity) => {
    const s = await createLiveStrategy(db, { ...cfg, initialCash: 1000, budgetMode, budgetMultiplier: 2 });
    expect(s).toMatchObject({ budgetMode, budgetMultiplier: 2, status: "paused" });
    snapshot.buyingPower = 1000;
    await startLiveStrategy(db, deps, s.id);
    await runLiveStrategy(db, deps, s.id);
    details["broker-1"] = filled("broker-1");
    snapshot.holdingQty = 10;
    snapshot.sellableQty = 10;
    snapshot.price = 9;
    await runLiveStrategy(db, deps, s.id);
    expect(await db.splitLiveOrder.findFirstOrThrow({ where: { sequence: 2 } })).toMatchObject({ quantity: 22, price: 9 });
    details["broker-2"] = { ...filled("broker-2", 22, 198), quantity: 22, price: 9, status: "FILLED" };
    snapshot.holdingQty = 32;
    snapshot.sellableQty = 32;
    snapshot.price = 8.1;
    await db.$disconnect();
    await runLiveStrategy(db, deps, s.id);
    expect(await db.splitLiveOrder.findFirstOrThrow({ where: { sequence: 3 } })).toMatchObject({ quantity, price: 8.1 });
    expect(await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ budgetMode, budgetMultiplier: 2 });
  });
  const mismatches: Array<[string, Partial<BrokerOrder>]> = [
    ["주문번호", { orderId: "other" }],
    ["종목", { symbol: "MSFT" }],
    ["방향", { side: "SELL" }],
    ["수량", { quantity: 11 }],
    ["가격", { price: 11 }],
    ["통화", { currency: "KRW" }],
    ["정정", { status: "REPLACED" }],
    ["알 수 없는 상태", { status: "NEW_STATUS" }],
  ];
  it.each(mismatches)(
    "%s 불일치는 잔액·잔량을 변경하지 않고 신규 주문을 막는다",
    async (_name, patch) => {
      const id = await started();
      await runLiveStrategy(db, deps, id);
      details["broker-1"] = { ...filled("broker-1"), ...patch };
      await runLiveStrategy(db, deps, id);
      await runLiveStrategy(db, deps, id);
      const s = await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } });
      expect(s.status).toBe("paused");
      expect(s.cash).toBe(300);
      expect((await db.splitLiveLot.findFirstOrThrow()).boughtQty).toBe(0);
      expect((await db.splitLiveOrder.findFirstOrThrow()).status).toBe(
        "blocked",
      );
      expect(deps.submit).toHaveBeenCalledTimes(1);
    },
  );
  const recoveryMismatches: Array<[string, Partial<BrokerOrder>]> = [
    ["방향", { side: "SELL" }],
    ["수량", { quantity: 9 }],
    ["가격", { price: 11 }],
    ["통화", { currency: "KRW" }],
    [
      "이전 시각",
      { orderedAt: new Date(now.getTime() - 120000).toISOString() },
    ],
    [
      "이후 시각",
      { orderedAt: new Date(now.getTime() + 360000).toISOString() },
    ],
  ];
  it.each(recoveryMismatches)(
    "복구 %s 불일치는 원래 미확인 상태와 잔고를 보존한다",
    async (_name, patch) => {
      const id = await started();
      vi.mocked(deps.submit).mockRejectedValue(new Error("timeout"));
      await runLiveStrategy(db, deps, id);
      const order = await db.splitLiveOrder.findFirstOrThrow();
      details.candidate = { ...filled("candidate"), ...patch };
      await expect(
        recoverLiveOrder(db, deps, order.id, { brokerId: "candidate" }),
      ).rejects.toThrow();
      expect(await db.splitLiveOrder.findFirstOrThrow()).toMatchObject({
        status: "submit_unknown",
        tossOrderId: null,
      });
      expect(
        (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).cash,
      ).toBe(300);
    },
  );
  it("수동 종료는 활성·미체결·보유 장부를 모두 거부한다", async () => {
    const id = await started();
    await expect(finishEmptyLiveStrategy(db, deps, id)).rejects.toThrow();
    await runLiveStrategy(db, deps, id);
    await db.splitLiveStrategy.update({
      where: { id },
      data: { status: "paused" },
    });
    await expect(finishEmptyLiveStrategy(db, deps, id)).rejects.toThrow();
    details["broker-1"] = filled("broker-1");
    await runLiveStrategy(db, deps, id);
    await expect(finishEmptyLiveStrategy(db, deps, id)).rejects.toThrow();
    expect(await db.splitSymbolOwner.count()).toBe(1);
  });
  it("미접수 확인 후 정지한 빈 장부만 종료하고 소유권을 반납한다", async () => {
    const id = await started();
    vi.mocked(deps.submit).mockRejectedValue(new Error("timeout"));
    await runLiveStrategy(db, deps, id);
    const order = await db.splitLiveOrder.findFirstOrThrow();
    await recoverLiveOrder(db, deps, order.id, { confirmNotCreated: true });
    expect((await db.splitLiveOrder.findFirstOrThrow()).status).toBe(
      "not_created",
    );
    await finishEmptyLiveStrategy(db, deps, id);
    expect(
      (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("completed");
    expect(await db.splitSymbolOwner.count()).toBe(0);
    expect(deps.submit).toHaveBeenCalledTimes(1);
  });
});
afterEach(async () => {
  await db.$disconnect();
  rmSync(folder, { recursive: true, force: true });
});
async function started() {
  const s = await createLiveStrategy(db, cfg);
  await startLiveStrategy(db, deps, s.id);
  return s.id;
}
function filled(id: string, quantity = 10, amount = 100): BrokerOrder {
  return {
    orderId: id,
    symbol: "AAPL",
    side: "BUY",
    quantity: 10,
    price: 10,
    currency: "USD",
    orderedAt: now.toISOString(),
    status: quantity === 10 ? "FILLED" : "PARTIAL_FILLED",
    filledQty: quantity,
    filledAmount: amount,
    commission: 0,
    tax: 0,
  };
}

describe("실거래 영속 실행", () => {
  it("생성은 정지 상태이며 시작 후 의도를 먼저 저장하고 접수만으로 잔고를 바꾸지 않는다", async () => {
    const id = await started();
    vi.mocked(deps.submit).mockImplementation(async (_s, o) => {
      expect(await db.splitLiveOrder.count()).toBe(1);
      return { orderId: `broker-${o.sequence}` };
    });
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(1);
    expect(
      (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).cash,
    ).toBe(300);
    expect((await db.splitLiveLot.findFirstOrThrow()).boughtQty).toBe(0);
  });
  it("부분 체결은 차이만 원자적으로 반영하고 잔여 주문 동안 다음 차수를 막는다", async () => {
    const id = await started();
    await runLiveStrategy(db, deps, id);
    details["broker-1"] = filled("broker-1", 4, 40);
    snapshot.holdingQty = 4;
    await runLiveStrategy(db, deps, id);
    await runLiveStrategy(db, deps, id);
    expect((await db.splitLiveLot.findFirstOrThrow()).boughtQty).toBe(4);
    expect(
      (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).cash,
    ).toBe(260);
    expect(deps.submit).toHaveBeenCalledTimes(1);
    details["broker-1"] = { ...filled("broker-1", 4, 40), status: "CANCELED" };
    snapshot.price = 9;
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(2);
  });
  it("응답 유실은 미확인 상태로 멈추고 재실행·재시작에도 다시 보내지 않는다", async () => {
    const id = await started();
    vi.mocked(deps.submit).mockRejectedValue(new Error("timeout"));
    await runLiveStrategy(db, deps, id);
    await db.$disconnect();
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(1);
    expect((await db.splitLiveOrder.findFirstOrThrow()).status).toBe(
      "submit_unknown",
    );
    expect(
      (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("paused");
  });
  it("독립 클라이언트 동시 실행도 브로커 주문 하나만 만든다", async () => {
    const id = await started();
    const other = new PrismaClient({
      datasources: { db: { url: `file:${path.join(folder, "test.db")}` } },
    });
    try {
      await Promise.allSettled([
        runLiveStrategy(db, deps, id),
        runLiveStrategy(other, deps, id),
      ]);
      expect(deps.submit).toHaveBeenCalledTimes(1);
      expect(await db.splitLiveOrder.count()).toBe(1);
    } finally {
      await other.$disconnect();
    }
  });
  it("정지·킬스위치·장 마감에도 기존 주문 체결은 동기화한다", async () => {
    const id = await started();
    await runLiveStrategy(db, deps, id);
    details["broker-1"] = filled("broker-1");
    await db.splitLiveStrategy.update({
      where: { id },
      data: { status: "paused" },
    });
    deps.killed = () => true;
    snapshot.isOpen = false;
    await runLiveStrategy(db, deps, id);
    expect((await db.splitLiveLot.findFirstOrThrow()).boughtQty).toBe(10);
    expect(deps.submit).toHaveBeenCalledTimes(1);
  });
  it("체결 저장 중 실패하면 잔액·차수·누적 체결을 모두 롤백한다", async () => {
    const id = await started();
    await runLiveStrategy(db, deps, id);
    details["broker-1"] = filled("broker-1");
    await db.$executeRawUnsafe(
      `CREATE TRIGGER fail_fill BEFORE UPDATE OF filledQty ON split_live_orders BEGIN SELECT RAISE(ABORT,'fail fill'); END`,
    );
    await runLiveStrategy(db, deps, id);
    expect((await db.splitLiveLot.findFirstOrThrow()).boughtQty).toBe(0);
    expect(
      (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).cash,
    ).toBe(300);
  });
  it("과거 시세·외부 보유·외부 미체결·자금 부족이면 새 주문을 만들지 않는다", async () => {
    const id = await started();
    for (const patch of [
      { observedAt: new Date(now.getTime() - 61000) },
      { holdingQty: 1 },
      { openOrderIds: ["other"] },
      { buyingPower: 0 },
    ]) {
      Object.assign(
        snapshot,
        { observedAt: now, holdingQty: 0, openOrderIds: [], buyingPower: 300 },
        patch,
      );
      await db.splitLiveStrategy.update({
        where: { id },
        data: { status: "active" },
      });
      await runLiveStrategy(db, deps, id);
    }
    expect(deps.submit).not.toHaveBeenCalled();
  });
  it("미확인 주문번호 복구는 종목·방향·수량·가격·시각이 일치해야 한다", async () => {
    const id = await started();
    vi.mocked(deps.submit).mockRejectedValue(new Error("timeout"));
    await runLiveStrategy(db, deps, id);
    const o = await db.splitLiveOrder.findFirstOrThrow();
    details.bad = { ...filled("bad"), symbol: "OTHER" };
    await expect(
      recoverLiveOrder(db, deps, o.id, { brokerId: "bad" }),
    ).rejects.toThrow();
    details.good = filled("good");
    await recoverLiveOrder(db, deps, o.id, { brokerId: "good" });
    expect((await db.splitLiveOrder.findFirstOrThrow()).tossOrderId).toBe(
      "good",
    );
  });
  it("복구 잠금 전에 읽은 과거 상태로 이미 연결된 주문을 미접수 처리하지 않는다", async () => {
    const id = await started();
    vi.mocked(deps.submit).mockRejectedValue(new Error("timeout"));
    await runLiveStrategy(db, deps, id);
    const stale = await db.splitLiveOrder.findFirstOrThrow({
      include: { strategy: true },
    });
    await db.splitLiveOrder.update({
      where: { id: stale.id },
      data: { status: "submitted", tossOrderId: "known" },
    });
    const spy = vi
      .spyOn(db.splitLiveOrder, "findUniqueOrThrow")
      .mockResolvedValueOnce(stale);
    try {
      await expect(
        recoverLiveOrder(db, deps, stale.id, { confirmNotCreated: true }),
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect((await db.splitLiveOrder.findFirstOrThrow()).status).toBe(
      "submitted",
    );
  });
  it("시작 전 조회 중 나중에 들어온 일시정지를 과거 시작 요청이 덮어쓰지 않는다", async () => {
    const s = await createLiveStrategy(db, cfg);
    vi.mocked(deps.snapshot).mockImplementationOnce(async () => {
      await db.splitLiveStrategy.update({
        where: { id: s.id },
        data: { status: "paused", revision: { increment: 1 } },
      });
      return snapshot;
    });
    await expect(startLiveStrategy(db, deps, s.id)).rejects.toThrow();
    expect(
      (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id: s.id } }))
        .status,
    ).toBe("paused");
  });
  it("별도 주문 경로는 소유 종목을 사용할 수 없고 동기화 버튼은 신규 주문을 내지 않는다", async () => {
    const id = await started();
    await expect(assertSymbolOwnership(db, 42, "AAPL")).rejects.toThrow();
    await expect(
      assertSymbolOwnership(db, 42, "AAPL", id),
    ).resolves.toBeUndefined();
    await expect(
      assertSymbolOwnership(db, 42, "MSFT"),
    ).resolves.toBeUndefined();
    await runLiveStrategy(db, deps, id, true);
    expect(deps.submit).not.toHaveBeenCalled();
  });
  it("worker tick은 정지한 빈 장부를 실행하지 않고 정지 후에도 미체결을 동기화한다", async () => {
    const s = await createLiveStrategy(db, cfg);
    expect((await splitLiveTick(db, deps)).checked).toBe(0);
    await startLiveStrategy(db, deps, s.id);
    await splitLiveTick(db, deps);
    await db.splitLiveStrategy.update({
      where: { id: s.id },
      data: { status: "paused" },
    });
    details["broker-1"] = filled("broker-1");
    await splitLiveTick(db, deps);
    expect((await db.splitLiveLot.findFirstOrThrow()).boughtQty).toBe(10);
    expect(deps.submit).toHaveBeenCalledTimes(1);
  });
  it("실제 부분 매도·취소의 원가를 보존하고 남은 물량을 매도한 뒤 재진입한다", async () => {
    const id = await started();
    await runLiveStrategy(db, deps, id);
    details["broker-1"] = filled("broker-1");
    snapshot.holdingQty = 10;
    snapshot.sellableQty = 10;
    snapshot.price = 9;
    await runLiveStrategy(db, deps, id);
    details["broker-2"] = {
      ...filled("broker-2"),
      quantity: 11,
      price: 9,
      filledQty: 11,
      filledAmount: 99,
    };
    snapshot.holdingQty = 21;
    snapshot.sellableQty = 21;
    snapshot.price = 8.1;
    await runLiveStrategy(db, deps, id);
    details["broker-3"] = {
      ...filled("broker-3"),
      quantity: 12,
      price: 8.1,
      filledQty: 12,
      filledAmount: 97.2,
    };
    snapshot.holdingQty = 33;
    snapshot.sellableQty = 33;
    snapshot.price = 8.91;
    await runLiveStrategy(db, deps, id);
    details["broker-4"] = {
      ...filled("broker-4"),
      side: "SELL",
      quantity: 12,
      price: 8.91,
      filledQty: 5,
      filledAmount: 44.55,
      commission: 0.1,
      tax: 0.2,
      status: "PARTIAL_FILLED",
    };
    snapshot.holdingQty = 28;
    snapshot.sellableQty = 28;
    await runLiveStrategy(db, deps, id);
    await runLiveStrategy(db, deps, id);
    expect(
      (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).cash,
    ).toBe(48.05);
    expect(
      (await db.splitLiveLot.findFirstOrThrow({ where: { slot: 3 } })).soldQty,
    ).toBe(5);
    details["broker-4"].status = "CANCELED";
    await runLiveStrategy(db, deps, id);
    details["broker-5"] = {
      ...filled("broker-5"),
      side: "SELL",
      quantity: 7,
      price: 8.91,
      filledQty: 7,
      filledAmount: 62.37,
    };
    snapshot.holdingQty = 21;
    snapshot.sellableQty = 21;
    snapshot.price = 8.1;
    await runLiveStrategy(db, deps, id);
    const reentry = await db.splitLiveLot.findFirstOrThrow({
      where: { slot: 3, generation: 2 },
    });
    expect(reentry.boughtQty).toBe(0);
    expect(
      (await db.splitLiveOrder.findFirstOrThrow({ where: { sequence: 6 } }))
        .side,
    ).toBe("BUY");
    expect(
      (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).cash,
    ).toBe(110.42);
  });
  it("null 비용은 0으로 확정하지 않고 비용 확인 후 차이만 반영한다", async () => {
    const id = await started();
    await runLiveStrategy(db, deps, id);
    details["broker-1"] = { ...filled("broker-1"), commission: null };
    await runLiveStrategy(db, deps, id);
    expect((await db.splitLiveOrder.findFirstOrThrow()).status).toBe(
      "cost_pending",
    );
    expect(
      (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).cash,
    ).toBe(300);
    details["broker-1"].commission = 0.5;
    await runLiveStrategy(db, deps, id);
    expect(
      (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).cash,
    ).toBe(199.5);
    details["broker-1"].commission = 0.2;
    await runLiveStrategy(db, deps, id);
    expect(
      (await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).cash,
    ).toBe(199.8);
  });
  it("접수 성공 뒤 주문번호 저장에 실패해도 재전송하지 않는다", async () => {
    const id = await started();
    await db.$executeRawUnsafe(
      `CREATE TRIGGER fail_order_id BEFORE UPDATE OF tossOrderId ON split_live_orders BEGIN SELECT RAISE(ABORT,'fail order id'); END`,
    );
    await runLiveStrategy(db, deps, id);
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(1);
    expect((await db.splitLiveOrder.findFirstOrThrow()).status).toBe(
      "submit_unknown",
    );
  });
  async function firstSalePlaced() {
    const s = await createLiveStrategy(db, { ...cfg, maxTranches: 1 });
    await startLiveStrategy(db, deps, s.id);
    await runLiveStrategy(db, deps, s.id);
    details["broker-1"] = filled("broker-1");
    snapshot.holdingQty = 10;
    snapshot.sellableQty = 10;
    snapshot.price = 11;
    await runLiveStrategy(db, deps, s.id);
    details["broker-2"] = {
      ...filled("broker-2"), side: "SELL", price: 11,
      filledAmount: 110, commission: 0.1, tax: 0.2,
    };
    snapshot.holdingQty = 0;
    return s.id;
  }
  it("마지막 한 주가 더 높은 가격에 체결되면 그 가격 기준으로 대기하고 경계에서 한 번만 주문한다", async () => {
    const id = await firstSalePlaced();
    await updateReentryDrop(db, id, 10, now);
    Object.assign(details["broker-2"], { status: "PARTIAL_FILLED", filledQty: 9, filledAmount: 99 });
    await runLiveStrategy(db, deps, id);
    Object.assign(details["broker-2"], { status: "FILLED", filledQty: 10, filledAmount: 111 });
    await runLiveStrategy(db, deps, id);
    snapshot.price = 10.81;
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(2);
    await db.$disconnect();
    snapshot.price = 10.8;
    await runLiveStrategy(db, deps, id);
    expect(await db.splitLiveOrder.findFirstOrThrow({ where: { sequence: 3 } })).toMatchObject({ reentryTarget: 10.8, side: "BUY" });
    expect(deps.submit).toHaveBeenCalledTimes(3);
  });

  it("다중 가격 체결의 마지막 가격이 불명확하면 평균가로 매수하지 않는다", async () => {
    const id = await firstSalePlaced();
    await updateReentryDrop(db, id, 5, now);
    details["broker-2"].filledAmount = 115;
    await runLiveStrategy(db, deps, id);
    snapshot.price = 9;
    expect((await runLiveStrategy(db, deps, id)).note).toContain("체결가 확인 필요");
    expect(deps.submit).toHaveBeenCalledTimes(2);
    await updateReentryDrop(db, id, null, now);
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(3);
  });

  it("구버전 워커가 재매수 기준 없이 1차 주문을 생성하면 DB가 차단한다", async () => {
    const id = await firstSalePlaced();
    await runLiveStrategy(db, deps, id);
    const lot = await db.splitLiveLot.create({ data: { strategyId: id, slot: 1, generation: 2 } });
    await expect(db.splitLiveOrder.create({ data: {
      strategyId: id, lotId: lot.id, sequence: 3, clientOrderId: "old-worker",
      side: "BUY", price: 11, quantity: 1,
    } })).rejects.toThrow();
    expect(await db.splitLiveOrder.count()).toBe(2);
  });
  it("하락 조건으로 등록해도 최초 진입은 정상 실행되며 잘못된 비율은 거절한다", async () => {
    const s = await createLiveStrategy(db, { ...cfg, reentryDropPct: 5 });
    for (const value of [0, 100, NaN, 0.001]) await expect(updateReentryDrop(db, s.id, value, now)).rejects.toThrow(/하락률/);
    await startLiveStrategy(db, deps, s.id);
    await runLiveStrategy(db, deps, s.id);
    expect(deps.submit).toHaveBeenCalledTimes(1);
  });

  it("기본 재매수는 직전 1차 매수가까지 기다리고 재시작·동시 감시에도 한 번만 주문한다", async () => {
    const id = await firstSalePlaced();
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(2);
    expect(await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "active", cash: 309.7, initialCash: 300, trancheBudget: 100,
      maxTranches: 1, buyDropPct: 10, takeProfitPct: 10,
    });
    expect(await db.splitSymbolOwner.count()).toBe(1);
    details["broker-3"] = {
      ...filled("broker-3"), quantity: 10, price: 10, status: "PENDING",
      filledQty: 0, filledAmount: 0,
    };
    snapshot.price = 11;
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(2);
    snapshot.price = 10.01;
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(2);
    snapshot.price = 10;
    await db.$disconnect();
    await Promise.all([runLiveStrategy(db, deps, id), runLiveStrategy(db, deps, id)]);
    expect(deps.submit).toHaveBeenCalledTimes(3);
    expect(await db.splitLiveOrder.findFirstOrThrow({ where: { sequence: 3 } })).toMatchObject({
      side: "BUY", quantity: 10, price: 10, status: "submitted", reentryTarget: 10,
    });
    const lots = await db.splitLiveLot.findMany({ orderBy: { generation: "asc" } });
    expect(lots).toHaveLength(2);
    expect(lots[1]).toMatchObject({ slot: 1, generation: 2, boughtQty: 0 });
    expect(lotTotals(lots[0]).realizedPnl).toBe(9.7);
    expect((await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).cash).toBe(309.7);
  });
  it("두 번 전량 익절해도 회차와 누적 수익을 이어가며 수동 종료 후에는 재시작하지 않는다", async () => {
    const id = await firstSalePlaced();
    await runLiveStrategy(db, deps, id);
    snapshot.price = 9;
    await runLiveStrategy(db, deps, id);
    details["broker-3"] = {
      ...filled("broker-3"), quantity: 11, price: 9, filledQty: 11, filledAmount: 99,
    };
    snapshot.holdingQty = 11;
    snapshot.sellableQty = 11;
    snapshot.price = 12.1;
    await runLiveStrategy(db, deps, id);
    details["broker-4"] = {
      ...filled("broker-4"), side: "SELL", quantity: 11, price: 12.1,
      filledQty: 11, filledAmount: 133.1,
    };
    snapshot.holdingQty = 0;
    await runLiveStrategy(db, deps, id);
    const lots = await db.splitLiveLot.findMany();
    expect(lots.reduce((sum, l) => sum + lotTotals(l).realizedPnl, 0)).toBe(43.8);
    expect((await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).cash).toBe(343.8);
    expect(deps.submit).toHaveBeenCalledTimes(4);
    snapshot.price = 9.01;
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(4); // latest filled generation uses 9, not the original 10
    await db.splitLiveStrategy.update({ where: { id }, data: { status: "paused" } });
    await finishEmptyLiveStrategy(db, deps, id);
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(4);
    expect(await db.splitSymbolOwner.count()).toBe(0);
    expect((await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).status).toBe("completed");
  });
  it.each(["paused", "killed", "syncOnly", "closed", "stale", "cash"])(
    "익절 후 %s 조건에서는 재매수하지 않는다", async (mode) => {
      const id = await firstSalePlaced();
      await runLiveStrategy(db, deps, id);
      snapshot.price = 10;
      if (mode === "paused") await db.splitLiveStrategy.update({ where: { id }, data: { status: "paused" } });
      if (mode === "killed") deps.killed = () => true;
      if (mode === "closed") snapshot.isOpen = false;
      if (mode === "stale") snapshot.observedAt = new Date(now.getTime() - 61000);
      if (mode === "cash") snapshot.buyingPower = 1;
      await runLiveStrategy(db, deps, id, mode === "syncOnly");
      expect(deps.submit).toHaveBeenCalledTimes(2);
      expect(await db.splitLiveLot.count()).toBe(1);
      expect(await db.splitSymbolOwner.count()).toBe(1);
      expect((await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).status).toBe(mode === "paused" ? "paused" : "active");
    },
  );
  it("일시정지 중 전량 매도가 정산돼도 정지 상태와 소유권을 보존한다", async () => {
    const id = await firstSalePlaced();
    await db.splitLiveStrategy.update({ where: { id }, data: { status: "paused" } });
    await runLiveStrategy(db, deps, id);
    expect((await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).status).toBe("paused");
    expect(await db.splitSymbolOwner.count()).toBe(1);
    expect(deps.submit).toHaveBeenCalledTimes(2);
    snapshot.price = 10;
    await startLiveStrategy(db, deps, id);
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(3);
  });
  it("전량 매도 비용 미확정은 재시작하지 않고 대조를 기다린다", async () => {
    const id = await firstSalePlaced();
    details["broker-2"].commission = null;
    await runLiveStrategy(db, deps, id);
    await runLiveStrategy(db, deps, id);
    expect(deps.submit).toHaveBeenCalledTimes(2);
    expect((await db.splitLiveStrategy.findUniqueOrThrow({ where: { id } })).status).toBe("paused");
    expect(await db.splitLiveOrder.findFirstOrThrow({ where: { sequence: 2 } })).toMatchObject({ status: "cost_pending" });
  });
});
