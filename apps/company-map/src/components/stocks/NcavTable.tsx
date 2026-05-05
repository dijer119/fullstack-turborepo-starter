"use client";

import type { NcavRow } from "@/types/stocks";

function fmtBig(v: string): string {
  try {
    return BigInt(v).toLocaleString();
  } catch {
    return v;
  }
}

export function NcavTable({ rows }: { rows: NcavRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-950">
          <tr>
            <th className="px-3 py-2 text-left">종목</th>
            <th className="px-3 py-2 text-right">NCAV</th>
            <th className="px-3 py-2 text-right">시가총액</th>
            <th className="px-3 py-2 text-right">NCAV 비율</th>
            <th className="px-3 py-2 text-right">유동자산</th>
            <th className="px-3 py-2 text-right">부채총계</th>
            <th className="px-3 py-2 text-right">사업연도</th>
            <th className="px-3 py-2 text-right">배당</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.code}
              className="border-t border-gray-100 dark:border-gray-900"
            >
              <td className="px-3 py-2">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-gray-500">{r.code}</div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtBig(r.ncav)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtBig(r.marcap)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.ncavRatio != null ? `${r.ncavRatio.toFixed(1)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtBig(r.currentAssets)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtBig(r.totalLiabilities)}
              </td>
              <td className="px-3 py-2 text-right">{r.bsnsYear}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.dividendYield != null
                  ? `${r.dividendYield.toFixed(2)}%`
                  : "-"}
              </td>
              <td className="px-3 py-2">
                {r.ncavPositive && (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    NCAV&gt;시총
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
