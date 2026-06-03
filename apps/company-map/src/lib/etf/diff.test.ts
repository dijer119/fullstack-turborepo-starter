import { describe, it, expect } from "vitest";
import { topN, diffHoldings } from "./diff";
import type { Holding } from "./types";

const mk = (code: string, weight: number, shares = 100): Holding => ({
  constituentCode: code, constituentName: `종목${code}`, weight, shares, amount: weight * 1000,
});

describe("topN", () => {
  it("비중 내림차순 상위 N만 남긴다", () => {
    const hs = [mk("A", 5), mk("B", 30), mk("C", 10)];
    const top2 = topN(hs, 2);
    expect(top2.map((h) => h.constituentCode)).toEqual(["B", "C"]);
  });
});

describe("diffHoldings", () => {
  it("신규/유지/이탈과 비중·주식수 증감을 계산한다", () => {
    const latest = [mk("A", 40, 120), mk("B", 35, 100), mk("C", 25, 50)]; // C 신규
    const prev = [mk("A", 30, 100), mk("B", 45, 100), mk("D", 25, 80)];   // D 이탈
    const changes = diffHoldings(latest, prev);

    const byCode = Object.fromEntries(changes.map((c) => [c.constituentCode, c]));
    expect(byCode["A"].status).toBe("유지");
    expect(byCode["A"].weightDelta).toBeCloseTo(10);
    expect(byCode["A"].sharesDelta).toBe(20);
    expect(byCode["C"].status).toBe("신규");
    expect(byCode["C"].weightDelta).toBeNull();
    expect(byCode["D"].status).toBe("이탈");
    expect(byCode["D"].weight).toBeNull();
    expect(changes[changes.length - 1].constituentCode).toBe("D"); // 이탈은 맨 뒤
  });

  it("직전 스냅샷이 없으면 전부 유지로 표기하고 증감은 null", () => {
    const latest = [mk("A", 60), mk("B", 40)];
    const changes = diffHoldings(latest, null);
    expect(changes.every((c) => c.status === "유지")).toBe(true);
    expect(changes.every((c) => c.weightDelta === null)).toBe(true);
  });
});
