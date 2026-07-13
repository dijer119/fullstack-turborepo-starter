import { describe, it, expect } from "vitest";
import { applyFills, sortFills, derivePositionFromFills, crossCheckHolding, type FillEvent } from "./sync";

const f = (o: Partial<FillEvent>): FillEvent => ({
  side: "BUY", kind: "loc_star_half", quantity: 2, filledQty: 2, filledPrice: 50, tradeDate: "2026-07-13",
  ...o,
});

describe("applyFills — ΔT (주문 단위 비례, 스펙 해석 ①)", () => {
  it("첫매수 전량 체결: +1", () => {
    const r = applyFills({ t: 0, cash: 10000 }, [f({ kind: "first_big_loc", quantity: 4, filledQty: 4, filledPrice: 50 })]);
    expect(r.t).toBeCloseTo(1, 10);
    expect(r.cash).toBeCloseTo(10000 - 200, 10);
  });
  it("전반 ½ 주문 1건 전량 체결: +0.5", () => {
    const r = applyFills({ t: 3, cash: 9000 }, [f({ kind: "loc_star_half", quantity: 2, filledQty: 2 })]);
    expect(r.t).toBeCloseTo(3.5, 10);
  });
  it("전반 두 주문 모두 체결: +1 (0.5+0.5)", () => {
    const r = applyFills({ t: 3, cash: 9000 }, [
      f({ kind: "loc_star_half" }), f({ kind: "loc_avg_half" }),
    ]);
    expect(r.t).toBeCloseTo(4, 10);
  });
  it("부분체결 비례: ½ 주문 2주 중 1주 → +0.25", () => {
    const r = applyFills({ t: 3, cash: 9000 }, [f({ kind: "loc_star_half", quantity: 2, filledQty: 1 })]);
    expect(r.t).toBeCloseTo(3.25, 10);
  });
  it("후반 전액 주문 전량 체결: +1", () => {
    const r = applyFills({ t: 25, cash: 3000 }, [f({ kind: "loc_star_full", quantity: 5, filledQty: 5 })]);
    expect(r.t).toBeCloseTo(26, 10);
  });
});

describe("applyFills — 매도 배수 (부분체결이어도 전량 기준, 스펙 확정)", () => {
  it("쿼터매도: T×0.75, 잔금 += 체결대금", () => {
    const r = applyFills({ t: 10, cash: 5000 }, [
      f({ side: "SELL", kind: "sell_loc_star", quantity: 25, filledQty: 25, filledPrice: 54.2 }),
    ]);
    expect(r.t).toBeCloseTo(7.5, 10);
    expect(r.cash).toBeCloseTo(5000 + 25 * 54.2, 10);
  });
  it("지정가매도 후 같은 날 매수 체결: ×0.25 먼저 → 매수 ΔT (원문 예시 ③C: T=10 → 3.5)", () => {
    const r = applyFills({ t: 10, cash: 5000 }, [
      f({ kind: "loc_star_half", quantity: 2, filledQty: 2, filledPrice: 49, tradeDate: "2026-07-13" }),
      f({ side: "SELL", kind: "sell_lim_target", quantity: 75, filledQty: 75, filledPrice: 57.5, tradeDate: "2026-07-13" }),
      f({ kind: "loc_avg_half", quantity: 2, filledQty: 2, filledPrice: 49, tradeDate: "2026-07-13" }),
    ]);
    // 정렬: sell_lim_target 먼저 → 10×0.25=2.5 → +0.5+0.5 → 3.5
    expect(r.t).toBeCloseTo(3.5, 10);
  });
  it("체결수량 0 이벤트는 무시", () => {
    const r = applyFills({ t: 5, cash: 1000 }, [f({ filledQty: 0 })]);
    expect(r).toEqual({ t: 5, cash: 1000 });
  });
  it("쿼터매도 부분체결이어도 T×0.75 (체결비율 무관)", () => {
    const r = applyFills({ t: 10, cash: 5000 }, [
      f({ side: "SELL", kind: "sell_loc_star", quantity: 25, filledQty: 10, filledPrice: 54.2 }),
    ]);
    expect(r.t).toBeCloseTo(7.5, 10);
    expect(r.cash).toBeCloseTo(5000 + 10 * 54.2, 10);
  });
});

describe("sortFills — 거래일 → 종류 우선순위(지정가매도→쿼터→매수)", () => {
  it("날짜가 다르면 날짜 우선", () => {
    const s = sortFills([
      f({ tradeDate: "2026-07-14", kind: "sell_lim_target", side: "SELL" }),
      f({ tradeDate: "2026-07-13", kind: "loc_star_half" }),
    ]);
    expect(s[0].tradeDate).toBe("2026-07-13");
  });
});

describe("derivePositionFromFills — dryRun 포지션 파생", () => {
  it("매수 가중평균, 매도는 수량만 감소(평단 유지)", () => {
    const pos = derivePositionFromFills([
      f({ kind: "first_big_loc", quantity: 4, filledQty: 4, filledPrice: 56, tradeDate: "2026-07-10" }),
      f({ kind: "loc_avg_half", quantity: 2, filledQty: 2, filledPrice: 50, tradeDate: "2026-07-11" }),
      f({ side: "SELL", kind: "sell_loc_star", quantity: 1, filledQty: 1, filledPrice: 57, tradeDate: "2026-07-12" }),
    ]);
    // avg = (4×56 + 2×50)/6 = 54, qty = 6−1 = 5
    expect(pos.holdingQty).toBe(5);
    expect(pos.avgPrice).toBeCloseTo(54, 10);
  });
  it("체결 없음 → 보유 0, 평단 null", () => {
    expect(derivePositionFromFills([])).toEqual({ avgPrice: null, holdingQty: 0 });
  });
});

describe("crossCheckHolding", () => {
  it("Σ매수−Σ매도 = 실보유 → ok", () => {
    const fills = [
      f({ quantity: 4, filledQty: 4 }),
      f({ side: "SELL", kind: "sell_loc_star", quantity: 1, filledQty: 1 }),
    ];
    expect(crossCheckHolding(fills, 3)).toEqual({ ok: true, expected: 3 });
    expect(crossCheckHolding(fills, 5).ok).toBe(false);
  });
  it("filledPrice 0 이벤트는 무시", () => {
    const fills = [
      f({ quantity: 4, filledQty: 4, filledPrice: 50 }),
      f({ side: "SELL", kind: "sell_loc_star", quantity: 2, filledQty: 2, filledPrice: 0 }),
    ];
    expect(crossCheckHolding(fills, 4)).toEqual({ ok: true, expected: 4 });
  });
});
