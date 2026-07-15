import { describe, expect, it } from "vitest";
import { deriveHolding, isCycleBoundary, resolvePoolLimitPct } from "./run-vr";
import { nextV, band, round2 } from "./formula";
import { buyTable, sellTable } from "./order-table";

describe("isCycleBoundary", () => {
  it("사이클 시작 +14일 미만은 false, 이상은 true", () => {
    expect(isCycleBoundary("2026-07-01", "2026-07-14")).toBe(false);
    expect(isCycleBoundary("2026-07-01", "2026-07-15")).toBe(true);
    expect(isCycleBoundary("2026-07-01", "2026-07-20")).toBe(true); // 휴장 지나 첫 거래일도 true
  });
});

describe("deriveHolding", () => {
  it("seed + BUY − SELL 누적", () => {
    expect(
      deriveHolding([
        { side: "BUY", filledQty: 100 },  // seed
        { side: "BUY", filledQty: 2 },
        { side: "SELL", filledQty: 1 },
        { side: "BUY", filledQty: null }, // 미체결은 무시
      ]),
    ).toBe(101);
  });
});

describe("resolvePoolLimitPct", () => {
  it("manual이면 poolLimitPct 그대로", () => {
    expect(
      resolvePoolLimitPct(
        { poolLimitMode: "manual", poolLimitPct: 33, type: "accumulate", startDate: "2026-01-01" },
        "2026-07-15",
      ),
    ).toBe(33);
  });

  it("auto면 유형·주차 스케줄", () => {
    expect(
      resolvePoolLimitPct(
        { poolLimitMode: "auto", poolLimitPct: null, type: "accumulate", startDate: "2026-07-01" },
        "2026-07-15",
      ),
    ).toBe(75);
  });
});

describe("62주차 사이클 시나리오 (공식→밴드→표 통합)", () => {
  it("V 갱신 → 밴드 → 매수·매도표가 슬라이드와 일치", () => {
    // 적립 전 Pool 76.73으로 V 갱신, 적립 후 Pool 326.73으로 budget
    const v = nextV({ v: 15205.76, pool: 76.73, g: 11, evalAmount: 5282.11, contribution: 250, formula: "skill" });
    expect(v).toBe(13966.69);
    const b = band(v, 15);
    expect(b).toEqual({ min: 11871.69, max: 16061.69 });
    const pool = round2(76.73 + 250);
    expect(pool).toBe(326.73);
    const buys = buyTable(233, b, round2(pool * 0.75));
    expect(buys.map((o) => o.price)).toEqual([50.95, 50.73, 50.52, 50.3]);
    const sells = sellTable(233, b);
    expect(sells.slice(0, 2).map((o) => o.price)).toEqual([68.93, 69.23]);
  });
});
