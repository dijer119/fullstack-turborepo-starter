"use client";

import { Heart, Download } from "lucide-react";
import type { TopStockRow } from "@/types/stocks";
import { NaverFinanceLink } from "./NaverFinanceLink";

interface Props {
  rows: TopStockRow[];
  favorites: Set<string>;
  onToggle: (code: string) => void;
  onExport: () => void;
  exporting: boolean;
}

function safetyClass(margin: number | null): string {
  if (margin == null) return "text-gray-400";
  if (margin >= 30) return "text-emerald-600";
  if (margin >= 10) return "text-green-600";
  if (margin >= -10) return "text-amber-600";
  if (margin >= -30) return "text-orange-600";
  return "text-red-600";
}

export function TopStocksTable({
  rows,
  favorites,
  onToggle,
  onExport,
  exporting,
}: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-800">
        <p className="text-sm text-gray-500">총 {rows.length}개 종목</p>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting || rows.length === 0}
          className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Download size={14} /> 엑셀
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-950">
            <tr>
              <th className="px-3 py-2 text-left">종목</th>
              <th className="px-3 py-2 text-right">현재가</th>
              <th className="px-3 py-2 text-right">내재가치</th>
              <th className="px-3 py-2 text-right">안전마진</th>
              <th className="px-3 py-2 text-right">PER</th>
              <th className="px-3 py-2 text-right">PBR</th>
              <th className="px-3 py-2 text-right">자사주</th>
              <th className="px-3 py-2 text-right">배당</th>
              <th className="px-3 py-2 text-right">NCAV</th>
              <th className="px-3 py-2 text-right">업데이트</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.code}
                className="border-t border-gray-100 hover:bg-gray-50 dark:border-gray-900 dark:hover:bg-gray-800"
              >
                <td className="px-3 py-2">
                  <div className="font-medium">
                    <NaverFinanceLink code={r.code} name={r.name} iconSize={11} />
                  </div>
                  <div className="text-xs text-gray-500">{r.code}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.currentPrice != null
                    ? Math.round(r.currentPrice).toLocaleString()
                    : "-"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.intrinsicValue != null
                    ? Math.round(r.intrinsicValue).toLocaleString()
                    : "-"}
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold tabular-nums ${safetyClass(r.safetyMargin)}`}
                >
                  {r.safetyMargin != null
                    ? `${r.safetyMargin > 0 ? "+" : ""}${r.safetyMargin.toFixed(1)}%`
                    : "-"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.per != null ? r.per.toFixed(2) : "-"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.pbr != null ? r.pbr.toFixed(2) : "-"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.treasuryRatio != null
                    ? `${r.treasuryRatio.toFixed(2)}%`
                    : "-"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.dividendYield != null
                    ? `${r.dividendYield.toFixed(2)}%`
                    : "-"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.ncavRatio != null ? `${r.ncavRatio.toFixed(1)}%` : "-"}
                </td>
                <td className="px-3 py-2 text-right text-xs text-gray-500">
                  {new Date(r.lastUpdated).toLocaleString("ko-KR")}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onToggle(r.code)}
                    aria-label="관심종목 토글"
                  >
                    <Heart
                      size={16}
                      className={
                        favorites.has(r.code)
                          ? "fill-red-500 text-red-500"
                          : "text-gray-300"
                      }
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
