import type { Holding } from "./types";

// 스냅샷 누적분을 "종목 × 날짜" 매트릭스로 pivot한 주식수 이력.
// Top10 기반 수집이라 Top10 밖 기간은 셀이 null(공백)이다.
export interface ShareHistoryCell {
  shares: number | null;
  delta: number | null; // 직전 "관측치가 있는" 셀 대비 증감. 첫 등장이면 null
}

export interface ShareHistoryRow {
  constituentCode: string;
  constituentName: string;
  latestWeight: number | null; // 최신 스냅샷 비중 (정렬 기준)
  inLatest: boolean;           // 최신 Top10 포함 여부
  cells: (ShareHistoryCell | null)[]; // dates와 같은 길이
}

export interface ShareHistory {
  dates: string[]; // trdDd(YYYYMMDD) 오름차순
  rows: ShareHistoryRow[];
}

// 코드가 빈 문자열이면(현금성 자산 등) 이름으로 행을 식별한다.
const keyOf = (h: { constituentCode: string; constituentName: string }) =>
  h.constituentCode || h.constituentName;

export function buildShareHistory(
  snapshots: { trdDd: string; holdings: Holding[] }[],
): ShareHistory {
  const sorted = [...snapshots].sort((a, b) => a.trdDd.localeCompare(b.trdDd));
  const dates = sorted.map((s) => s.trdDd);

  const rowMap = new Map<string, ShareHistoryRow>();
  sorted.forEach((snap, i) => {
    for (const h of snap.holdings) {
      let row = rowMap.get(keyOf(h));
      if (!row) {
        row = {
          constituentCode: h.constituentCode,
          constituentName: h.constituentName,
          latestWeight: null,
          inLatest: false,
          cells: dates.map(() => null),
        };
        rowMap.set(keyOf(h), row);
      }
      row.constituentName = h.constituentName; // 최신 이름으로 갱신
      row.cells[i] = { shares: h.shares, delta: null };
    }
  });

  // delta: 공백(null 셀)을 건너뛰고 직전 관측치 대비
  for (const row of rowMap.values()) {
    let prevShares: number | null = null;
    let hasPrev = false;
    for (const cell of row.cells) {
      if (!cell) continue;
      cell.delta =
        hasPrev && cell.shares != null && prevShares != null
          ? cell.shares - prevShares
          : null;
      prevShares = cell.shares;
      hasPrev = true;
    }
  }

  const latest = sorted[sorted.length - 1];
  if (latest) {
    for (const h of latest.holdings) {
      const row = rowMap.get(keyOf(h));
      if (row) {
        row.inLatest = true;
        row.latestWeight = h.weight;
      }
    }
  }

  const rows = [...rowMap.values()].sort((a, b) => {
    if (a.inLatest !== b.inLatest) return a.inLatest ? -1 : 1;
    return (b.latestWeight ?? 0) - (a.latestWeight ?? 0);
  });

  return { dates, rows };
}
