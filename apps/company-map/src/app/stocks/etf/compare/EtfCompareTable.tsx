"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  COMPARE_PERIODS, buildCompareRows, maxByColumn, sortCompareRows,
  type CompareBasis, type CompareInput, type CompareKey, type CompareSortKey,
} from "@/lib/etf/compare";

const PERIOD_LABELS: Record<string, string> = {
  D1: "1일", W1: "1주", M1: "1개월", M3: "3개월", M6: "6개월",
  YTD: "YTD", Y1: "1년", Y3: "3년", Y5: "5년", Y10: "10년",
};

// 수익률 열이 아닌 숫자 열 (분배 지표)
const DIVIDEND_COLUMNS: { key: CompareKey; label: string; fmt: (v: number) => string }[] = [
  { key: "yieldTtm", label: "분배율", fmt: (v) => `${v.toFixed(2)}%` },
  { key: "perShareTtm", label: "분배금(TTM)", fmt: (v) => `${v.toLocaleString()}원` },
  { key: "countThisYear", label: "올해 횟수", fmt: (v) => `${v}회` },
];

function returnColor(v: number): string {
  if (v === 0) return "text-gray-500";
  return v > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

// "20261001" → "10-01"
function fmtDate(ymd: string | null): string {
  return ymd && ymd.length === 8 ? `${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : "—";
}

export function EtfCompareTable({
  watches, selected, inputs,
}: {
  watches: { code: string; name: string }[];
  selected: string[];
  inputs: CompareInput[];
}) {
  const router = useRouter();
  const [basis, setBasis] = useState<CompareBasis>("market");
  const [sortKey, setSortKey] = useState<CompareSortKey>("yieldTtm");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const selectedSet = new Set(selected);
  const navigate = (codes: string[]) => {
    // 전체 선택이면 파라미터를 생략해 기본(전체)과 같은 URL을 쓴다
    const qs = codes.length === watches.length ? "" : `?codes=${codes.join(",")}`;
    router.replace(`/stocks/etf/compare${qs}`, { scroll: false });
  };
  const toggle = (code: string) =>
    navigate(watches.map((w) => w.code).filter((c) => (c === code ? !selectedSet.has(c) : selectedSet.has(c))));

  const onSort = (key: CompareSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const rows = sortCompareRows(buildCompareRows(inputs, basis), sortKey, sortDir);
  const max = maxByColumn(rows);
  const missing = rows.filter((r) => !r.hasData).map((r) => r.code);

  const sortMark = (key: CompareSortKey) => (key === sortKey ? (sortDir === "desc" ? " ▼" : " ▲") : "");
  const thBtn = (key: CompareSortKey, label: string, align = "text-right") => (
    <th
      key={key}
      onClick={() => onSort(key)}
      className={`cursor-pointer select-none whitespace-nowrap border-b bg-gray-50 p-2 font-medium hover:text-blue-600 dark:bg-gray-900 ${align}`}
    >
      {label}{sortMark(key)}
    </th>
  );
  const strong = (key: CompareKey, v: number | null) => (v != null && max[key] != null && v === max[key] ? "font-bold" : "");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {watches.map((w) => {
          const on = selectedSet.has(w.code);
          return (
            <button
              key={w.code}
              onClick={() => toggle(w.code)}
              aria-pressed={on}
              className={`rounded px-2 py-1 text-sm ${on ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300"}`}
            >
              {w.name}
            </button>
          );
        })}
        <span className="mx-1 text-gray-300">|</span>
        <button onClick={() => navigate(watches.map((w) => w.code))} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
          전체 선택
        </button>
        <button onClick={() => router.replace("/stocks/etf/compare?codes=", { scroll: false })} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
          전체 해제
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="inline-flex overflow-hidden rounded border border-gray-300 text-xs dark:border-gray-700">
          {(["market", "nav"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBasis(b)}
              className={`px-2.5 py-1 ${basis === b ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300"}`}
            >
              {b === "market" ? "시장가 수익률" : "NAV 수익률"}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">열 제목을 누르면 정렬 · 굵은 값은 열 최고값</span>
      </div>

      {missing.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          ⚠ 수익률·분배금 미수집: {missing.join(", ")} — /stocks/etf에서 &quot;구성종목 갱신&quot;을 누르면 채워집니다.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">비교할 ETF를 선택하세요.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                {thBtn("name", "ETF", "text-left")}
                {DIVIDEND_COLUMNS.map((c) => thBtn(c.key, c.label))}
                {COMPARE_PERIODS.map((p) => thBtn(p, PERIOD_LABELS[p]))}
                <th className="whitespace-nowrap border-b bg-gray-50 p-2 text-right font-medium dark:bg-gray-900">기준일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="whitespace-nowrap border-b border-gray-100 p-2 dark:border-gray-800">
                    <a
                      href={`https://stock.naver.com/domestic/stock/${encodeURIComponent(r.code)}/info/summary`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:text-blue-600 hover:underline dark:hover:text-blue-400"
                    >
                      {r.name}
                    </a>
                    <span className="ml-1.5 text-xs text-gray-400">{r.code}</span>
                  </td>
                  {DIVIDEND_COLUMNS.map((c) => {
                    const v = r.values[c.key];
                    return (
                      <td key={c.key} className={`whitespace-nowrap border-b border-gray-100 p-2 text-right tabular-nums dark:border-gray-800 ${strong(c.key, v)}`}>
                        {v == null ? <span className="text-gray-300 dark:text-gray-700">—</span> : c.fmt(v)}
                      </td>
                    );
                  })}
                  {COMPARE_PERIODS.map((p) => {
                    const v = r.values[p];
                    return (
                      <td key={p} className={`whitespace-nowrap border-b border-gray-100 p-2 text-right tabular-nums dark:border-gray-800 ${strong(p, v)} ${v == null ? "" : returnColor(v)}`}>
                        {v == null ? <span className="text-gray-300 dark:text-gray-700">—</span> : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap border-b border-gray-100 p-2 text-right text-xs text-gray-400 dark:border-gray-800">
                    {fmtDate(r.referenceDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
