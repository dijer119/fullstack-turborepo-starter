import { describe, it, expect, vi } from "vitest";
import { runCycle, type RunDeps, type RunPersistence, type CycleConfig } from "./run";

const cycle: CycleConfig = {
  id: "c1", symbol: "TQQQ", accountSeq: 7,
  principalUsd: 4000, splits: 40, profitTarget: 10, bigBuyPremium: 12, lossCut: 10,
  round: 0, dryRun: true,
};

function fakeDeps(over: Partial<RunDeps> = {}): RunDeps {
  return {
    getDefaultAccountSeq: vi.fn(async () => 7),
    getHoldingForSymbol: vi.fn(async () => null), // 보유 없음
    getCurrentPrice: vi.fn(async () => 50),
    getBuyingPowerUsd: vi.fn(async () => 100000),
    submitOrder: vi.fn(async () => ({ tossOrderId: "ord-1" })),
    ...over,
  };
}

function fakePersist() {
  const logged: unknown[] = [];
  const updated: unknown[] = [];
  const persist: RunPersistence = {
    logOrder: vi.fn(async (o) => { logged.push(o); }),
    updateCycle: vi.fn(async (id, data) => { updated.push({ id, data }); }),
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
