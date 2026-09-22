import { describe, it, expect } from "vitest";
import { splitDateWindows, collectAcrossWindows } from "./date-windows";

describe("splitDateWindows", () => {
  it("범위가 최대 일수 이내면 윈도우 1개", () => {
    expect(splitDateWindows("2026-09-01", "2026-09-18", 28)).toEqual([
      { from: "2026-09-01", to: "2026-09-18" },
    ]);
  });

  it("범위가 길면 최대 일수 단위로 쪼갠다", () => {
    const w = splitDateWindows("2026-07-07", "2026-09-18", 28);
    expect(w.length).toBeGreaterThan(1);
    for (const { from, to } of w) {
      const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
      expect(days).toBeLessThanOrEqual(28);
      expect(days).toBeGreaterThanOrEqual(0);
    }
  });

  it("윈도우가 전체 구간을 빈틈없이 덮는다", () => {
    const w = splitDateWindows("2026-07-07", "2026-09-18", 28);
    expect(w[0].from).toBe("2026-07-07");
    expect(w[w.length - 1].to).toBe("2026-09-18");
    for (let i = 1; i < w.length; i++) {
      // 이전 윈도우 끝 다음날 이전에 시작해야 누락이 없다
      expect(Date.parse(w[i].from)).toBeLessThanOrEqual(Date.parse(w[i - 1].to) + 86_400_000);
    }
  });

  it("from이 to보다 늦으면 빈 배열", () => {
    expect(splitDateWindows("2026-09-18", "2026-09-01", 28)).toEqual([]);
  });

  it("from과 to가 같으면 하루짜리 윈도우 1개", () => {
    expect(splitDateWindows("2026-09-18", "2026-09-18", 28)).toEqual([
      { from: "2026-09-18", to: "2026-09-18" },
    ]);
  });
});

describe("collectAcrossWindows", () => {
  const mk = (id: string) => ({ orderId: id });

  it("from이 없으면 한 번만 조회한다", async () => {
    const calls: Array<{ from?: string; to?: string }> = [];
    const r = await collectAcrossWindows(undefined, undefined, async (from, to) => {
      calls.push({ from, to });
      return [mk("a")];
    });
    expect(calls).toEqual([{ from: undefined, to: undefined }]);
    expect(r).toEqual([mk("a")]);
  });

  it("긴 구간은 여러 윈도우로 나눠 조회하고 합친다", async () => {
    const calls: string[] = [];
    const r = await collectAcrossWindows("2026-07-07", "2026-09-18", async (from) => {
      calls.push(from!);
      return [mk(`o-${from}`)];
    }, 28);
    expect(calls).toEqual(["2026-07-07", "2026-08-05", "2026-09-03"]);
    expect(r.map((o) => o.orderId)).toEqual(["o-2026-07-07", "o-2026-08-05", "o-2026-09-03"]);
  });

  it("윈도우가 겹쳐 같은 주문이 오면 한 번만 담는다", async () => {
    const r = await collectAcrossWindows("2026-07-07", "2026-09-18", async () =>
      [mk("dup"), mk("uniq")], 28);
    expect(r.map((o) => o.orderId)).toEqual(["dup", "uniq"]);
  });

  it("조회 결과가 비어도 나머지 윈도우를 계속 순회한다", async () => {
    const r = await collectAcrossWindows("2026-07-07", "2026-09-18", async (from) =>
      from === "2026-08-05" ? [] : [mk(`o-${from}`)], 28);
    expect(r).toHaveLength(2);
  });
});

describe("collectAcrossWindows — to 생략", () => {
  it("to가 없으면 오늘까지 순회한다", async () => {
    const calls: string[] = [];
    await collectAcrossWindows("2026-07-07", undefined, async (from) => {
      calls.push(from!);
      return [];
    }, 28, "2026-09-18");
    expect(calls).toEqual(["2026-07-07", "2026-08-05", "2026-09-03"]);
  });
});
