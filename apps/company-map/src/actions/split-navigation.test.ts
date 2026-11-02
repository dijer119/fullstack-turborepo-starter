import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ liveRows: vi.fn(), simRows: vi.fn(), createLive: vi.fn(), createSim: vi.fn(), accounts: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => ({ db: { splitLiveStrategy: { findMany: mocks.liveRows }, splitSimulation: { findMany: mocks.simRows } } }));
vi.mock("@/lib/toss/client", () => ({ getAccounts: mocks.accounts, isTossConfigured: () => true }));
vi.mock("@/lib/split/live-toss", () => ({ tossLiveDeps: vi.fn() }));
vi.mock("@/lib/split/toss-source", () => ({ getTossObservation: vi.fn() }));
vi.mock("@/lib/split/live-run", () => ({ createLiveStrategy: mocks.createLive }));
vi.mock("@/lib/split/run", () => ({ createSimulation: mocks.createSim }));
import { createSplitLive, listSplitLive } from "./split-live";
import { createSplitSimulation, listSplitSimulations } from "./split";
const config = { name: "테스트", symbol: "005930", market: "KR" as const, accountSeq: 1, initialCash: 1000000, trancheBudget: 100000, maxTranches: 10, buyDropPct: 10, takeProfitPct: 10, feeBufferPct: 1 };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.liveRows.mockResolvedValue([]); mocks.simRows.mockResolvedValue([]);
  mocks.accounts.mockResolvedValue([{ accountSeq: 1, accountType: "BROKERAGE" }]);
  mocks.createLive.mockResolvedValue({ id: "created-live" }); mocks.createSim.mockResolvedValue({ id: "created-sim" });
});
describe("분할매매 목록·상세 경로", () => {
  it("등록 성공은 생성 ID를 반환하고 하위 상세 캐시도 무효화한다", async () => {
    expect(await createSplitLive(config)).toMatchObject({ ok: true, id: "created-live" });
    expect(await createSplitSimulation({ ...config, source: "manual", feePct: 0, sellTaxPct: 0 })).toMatchObject({ ok: true, id: "created-sim" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/stocks/split", "layout");
  });
  it("계좌 확인이나 생성이 실패하면 상세 이동용 ID를 반환하지 않는다", async () => {
    mocks.accounts.mockResolvedValue([]);
    expect(await createSplitLive(config)).toMatchObject({ ok: false, id: undefined });
    expect(mocks.createLive).not.toHaveBeenCalled();
    mocks.accounts.mockResolvedValue([{ accountSeq: 1, accountType: "BROKERAGE" }]);
    mocks.createLive.mockRejectedValue(new Error("저장 실패"));
    expect(await createSplitLive(config)).toMatchObject({ ok: false, id: undefined });
  });
  it("실거래 상세는 선택한 ID와 최근 주문만 조회한다", async () => {
    await listSplitLive("selected-live");
    expect(mocks.liveRows).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "selected-live" }, include: expect.objectContaining({ orders: { orderBy: { sequence: "desc" }, take: 20 } }) }));
    await listSplitLive(undefined, false);
    expect(mocks.liveRows).toHaveBeenLastCalledWith(expect.objectContaining({ where: undefined, include: expect.objectContaining({ orders: { orderBy: { sequence: "desc" }, where: { status: { in: ["submitting", "submit_unknown", "submitted", "cost_pending", "blocked"] } } } }) }));
  });
  it("모의 상세는 선택한 ID만 조회하고 목록에서는 실행 이력을 제외한다", async () => {
    await listSplitSimulations("selected-sim");
    expect(mocks.simRows).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "selected-sim" } }));
    await listSplitSimulations(undefined, false);
    expect(mocks.simRows).toHaveBeenLastCalledWith(expect.objectContaining({ include: expect.objectContaining({ runs: { orderBy: { createdAt: "desc" }, take: 0 } }) }));
  });
});
