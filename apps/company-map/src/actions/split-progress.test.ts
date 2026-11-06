import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma-clients/company-map";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("@/lib/db", () => ({ get db() { return state.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/toss/client", () => ({ isTossConfigured: () => false, getAccounts: vi.fn() }));
vi.mock("@/lib/split/live-toss", () => ({ tossLiveDeps: vi.fn() }));
import { listSplitLive } from "./split-live";
import { listSplitReservations } from "./split-reservations";
import { strategyProgress } from "@/lib/split/progress";
let folder: string;
beforeEach(async () => {
  folder = mkdtempSync(path.join(tmpdir(), "split-progress-"));
  state.db = new PrismaClient({ datasources: { db: { url: `file:${path.join(folder, "test.db")}` } } });
  for (const migration of ["20261030010000_add_split_live", "20261030020000_add_split_budget_modes", "20261031000000_add_split_first_take_profit", "20261031010000_add_split_tranche_settings", "20261101000000_add_split_reservations", "20261104000000_add_split_reentry", "20261105000000_split_reentry_buy_price"]) {
    const sql = readFileSync(path.resolve(__dirname, `../../prisma/migrations/${migration}/migration.sql`), "utf8");
    for (const statement of sql.split(/;(?!\s*END\b)/i).map(s => s.trim()).filter(Boolean)) await state.db.$executeRawUnsafe(statement);
  }
});
afterEach(async () => { await state.db?.$disconnect(); rmSync(folder, { recursive: true, force: true }); });
it("매도 횟수는 전체 주문에서 체결이 있는 매도만 세고 부분 체결은 주문당 한 번 집계한다", async () => {
  const db = state.db!;
  const strategy = await db.splitLiveStrategy.create({ data: { name: "매도 집계", symbol: "005930", market: "KR", accountSeq: 1, initialCash: 1000, cash: 1000, trancheBudget: 100, maxTranches: 2, buyDropPct: 10, takeProfitPct: 10 } });
  expect((await listSplitLive(strategy.id, false)).strategies[0].sellCount).toBe(0);
  const lot = await db.splitLiveLot.create({ data: { strategyId: strategy.id, slot: 1, generation: 1 } });
  for (let sequence = 1; sequence <= 25; sequence++) {
    await db.splitLiveOrder.create({ data: {
      strategyId: strategy.id, lotId: lot.id, sequence, clientOrderId: `count-${sequence}`,
      side: sequence === 25 ? "BUY" : "SELL", quantity: 3, price: 100,
      filledQty: sequence === 23 || sequence === 24 ? 0 : sequence === 22 ? 1 : 3,
      status: sequence === 22 || sequence === 24 ? "cancelled" : sequence === 23 ? "submitted" : "closed",
    } });
  }
  const detail = (await listSplitLive(strategy.id)).strategies[0];
  expect(detail.orders).toHaveLength(20);
  expect(detail.sellCount).toBe(22);
  expect((await listSplitLive(strategy.id, false)).strategies[0].sellCount).toBe(22);
  await db.splitLiveOrder.update({ where: { clientOrderId: "count-22" }, data: { filledQty: 2 } });
  expect((await listSplitLive(strategy.id, false)).strategies[0].sellCount).toBe(22);
});
it("예약 현황은 대기만, 실행·실패 내역은 각 탭에서 날짜와 종목을 조회한다", async () => {
  const db = state.db!;
  const values = { watchPrice: 100, expiresAt: new Date("2026-11-02T15:00:00Z") };
  const strategy = await db.splitLiveStrategy.create({ data: { name: "예약 테스트", symbol: "005930", market: "KR", accountSeq: 1, initialCash: 1000, cash: 1000, trancheBudget: 100, maxTranches: 2, buyDropPct: 10, takeProfitPct: 10,
    reservation: { create: { ...values, events: { create: { ...values, type: "registered", message: "등록" } } } },
  } });
  expect((await listSplitLive(strategy.id)).strategies[0].reservation?.expiresAt).toBe("2026-11-02T15:00:00.000Z");
  expect((await listSplitReservations()).rows).toHaveLength(1);
  await db.splitBuyReservation.update({ where: { strategyId: strategy.id }, data: { status: "failed", events: { create: { ...values, type: "failed", message: "주문 거절" } } } });
  const result = await listSplitReservations();
  expect(result.rows).toHaveLength(0);
  expect(result.executions).toHaveLength(0);
  expect(result.failures[0]).toMatchObject({ type: "failed", message: "주문 거절", expiresAt: "2026-11-02T15:00:00.000Z", reservation: { strategy: { name: "예약 테스트" } } });
  expect(result.history).toHaveLength(2);
});
it("최근 20건 밖의 미해결 주문이 있는 회차는 청산 완료에서 제외하고 정산 후에만 포함한다", async () => {
  const db = state.db!;
  const strategy = await db.splitLiveStrategy.create({ data: { name: "테스트", symbol: "005930", market: "KR", accountSeq: 1, initialCash: 1000, cash: 1000, trancheBudget: 100, maxTranches: 2, buyDropPct: 10, takeProfitPct: 10, feeBufferPct: 0 } });
  const first = await db.splitLiveLot.create({ data: { strategyId: strategy.id, slot: 1, generation: 1, boughtQty: 1, boughtAmount: 100, soldQty: 1, soldAmount: 110 } });
  const second = await db.splitLiveLot.create({ data: { strategyId: strategy.id, slot: 2, generation: 1 } });
  const pending = await db.splitLiveOrder.create({ data: { strategyId: strategy.id, lotId: first.id, sequence: 1, clientOrderId: "old-pending", side: "SELL", quantity: 1, price: 110, filledQty: 1, filledAmount: 110, status: "cost_pending" } });
  for (let sequence = 2; sequence <= 21; sequence++) await db.splitLiveOrder.create({ data: { strategyId: strategy.id, lotId: second.id, sequence, clientOrderId: `later-${sequence}`, side: "BUY", quantity: 1, price: 100, status: "closed" } });
  const before = (await listSplitLive(strategy.id)).strategies[0];
  expect(before.orders).toHaveLength(20);
  expect(before.orders.some(o => o.id === pending.id)).toBe(false);
  expect(strategyProgress(before.maxTranches, before.lots)).toMatchObject({ completed: 0, pendingOrders: 1, realizedPnl: 10 });
  await db.splitLiveOrder.update({ where: { id: pending.id }, data: { status: "closed" } });
  const after = (await listSplitLive(strategy.id)).strategies[0];
  expect(strategyProgress(after.maxTranches, after.lots)).toMatchObject({ completed: 1, pendingOrders: 0, realizedPnl: 10 });
});
