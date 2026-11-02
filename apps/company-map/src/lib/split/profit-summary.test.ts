import { describe, expect, it } from "vitest";
import { sumRealizedProfits } from "./profit-summary";

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
