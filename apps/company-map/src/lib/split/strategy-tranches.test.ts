import { describe, expect, it } from "vitest";
import { summarizeTranches, matchesPositionFilter } from "./strategy-tranches";
const lot = (slot: number, remainingQty: number, buyPrice: number) => ({ slot, remainingQty, buyPrice });
describe("차수별 목록 요약", () => {
  it("매도한 과거 회차는 제외하고 부분 매도 잔량의 가중 매수가로 평가한다", () => {
    const result = summarizeTranches(3, "active", 110, [lot(1, 0, 200), lot(1, 2, 100), lot(1, 1, 80)], []);
    expect(result.cells[0]).toMatchObject({ slot: 1, quantity: 3, state: "held" });
    expect(result.cells[0].profitPct).toBeCloseTo((330 / 280 - 1) * 100);
    expect(result.profitPct).toEqual(result.cells[0].profitPct);
    expect(result.cells.map(c => c.state)).toEqual(["held", "buy_wait", "waiting"]);
  });
  it("이전 차수 보유 시 매도했던 차수 재진입을 감시하며 전량 매도 후는 1차만 대기한다", () => {
    expect(summarizeTranches(3, "active", 100, [lot(1, 1, 110), lot(2, 0, 90)], []).cells[1].state).toBe("buy_wait");
    expect(summarizeTranches(3, "active", 100, [lot(1, 0, 110), lot(2, 0, 90)], []).cells.map(c => c.state)).toEqual(["buy_wait", "closed", "waiting"]);
  });
  it("주문 확인 상태는 보유 수익률을 보존하고 다른 차수의 매수 대기를 막는다", () => {
    const result = summarizeTranches(3, "active", 90, [lot(1, 1, 100)], [{ slot: 1, side: "SELL", status: "cost_pending" }]);
    expect(result.cells[0]).toMatchObject({ state: "review", profitPct: -10, quantity: 1 });
    expect(result.cells[1].state).toBe("waiting");
    expect(result.pendingCount).toBe(1);
    expect(summarizeTranches(2, "active", null, [], [{ slot: 1, side: "BUY", status: "submitted" }]).cells[0].state).toBe("buy_pending");
  });
  it("시세 미확인·일시정지·종료를 매수 대기나 수익률 0으로 표시하지 않는다", () => {
    expect(summarizeTranches(2, "paused", null, [lot(1, 1, 100)], []).cells[0].profitPct).toBeNull();
    expect(summarizeTranches(2, "paused", null, [], []).cells[0].state).toBe("paused");
    expect(summarizeTranches(2, "completed", 100, [lot(1, 0, 90)], []).cells.map(c => c.state)).toEqual(["closed", "waiting"]);
  });
  it("전체·보유·감시·주문 확인 필터를 구분한다", () => {
    const row = { holdingQty: 0, status: "active", pendingCount: 0 };
    expect(matchesPositionFilter(row, "watching")).toBe(true);
    expect(matchesPositionFilter({ ...row, status: "paused" }, "watching")).toBe(false);
    expect(matchesPositionFilter({ ...row, pendingCount: 1 }, "watching")).toBe(false);
    expect(matchesPositionFilter({ ...row, pendingCount: 1 }, "pending")).toBe(true);
    expect(matchesPositionFilter({ ...row, holdingQty: 1 }, "held")).toBe(true);
    expect(matchesPositionFilter({ ...row, status: "completed" }, "all")).toBe(true);
  });
});
