import { describe, it, expect } from "vitest";
import { buildShareHistory } from "./history";
import type { Holding } from "./types";

const mk = (code: string, weight: number, shares: number | null = 100): Holding => ({
  constituentCode: code, constituentName: `종목${code}`, weight, shares, amount: null,
});

describe("buildShareHistory", () => {
  it("스냅샷을 종목×날짜 매트릭스로 pivot한다 (dates 오름차순, cells 길이 = dates 길이)", () => {
    const h = buildShareHistory([
      { trdDd: "20260609", holdings: [mk("A", 40, 120)] },
      { trdDd: "20260605", holdings: [mk("A", 40, 100)] },
    ]);
    expect(h.dates).toEqual(["20260605", "20260609"]);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].cells).toHaveLength(2);
    expect(h.rows[0].cells.map((c) => c?.shares)).toEqual([100, 120]);
  });

  it("delta는 직전 관측치 대비로 계산하고 변동 없으면 0", () => {
    const h = buildShareHistory([
      { trdDd: "20260605", holdings: [mk("A", 40, 100)] },
      { trdDd: "20260608", holdings: [mk("A", 40, 100)] },
      { trdDd: "20260609", holdings: [mk("A", 40, 125)] },
    ]);
    const cells = h.rows[0].cells;
    expect(cells[0]?.delta).toBeNull(); // 첫 등장
    expect(cells[1]?.delta).toBe(0);
    expect(cells[2]?.delta).toBe(25);
  });

  it("신규 진입 종목은 이전 날짜 셀이 null이고 첫 셀 delta는 null", () => {
    const h = buildShareHistory([
      { trdDd: "20260605", holdings: [mk("A", 40)] },
      { trdDd: "20260609", holdings: [mk("A", 40), mk("B", 10, 12000)] },
    ]);
    const b = h.rows.find((r) => r.constituentCode === "B")!;
    expect(b.cells[0]).toBeNull();
    expect(b.cells[1]).toEqual({ shares: 12000, delta: null });
  });

  it("이탈 후 재진입 시 공백 셀은 null, 재진입 delta는 마지막 관측치 대비", () => {
    const h = buildShareHistory([
      { trdDd: "20260605", holdings: [mk("A", 40, 100), mk("B", 10, 50)] },
      { trdDd: "20260608", holdings: [mk("A", 40, 100)] }, // B 이탈
      { trdDd: "20260609", holdings: [mk("A", 40, 100), mk("B", 10, 80)] }, // B 재진입
    ]);
    const b = h.rows.find((r) => r.constituentCode === "B")!;
    expect(b.cells[1]).toBeNull();
    expect(b.cells[2]?.delta).toBe(30); // 80 - 50 (공백 건너뜀)
  });

  it("정렬: 최신 포함 종목이 최신 비중 내림차순으로 먼저, 이탈 종목은 하단", () => {
    const h = buildShareHistory([
      { trdDd: "20260605", holdings: [mk("A", 40), mk("D", 30)] },
      { trdDd: "20260609", holdings: [mk("B", 50), mk("A", 20)] }, // D 이탈
    ]);
    expect(h.rows.map((r) => r.constituentCode)).toEqual(["B", "A", "D"]);
    expect(h.rows.find((r) => r.constituentCode === "D")!.inLatest).toBe(false);
    expect(h.rows.find((r) => r.constituentCode === "B")!.latestWeight).toBe(50);
  });

  it("빈 입력이면 빈 결과를 반환한다 (throw 금지)", () => {
    expect(buildShareHistory([])).toEqual({ dates: [], rows: [] });
  });

  it("코드가 빈 문자열인 종목은 이름으로 행을 병합한다", () => {
    const noCode = (shares: number): Holding => ({
      constituentCode: "", constituentName: "원화예금", weight: 1, shares, amount: null,
    });
    const h = buildShareHistory([
      { trdDd: "20260605", holdings: [noCode(100)] },
      { trdDd: "20260609", holdings: [noCode(150)] },
    ]);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].cells[1]?.delta).toBe(50);
  });
});
