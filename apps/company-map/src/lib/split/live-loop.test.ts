import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  stop: false,
  tick: vi.fn(),
  deps: { killed: () => false },
}));
vi.mock("../../../worker/db", () => ({ db: {} }));
vi.mock("./live-tick", () => ({ splitLiveTick: state.tick }));
vi.mock("./live-toss", () => ({ tossLiveDeps: () => state.deps }));
import { splitLiveLoop } from "../../../worker/split-live-loop";
beforeEach(() => {
  state.stop = false;
  state.tick.mockReset();
  state.deps.killed = () => false;
});
it("종료 요청 후에는 감시를 반복하지 않고 진행 중인 신규 주문 가드도 닫는다", async () => {
  state.tick.mockImplementation(async () => {
    state.stop = true;
    expect(state.deps.killed()).toBe(true);
    return { checked: 1, placed: 0, errors: 0 };
  });
  await splitLiveLoop(() => state.stop);
  expect(state.tick).toHaveBeenCalledTimes(1);
});
