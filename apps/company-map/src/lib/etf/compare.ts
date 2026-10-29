import type { EtfDividend, EtfReturns } from "./types";

// ETF 수익률·분배 비교 화면(/stocks/etf/compare)의 행 조립·정렬·최고값 판정. 순수 함수.

export const COMPARE_PERIODS = ["D1", "W1", "M1", "M3", "M6", "YTD", "Y1", "Y3", "Y5", "Y10"] as const;
export type ComparePeriod = (typeof COMPARE_PERIODS)[number];

export const DIVIDEND_KEYS = ["yieldTtm", "perShareTtm", "countThisYear"] as const;
export type CompareKey = (typeof DIVIDEND_KEYS)[number] | ComparePeriod;
export type CompareSortKey = CompareKey | "name";
export type CompareBasis = "market" | "nav";

export interface CompareInput {
  code: string;
  name: string;
  snapshotTrdDd: string | null; // 수익률을 가져온 스냅샷의 trdDd (Naver 기준일이 없을 때 대체)
  returns: EtfReturns | null;
  dividend: EtfDividend | null;
}

export interface CompareRow {
  code: string;
  name: string;
  referenceDate: string | null;
  hasData: boolean; // 수익률·분배금 중 하나라도 수집됐는지
  values: Record<CompareKey, number | null>;
}

const ALL_KEYS: CompareKey[] = [...DIVIDEND_KEYS, ...COMPARE_PERIODS];

export function buildCompareRows(inputs: CompareInput[], basis: CompareBasis): CompareRow[] {
  return inputs.map((input) => {
    const values = Object.fromEntries(ALL_KEYS.map((k) => [k, null])) as Record<CompareKey, number | null>;
    const list = input.returns ? (basis === "market" ? input.returns.market : input.returns.nav) : [];
    for (const r of list) {
      if ((COMPARE_PERIODS as readonly string[]).includes(r.period)) values[r.period as ComparePeriod] = r.value;
    }
    if (input.dividend) {
      values.yieldTtm = input.dividend.yieldTtm;
      values.perShareTtm = input.dividend.perShareTtm;
      values.countThisYear = input.dividend.countThisYear;
    }
    return {
      code: input.code,
      name: input.name,
      referenceDate: input.returns?.referenceDate ?? input.snapshotTrdDd,
      hasData: input.returns != null || input.dividend != null,
      values,
    };
  });
}

// 값이 없는 행은 정렬 방향과 무관하게 항상 뒤로 보낸다. 입력 배열은 바꾸지 않는다.
export function sortCompareRows(rows: CompareRow[], key: CompareSortKey, dir: "asc" | "desc"): CompareRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return sign * a.name.localeCompare(b.name, "ko");
    const va = a.values[key];
    const vb = b.values[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return sign * (va - vb);
  });
}

// 열별 최대값. 값이 2개 미만이면 비교 의미가 없어 null.
export function maxByColumn(rows: CompareRow[]): Record<CompareKey, number | null> {
  const out = {} as Record<CompareKey, number | null>;
  for (const k of ALL_KEYS) {
    const vals = rows.map((r) => r.values[k]).filter((v): v is number => v != null);
    out[k] = vals.length >= 2 ? Math.max(...vals) : null;
  }
  return out;
}
