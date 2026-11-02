import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma-clients/company-map";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSimulation, runSimulation } from "@/lib/split/run";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("@/lib/db", () => ({ get db() { return state.db; } }));
import { getSplitChart } from "./split-chart";
let folder: string;
beforeEach(async () => {
  folder = mkdtempSync(path.join(tmpdir(), "split-chart-"));
  state.db = new PrismaClient({ datasources: { db: { url: `file:${path.join(folder, "test.db")}` } } });
  for (const migration of ["20261030000000_add_split_simulation", "20261030010000_add_split_live", "20261030020000_add_split_budget_modes", "20261031000000_add_split_first_take_profit", "20261031010000_add_split_tranche_settings"]) {
    const sql = readFileSync(path.resolve(__dirname, `../../prisma/migrations/${migration}/migration.sql`), "utf8");
    for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) await state.db.$executeRawUnsafe(statement);
  }
});
afterEach(async () => { await state.db?.$disconnect(); rmSync(folder, { recursive: true, force: true }); });
it("외부 시세 없이 최근 주문 제한 밖의 부분 체결도 포함하고 미체결은 제외한다", async () => {
  const db = state.db!;
  const strategy = await db.splitLiveStrategy.create({ data: { name: "테스트", symbol: "005930", market: "KR", accountSeq: 1, initialCash: 1000, cash: 1000, trancheBudget: 100, maxTranches: 2, buyDropPct: 10, takeProfitPct: 10, feeBufferPct: 0 } });
  const lot = await db.splitLiveLot.create({ data: { strategyId: strategy.id, slot: 1, generation: 1 } });
  for (let sequence = 1; sequence <= 22; sequence++) await db.splitLiveOrder.create({ data: { strategyId: strategy.id, lotId: lot.id, sequence, clientOrderId: `chart-${sequence}`, side: "BUY", quantity: 2, price: 102, filledQty: sequence === 22 ? 0 : 1, filledAmount: sequence === 22 ? 0 : 101, status: "submitted" } });
  const result = await getSplitChart(strategy.id, "live");
  expect(result.trades).toHaveLength(21);
  expect(result.trades[0]).toMatchObject({ quantity: 1, price: 101 });
});
it("실행 이력이 없어도 장부에서 모의 체결을 읽고 무거래 관측은 생략한다", async () => {
  const db = state.db!;
  const simulation = await createSimulation(db, { symbol: "005930", name: "모의", market: "KR", source: "manual", initialCash: 300000, trancheBudget: 100000, maxTranches: 3, buyDropPct: 10, takeProfitPct: 10, feePct: 0, sellTaxPct: 0 });
  for (let index = 1; index <= 12; index++) {
    await runSimulation(db, simulation.id, { requestKey: `run-${index}`, source: "manual", prices: [10000 - index] });
    await db.splitRun.updateMany({ where: { simulationId: simulation.id, requestKey: `run-${index}` }, data: { createdAt: new Date(Date.UTC(2026, 9, index)) } });
  }
  await db.splitRun.deleteMany({ where: { simulationId: simulation.id } });
  const result = await getSplitChart(simulation.id, "simulation");
  expect(result.trades).toHaveLength(1);
  expect(result.trades[0]).toMatchObject({ x: 1, price: 9999, quantity: 10 });
});
