import { describe, expect, it } from "vitest";
import { drawdownPct, drawdownRatio, pickSymbol, seedPeak, updatePeak } from "./peak";

describe("updatePeak", () => {
  it("신고가면 갱신, 아니면 유지", () => {
    expect(updatePeak(700, 746.16)).toBe(746.16);
    expect(updatePeak(746.16, 715.87)).toBe(746.16);
    expect(updatePeak(746.16, 746.16)).toBe(746.16); // 동일가는 유지
  });

  it("비정상 입력은 기존 peak 유지", () => {
    expect(updatePeak(746.16, Number.NaN)).toBe(746.16);
    expect(updatePeak(746.16, 0)).toBe(746.16);
    expect(updatePeak(746.16, -5)).toBe(746.16);
  });
});

describe("drawdownPct / drawdownRatio", () => {
  it("하락은 음수, 2026-08-27 실측값 재현", () => {
    // QQQ 현재가 715.87 / 200봉 최고종가 746.16 → −4.06%
    expect(drawdownPct(715.87, 746.16)).toBeCloseTo(-4.06, 2);
    expect(drawdownRatio(715.87, 746.16)).toBeCloseTo(-0.0406, 4);
  });

  it("최고가와 같으면 0", () => {
    expect(drawdownPct(746.16, 746.16)).toBe(0);
  });

  it("peak가 0 이하거나 비정상이면 0", () => {
    expect(drawdownPct(700, 0)).toBe(0);
    expect(drawdownPct(Number.NaN, 746.16)).toBe(0);
  });
});

describe("pickSymbol", () => {
  const pair = { baseSymbol: "QQQ", leverSymbol: "QLD" };

  it("낙폭이 임계 미달이면 base", () => {
    const r = pickSymbol({ prevClose: 715.87, peak: 746.16, thresholdPct: 10, ...pair });
    expect(r.symbol).toBe("QQQ");
    expect(r.leveraged).toBe(false);
    expect(r.drawdownPct).toBeCloseTo(-4.06, 2);
  });

  it("낙폭이 임계 이상이면 lever", () => {
    const r = pickSymbol({ prevClose: 650, peak: 746.16, thresholdPct: 10, ...pair });
    expect(r.symbol).toBe("QLD");
    expect(r.leveraged).toBe(true);
  });

  it("정확히 임계값이면 lever (경계 포함)", () => {
    const r = pickSymbol({ prevClose: 90, peak: 100, thresholdPct: 10, ...pair });
    expect(r.leveraged).toBe(true);
  });

  it("표시값이 반올림으로 임계에 닿아도 판정은 반올림 전 값 기준", () => {
    // 실제 낙폭 −9.996% → 표시 −10.0 이지만 레버리지는 아님
    const r = pickSymbol({ prevClose: 90.004, peak: 100, thresholdPct: 10, ...pair });
    expect(r.drawdownPct).toBeCloseTo(-10, 1);
    expect(r.leveraged).toBe(false);
  });

  it("임계 15% 설정도 동작", () => {
    expect(pickSymbol({ prevClose: 88, peak: 100, thresholdPct: 15, ...pair }).leveraged).toBe(false);
    expect(pickSymbol({ prevClose: 85, peak: 100, thresholdPct: 15, ...pair }).leveraged).toBe(true);
  });
});

describe("seedPeak", () => {
  it("일봉 중 최고 종가와 그 날짜", () => {
    expect(
      seedPeak([
        { date: "2026-06-01", close: 700 },
        { date: "2026-06-02", close: 746.16 },
        { date: "2026-08-26", close: 715.87 },
      ]),
    ).toEqual({ price: 746.16, date: "2026-06-02" });
  });

  it("빈 배열이면 null", () => {
    expect(seedPeak([])).toBeNull();
  });

  it("동일 최고가가 여럿이면 가장 이른 날짜", () => {
    expect(
      seedPeak([
        { date: "2026-06-02", close: 746.16 },
        { date: "2026-07-02", close: 746.16 },
      ]),
    ).toEqual({ price: 746.16, date: "2026-06-02" });
  });
});
