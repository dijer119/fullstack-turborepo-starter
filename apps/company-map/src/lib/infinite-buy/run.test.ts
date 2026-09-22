import { describe, it, expect, vi } from "vitest";
import { runCycle, type RunDeps, type RunPersistence, type CycleConfig } from "./run";

const cycle: CycleConfig = {
  id: "c1", symbol: "TQQQ", accountSeq: 7,
  principalUsd: 4000, splits: 40, profitTarget: 10, bigBuyPremium: 12, lossCut: 10,
  round: 0, dryRun: true, version: "v1",
};

function fakeDeps(over: Partial<RunDeps> = {}): RunDeps {
  return {
    getDefaultAccountSeq: vi.fn(async () => 7),
    getHoldingForSymbol: vi.fn(async () => null), // 보유 없음
    getCurrentPrice: vi.fn(async () => 50),
    getBuyingPowerUsd: vi.fn(async () => 100000),
    submitOrder: vi.fn(async () => ({ tossOrderId: "ord-1" })),
    syncFills: vi.fn(async () => {}),
    ...over,
  };
}

function fakePersist(over: Partial<RunPersistence> = {}) {
  const logged: unknown[] = [];
  const updated: unknown[] = [];
  const persist: RunPersistence = {
    logOrder: vi.fn(async (o) => { logged.push(o); }),
    updateCycle: vi.fn(async (id, data) => { updated.push({ id, data }); }),
    getBoughtAmount: vi.fn(async () => 0),
    ...over,
  };
  return { persist, logged, updated };
}

describe("runCycle", () => {
  it("dryRun: submitOrder 호출 안 함, simulated 로깅", async () => {
    const deps = fakeDeps();
    const { persist, logged } = fakePersist();
    await runCycle(persist, deps, cycle, "2026-06-29", false);
    expect(deps.submitOrder).not.toHaveBeenCalled();
    expect(logged).toHaveLength(1); // first_market
    expect((logged[0] as { status: string }).status).toBe("simulated");
  });

  it("live: submitOrder 호출, submitted 로깅 + 회차 갱신", async () => {
    const deps = fakeDeps();
    const { persist, logged, updated } = fakePersist();
    await runCycle(persist, deps, { ...cycle, dryRun: false }, "2026-06-29", false);
    expect(deps.submitOrder).toHaveBeenCalledTimes(1);
    expect((logged[0] as { status: string; tossOrderId: string | null }).status).toBe("submitted");
    expect(updated[0]).toEqual({ id: "c1", data: { round: 1, lastRunDate: "2026-06-29" } });
  });

  it("킬스위치: live여도 제출 안 하고 simulated", async () => {
    const deps = fakeDeps();
    const { persist, logged } = fakePersist();
    await runCycle(persist, deps, { ...cycle, dryRun: false }, "2026-06-29", true);
    expect(deps.submitOrder).not.toHaveBeenCalled();
    expect((logged[0] as { status: string }).status).toBe("simulated");
  });

  it("매수가능금액 부족: 해당 BUY는 skipped 로깅", async () => {
    const deps = fakeDeps({ getBuyingPowerUsd: vi.fn(async () => 10) }); // 2*50=100 > 10
    const { persist, logged } = fakePersist();
    await runCycle(persist, deps, { ...cycle, dryRun: false }, "2026-06-29", false);
    expect(deps.submitOrder).not.toHaveBeenCalled();
    expect((logged[0] as { status: string }).status).toBe("skipped");
  });

  it("리셋: resetAfter면 round 0으로", async () => {
    const deps = fakeDeps({
      getHoldingForSymbol: vi.fn(async () => ({ avgPrice: 50, quantity: 0, currentPrice: 50, pnlPct: 0 })),
    });
    const { persist, updated } = fakePersist();
    await runCycle(persist, deps, { ...cycle, dryRun: false, round: 40 }, "2026-06-29", false);
    expect(updated[0]).toEqual({ id: "c1", data: { round: 0, lastRunDate: "2026-06-29" } });
  });
});

// ── v2.2: 체결 기반 T ──
// T는 실행 횟수가 아니라 실제 집행액으로 정해지므로, 매 실행 전에 체결을 받아와야 한다.
describe("runCycle — v2.2 체결 동기화", () => {
  const v22 = {
    ...cycle, version: "v2.2" as const, principalUsd: 8000, round: 30, dryRun: false,
  };
  const holding = {
    avgPrice: 70.91458, quantity: 12, currentPrice: 72.64, pnlPct: 2.4,
  };

  it("실행 전에 체결을 동기화한다", async () => {
    const deps = fakeDeps({ getHoldingForSymbol: vi.fn(async () => holding) });
    const { persist } = fakePersist();
    await runCycle(persist, deps, v22, "2026-09-19", false);
    expect(deps.syncFills).toHaveBeenCalledWith("c1");
  });

  it("누적 매수 체결액으로 T를 정한다 (round=30이어도 T=15.77이면 전반전)", async () => {
    const deps = fakeDeps({ getHoldingForSymbol: vi.fn(async () => holding) });
    const { persist, logged } = fakePersist({ getBoughtAmount: vi.fn(async () => 3153.44) });
    await runCycle(persist, deps, v22, "2026-09-19", false);
    const buys = (logged as Array<{ side: string; kind: string }>)
      .filter((o) => o.side === "BUY").map((o) => o.kind);
    expect(buys).toEqual(["loc_avg", "loc_var"]);
  });

  it("v1은 체결 동기화를 하지 않는다", async () => {
    const deps = fakeDeps();
    const { persist } = fakePersist();
    await runCycle(persist, deps, cycle, "2026-09-19", false);
    expect(deps.syncFills).not.toHaveBeenCalled();
  });
});

// v2.2 dryRun은 모의 체결을 기록하지 않아 체결액이 늘 0이다.
// 체결 기반 T를 그대로 적용하면 T가 0에 고정되므로, dryRun은 종전대로 round를 T로 쓴다.
describe("runCycle — v2.2 dryRun은 round를 T로 쓴다", () => {
  const holding = { avgPrice: 70.91458, quantity: 12, currentPrice: 72.64, pnlPct: 2.4 };

  it("dryRun이면 체결 동기화를 하지 않는다", async () => {
    const deps = fakeDeps({ getHoldingForSymbol: vi.fn(async () => holding) });
    const { persist } = fakePersist();
    await runCycle(persist, deps, { ...cycle, version: "v2.2", principalUsd: 8000, round: 30, dryRun: true }, "2026-09-19", false);
    expect(deps.syncFills).not.toHaveBeenCalled();
  });

  it("dryRun round=30이면 후반전 규칙(loc_var 단건)이 적용된다", async () => {
    const deps = fakeDeps({ getHoldingForSymbol: vi.fn(async () => holding) });
    const { persist, logged } = fakePersist();
    await runCycle(persist, deps, { ...cycle, version: "v2.2", principalUsd: 8000, round: 30, dryRun: true }, "2026-09-19", false);
    const buys = (logged as Array<{ side: string; kind: string }>)
      .filter((o) => o.side === "BUY").map((o) => o.kind);
    expect(buys).toEqual(["loc_var"]);
  });
});
