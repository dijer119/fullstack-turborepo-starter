import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  initialState,
  summarize,
  validateConfig,
  type SplitConfig,
} from "./engine";

const config: SplitConfig = {
  symbol: "005930",
  name: "테스트",
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

function replay(prices: number[], c = config) {
  let state = initialState(c);
  for (const price of prices) state = advanceSimulation(c, state, price);
  return state;
}

describe("분할매매 모의 장부", () => {
  it("하락에 차수별 매수, 반등에 3차만 매도하고 전체 평가손실을 보존한다", () => {
    const state = replay([10000, 9000, 8100, 8910]);
    expect(state.lots.map((l) => [l.slot, l.quantity, l.remainingQty])).toEqual(
      [
        [1, 10, 10],
        [2, 11, 11],
        [3, 12, 0],
      ],
    );
    expect(summarize(config, state)).toMatchObject({
      holdingQty: 21,
      realizedPnl: 9720,
      unrealizedPnl: -11890,
      totalPnl: -2170,
      equity: 297830,
    });
  });

  it("매도한 하위 차수만 새 회차로 재진입하며 상위 원가를 유지한다", () => {
    const state = replay([10000, 9000, 8100, 8910, 8100]);
    expect(
      state.lots.map((l) => [l.slot, l.generation, l.buyPrice, l.remainingQty]),
    ).toEqual([
      [1, 1, 10000, 10],
      [2, 1, 9000, 11],
      [3, 1, 8100, 0],
      [3, 2, 8100, 12],
    ]);
    expect(state.cash).toBe(13520);
  });

  it("관측 한 번에 한 차수만 매수하고 주문 시점 가격으로 산다", () => {
    const state = replay([10000, 7000]);
    expect(state.lots.map((l) => l.buyPrice)).toEqual([10000, 7000]);
    expect(state.lots).toHaveLength(2);
    expect(state.lots[1].closedStep).toBeNull();
  });

  it("매수한 관측에서 같은 물량을 팔지 않고 전량 청산 후 종료한다", () => {
    const state = replay([10000, 11000, 9000]);
    expect(state.status).toBe("completed");
    expect(state.lots).toHaveLength(1);
    expect(state.cash).toBe(310000);
    expect(state.stepCount).toBe(2);
  });

  it("매수비용을 차수 예산에 포함하고 매도 수수료·세금까지 총손익에 반영한다", () => {
    const c = { ...config, feePct: 1, sellTaxPct: 2 };
    const state = replay([10000, 11000], c);
    expect(state.lots[0].quantity).toBe(9);
    expect(state.lots[0].buyCost).toBe(90900);
    expect(state.cash).toBe(305130);
    expect(summarize(c, state)).toMatchObject({
      realizedPnl: 5130,
      totalPnl: 5130,
      equity: 305130,
    });
  });

  it("예산으로 한 주를 못 사면 잔액과 장부를 보존한다", () => {
    const state = replay([200000]);
    expect(state.lots).toHaveLength(0);
    expect(state.cash).toBe(config.initialCash);
    expect(state.note).toContain("1주");
  });

  it("반올림한 비용이 예산과 같으면 부동소수 나눗셈 오차로 매수를 건너뛰지 않는다", () => {
    const c: SplitConfig = {
      ...config,
      symbol: "AAPL",
      market: "US",
      initialCash: 1.155,
      trancheBudget: 1.155,
      maxTranches: 1,
      feePct: 5,
    };
    const state = replay([1.1], c);
    expect(state.lots[0]?.quantity).toBe(1);
    expect(state.cash).toBe(0);
  });

  it("금액·차수·비율의 NaN/무한대/잘못된 예산을 거부한다", () => {
    for (const patch of [
      { initialCash: NaN },
      { trancheBudget: Infinity },
      { maxTranches: 2.5 },
      { maxTranches: 0 },
      { buyDropPct: 100 },
      { takeProfitPct: 0 },
      { feePct: -1 },
      { sellTaxPct: NaN },
      { initialCash: 100 },
      { market: "OTHER" },
      { source: "live" },
      { symbol: "" },
    ])
      expect(() =>
        validateConfig({ ...config, ...patch } as SplitConfig),
      ).toThrow();
  });

  it("잘못된 가격을 거부하고 USD도 정수주·소수 가격으로 계산한다", () => {
    for (const price of [0, -1, NaN, Infinity, 1e12]) {
      expect(() =>
        advanceSimulation(config, initialState(config), price),
      ).toThrow();
    }
    const c: SplitConfig = {
      ...config,
      symbol: "AAPL",
      market: "US",
      initialCash: 300,
      trancheBudget: 100,
    };
    const state = replay([10.25, 9.225, 8.3025, 9.1328], c);
    const summary = summarize(c, state);
    expect(state.lots.every((l) => Number.isInteger(l.quantity))).toBe(true);
    expect(summary.equity).toBeCloseTo(c.initialCash + summary.totalPnl, 4);
  });
});
