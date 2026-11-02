import { describe, expect, it } from "vitest";
import { strategyProgress } from "./progress";
const lot = (slot: number, generation: number, boughtQty: number, remainingQty: number, realizedPnl: number, pendingOrderCount = 0) => ({ slot, generation, boughtQty, remainingQty, realizedPnl, pendingOrderCount });
describe("종목 진행 현황", () => {
  it("차수별 전체 회차를 합산하고 부분 매도는 반복 완료로 세지 않는다", () => {
    const result = strategyProgress(3, [lot(1, 1, 10, 10, 0), lot(2, 1, 10, 0, 100), lot(2, 2, 10, 4, 60), lot(3, 1, 5, 0, -30)]);
    expect(result).toMatchObject({ entries: 4, completed: 2, holdingQty: 14, holdingSlots: 2, realizedPnl: 130 });
    expect(result.rows[1]).toMatchObject({ entries: 2, completed: 1, holdingQty: 4, realizedPnl: 160, completionPct: 50 });
  });
  it("매수가 없거나 전량 매도 후 주문 정산이 남은 회차는 완료로 세지 않는다", () => {
    const result = strategyProgress(3, [lot(1, 1, 0, 0, 0), lot(2, 1, 3, 0, 10, 1), lot(2, 2, 3, 0, 20)]);
    expect(result).toMatchObject({ entries: 2, completed: 1, realizedPnl: 30, pendingOrders: 1, holdingSlots: 0 });
    expect(result.rows[2]).toMatchObject({ entries: 0, completed: 0, completionPct: 0 });
  });
  it("같은 차수의 여러 재진입과 손실을 보존한다", () => {
    const result = strategyProgress(1, [lot(1, 1, 1, 0, 10), lot(1, 2, 1, 0, -15), lot(1, 3, 2, 2, 0)]);
    expect(result).toMatchObject({ completed: 2, entries: 3, holdingQty: 2, realizedPnl: -5 });
  });
});
