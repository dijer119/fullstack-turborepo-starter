import { describe, it, expect } from "vitest";
import { rsi14 } from "./rsi";

describe("rsi14", () => {
  it("데이터 부족(15개 미만)이면 null", () => {
    expect(rsi14(Array.from({ length: 14 }, (_, i) => i + 1))).toBeNull();
  });

  it("연속 상승만 있으면 100", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
    expect(rsi14(closes)).toBe(100);
  });

  it("연속 하락만 있으면 0", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 - i);
    expect(rsi14(closes)).toBeCloseTo(0, 5);
  });

  it("등락 반복(같은 폭)은 50 근처", () => {
    // +1/-1 반복 → 평균 이득 ≈ 평균 손실 → RSI ≈ 50
    const closes: number[] = [100];
    for (let i = 0; i < 60; i++) closes.push(closes[closes.length - 1] + (i % 2 === 0 ? 1 : -1));
    const r = rsi14(closes);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(45);
    expect(r!).toBeLessThan(55);
  });

  it("상승 우세면 50 초과, 하락 우세면 50 미만", () => {
    const up: number[] = [100];
    for (let i = 0; i < 60; i++) up.push(up[up.length - 1] + (i % 3 === 2 ? -1 : 1)); // +1,+1,-1 반복
    const down: number[] = [100];
    for (let i = 0; i < 60; i++) down.push(down[down.length - 1] + (i % 3 === 2 ? 1 : -1));
    expect(rsi14(up)!).toBeGreaterThan(50);
    expect(rsi14(down)!).toBeLessThan(50);
  });
});
