import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma-clients/company-map";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSimulation, runSimulation, loadSimulation } from "./run";
import type { SplitConfig } from "./engine";

const config: SplitConfig = {
  symbol: "005930",
  name: "장부 테스트",
  market: "KR",
  source: "manual",
  initialCash: 300000,
  trancheBudget: 100000,
  maxTranches: 3,
  buyDropPct: 10,
  takeProfitPct: 10,
  feePct: 0,
  sellTaxPct: 0,
};
let db: PrismaClient;
let folder: string;

beforeEach(async () => {
  folder = mkdtempSync(path.join(tmpdir(), "split-test-"));
  db = new PrismaClient({
    datasources: { db: { url: `file:${path.join(folder, "test.db")}` } },
  });
  const sql = readFileSync(
    path.resolve(
      __dirname,
      "../../../prisma/migrations/20261030000000_add_split_simulation/migration.sql",
    ),
    "utf8",
  );
  for (const statement of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await db.$executeRawUnsafe(statement);
});

afterEach(async () => {
  await db?.$disconnect();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe("영속 모의 실행", () => {
  it("가격 경로의 차수·재진입·손익을 DB에 저장하고 새 클라이언트에서도 복원한다", async () => {
    const created = await createSimulation(db, config);
    const result = await runSimulation(db, created.id, {
      requestKey: "path-1",
      source: "manual",
      prices: [10000, 9000, 8100, 8910, 8100],
    });
    expect(result.fillCount).toBe(5);
    await db.$disconnect();
    const restored = await loadSimulation(db, created.id);
    expect(restored.state.lots).toHaveLength(4);
    expect(restored.state.cash).toBe(13520);
    expect(restored.summary.realizedPnl).toBe(9720);
    expect(restored.state.stepCount).toBe(5);
    expect(restored.summary.totalPnl).toBeCloseTo(
      restored.summary.equity - config.initialCash,
      4,
    );
    expect(await db.splitRun.count()).toBe(1);
  });

  it("같은 요청 재시도는 중복 체결 없이 기존 결과를 반환한다", async () => {
    const created = await createSimulation(db, config);
    const input = {
      requestKey: "same-request",
      source: "manual" as const,
      prices: [10000, 9000],
    };
    await runSimulation(db, created.id, input);
    expect((await runSimulation(db, created.id, input)).duplicate).toBe(true);
    expect((await loadSimulation(db, created.id)).state.stepCount).toBe(2);
    expect(await db.splitLot.count()).toBe(2);
    await expect(
      runSimulation(db, created.id, { ...input, prices: [5000] }),
    ).rejects.toThrow("다른 입력");
  });

  it("경로의 어느 가격이든 잘못되면 전체 요청을 기록하지 않는다", async () => {
    const created = await createSimulation(db, config);
    await expect(
      runSimulation(db, created.id, {
        requestKey: "bad-path",
        source: "manual",
        prices: [10000, NaN],
      }),
    ).rejects.toThrow();
    expect(await db.splitLot.count()).toBe(0);
    expect(await db.splitRun.count()).toBe(0);
    expect((await loadSimulation(db, created.id)).state.cash).toBe(
      config.initialCash,
    );
  });

  it("실행 이력 저장이 실패하면 앞서 쓴 잔액과 차수도 함께 롤백한다", async () => {
    const created = await createSimulation(db, config);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_split_run BEFORE INSERT ON "split_runs"
      BEGIN SELECT RAISE(ABORT, 'injected run failure'); END`);
    await expect(
      runSimulation(db, created.id, {
        requestKey: "rollback",
        source: "manual",
        prices: [10000, 9000],
      }),
    ).rejects.toThrow();
    const restored = await loadSimulation(db, created.id);
    expect(restored.state.cash).toBe(config.initialCash);
    expect(restored.state.stepCount).toBe(0);
    expect(restored.state.lots).toHaveLength(0);
    expect(await db.splitRun.count()).toBe(0);
  });

  it("일시정지·다른 가격 원천·LIVE 상태에서는 실행하지 않는다", async () => {
    const created = await createSimulation(db, config);
    const input = {
      requestKey: "attempt",
      source: "manual" as const,
      prices: [10000],
    };
    await expect(
      runSimulation(db, created.id, {
        ...input,
        source: "toss",
        observedAt: "2026-10-30T01:00:00Z",
      }),
    ).rejects.toThrow("원천");
    await db.splitSimulation.update({
      where: { id: created.id },
      data: { status: "paused" },
    });
    await expect(runSimulation(db, created.id, input)).rejects.toThrow(
      "실행 중",
    );
    await db.splitSimulation.update({
      where: { id: created.id },
      data: { status: "active", dryRun: false },
    });
    await expect(runSimulation(db, created.id, input)).rejects.toThrow("모의");
    expect(await db.splitLot.count()).toBe(0);
  });

  it("토스 관측은 같은 시세를 중복 처리하지 않고 과거 관측을 거부한다", async () => {
    const created = await createSimulation(db, { ...config, source: "toss" });
    const input = {
      requestKey: "quote-1",
      source: "toss" as const,
      prices: [10000],
      observedAt: "2026-10-30T01:00:00Z",
    };
    await runSimulation(db, created.id, input);
    await expect(
      runSimulation(db, created.id, {
        ...input,
        requestKey: "quote-2",
        observedAt: "2026-10-30T00:59:00Z",
      }),
    ).rejects.toThrow("이전");
    expect((await loadSimulation(db, created.id)).state.lots).toHaveLength(1);
  });
});
