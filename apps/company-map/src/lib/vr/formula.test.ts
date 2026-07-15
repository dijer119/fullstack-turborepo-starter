import { describe, expect, it } from "vitest";
import { band, nextV, round2 } from "./formula";

// 픽스처: 라오어 62주차 영상 실측값 (2022-06-18)
const WEEK62 = { v: 15205.76, pool: 76.73, g: 11, evalAmount: 5282.11, contribution: 250 };

describe("nextV", () => {
  it("실력공식 — 62주차 실측 13966.69 재현", () => {
    expect(nextV({ ...WEEK62, formula: "skill" })).toBe(13966.69);
  });

  it("기본공식 — 카페 원문 예시: V 9000 + Pool 1000/G 10 + 적립 250 = 9350", () => {
    expect(nextV({ v: 9000, pool: 1000, g: 10, evalAmount: 0, contribution: 250, formula: "basic" })).toBe(9350);
  });

  it("실력공식은 E=V일 때 기본공식과 일치", () => {
    const base = { v: 10000, pool: 500, g: 10, evalAmount: 10000, contribution: 0 };
    expect(nextV({ ...base, formula: "skill" })).toBe(nextV({ ...base, formula: "basic" }));
  });

  it("거치식(적립 0)도 동작", () => {
    expect(nextV({ v: 10000, pool: 0, g: 10, evalAmount: 10000, contribution: 0, formula: "skill" })).toBe(10000);
  });
});

describe("band", () => {
  it("±15% — 62주차 밴드 11871.69/16061.69 재현", () => {
    expect(band(13966.69, 15)).toEqual({ min: 11871.69, max: 16061.69 });
  });
});

describe("round2", () => {
  it("소수 둘째 자리 반올림", () => {
    expect(round2(50.9514)).toBe(50.95);
    expect(round2(50.955)).toBe(50.96);
  });
});
