import { describe, expect, it } from "vitest";
import { summarizeHoldings, sumRealizedProfits } from "./profit-summary";

describe("현재 보유 원가 대비 누적 실현수익률", () => {
  const strategies = [
    { market: "KR", realizedPnl: 15, lots: [{ remainingCost: 100 }, { remainingCost: 900 }] },
    { market: "KR", realizedPnl: 25, lots: [{ remainingCost: 0 }] },
    { market: "US", realizedPnl: -2, lots: [{ remainingCost: 25 }] },
  ];
  it("전량 매도한 회차의 손익까지 통화별로 합산하고 남은 원가로 나눈다", () => {
    expect(summarizeHoldings(strategies, "KR")).toEqual({ cost: 1000, returnPct: 4 });
    expect(summarizeHoldings(strategies, "US")).toEqual({ cost: 25, returnPct: -8 });
  });
  it("전량 청산 후 수익금만 남으면 수익률은 계산하지 않는다", () => {
    expect(summarizeHoldings([strategies[1]], "KR")).toEqual({ cost: 0, returnPct: null });
  });
});

describe("누적 수익금 집계", () => {
  it("전략별 순손익을 합산하되 원화와 달러를 섞지 않는다", () => {
    expect(
      sumRealizedProfits([
        { market: "KR", realizedPnl: 9720 },
        { market: "US", realizedPnl: 2.5 },
        { market: "KR", realizedPnl: -1200 },
        { market: "US", realizedPnl: -0.75 },
      ]),
    ).toEqual({ KR: 8520, US: 1.75 });
  });

  it("손실도 누적 금액에 포함하고 소수 금액의 합계는 소수 넷째 자리로 유지한다", () => {
    expect(
      sumRealizedProfits([
        { market: "KR", realizedPnl: -100 },
        { market: "US", realizedPnl: 0.1 },
        { market: "US", realizedPnl: 0.2 },
      ]),
    ).toEqual({ KR: -100, US: 0.3 });
  });
});
