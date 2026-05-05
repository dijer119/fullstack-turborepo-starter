"use client";

import { useEffect, useState, useTransition } from "react";
import { TopStocksTable } from "@/components/stocks/TopStocksTable";
import { getTopStocks } from "@/actions/stocks";
import { exportStocksExcel } from "@/actions/watchlist";
import {
  readWatchlistCodes,
  toggleWatchlistCode,
} from "@/components/stocks/WatchlistPanel";
import type { TopStockRow } from "@/types/stocks";

const LIMIT_OPTIONS = [30, 50, 100, 200, 300];
const DIVIDEND_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "전체", value: null },
  { label: "≥ 1%", value: 1 },
  { label: "≥ 2%", value: 2 },
  { label: "≥ 3%", value: 3 },
  { label: "≥ 5%", value: 5 },
  { label: "≥ 7%", value: 7 },
];
const NCAV_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "전체", value: null },
  { label: "≥ 50%", value: 50 },
  { label: "≥ 100%", value: 100 },
  { label: "≥ 150%", value: 150 },
  { label: "≥ 200%", value: 200 },
];
const PER_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "전체", value: null },
  { label: "≤ 5", value: 5 },
  { label: "≤ 10", value: 10 },
  { label: "≤ 15", value: 15 },
  { label: "≤ 20", value: 20 },
];
const PBR_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "전체", value: null },
  { label: "≤ 0.5", value: 0.5 },
  { label: "≤ 1.0", value: 1.0 },
  { label: "≤ 1.5", value: 1.5 },
  { label: "≤ 2.0", value: 2.0 },
];

export function TopStocksClient({ initial }: { initial: TopStockRow[] }) {
  const [rows, setRows] = useState<TopStockRow[]>(initial);
  const [limit, setLimit] = useState(30);
  const [dividend, setDividend] = useState<number | null>(null);
  const [ncavRatio, setNcavRatio] = useState<number | null>(null);
  const [perMax, setPerMax] = useState<number | null>(null);
  const [pbrMax, setPbrMax] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, startLoad] = useTransition();
  const [exporting, startExport] = useTransition();

  useEffect(() => {
    setFavorites(new Set(readWatchlistCodes()));
  }, []);

  useEffect(() => {
    startLoad(async () => {
      const data = await getTopStocks({
        limit,
        dividend,
        ncavRatio,
        perMax,
        pbrMax,
      });
      setRows(data);
    });
  }, [limit, dividend, ncavRatio, perMax, pbrMax]);

  const handleToggle = (code: string) => {
    setFavorites(new Set(toggleWatchlistCode(code)));
  };

  const handleExport = () => {
    startExport(async () => {
      let filename = `안전마진_상위${limit}종목`;
      if (dividend != null) filename += `_배당수익률${dividend}%이상`;
      if (ncavRatio != null) filename += `_NCAV${ncavRatio}%이상`;
      if (perMax != null) filename += `_PER${perMax}이하`;
      if (pbrMax != null) filename += `_PBR${pbrMax}이하`;
      filename += ".xlsx";
      const { buffer } = await exportStocksExcel(rows, {
        sheetName: "안전마진 상위종목",
        filename,
      });
      const blob = new Blob([buffer as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-gray-900">
        <label className="flex items-center gap-2">
          상위
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}개
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          배당
          <select
            value={dividend ?? ""}
            onChange={(e) =>
              setDividend(e.target.value === "" ? null : Number(e.target.value))
            }
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {DIVIDEND_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          NCAV
          <select
            value={ncavRatio ?? ""}
            onChange={(e) =>
              setNcavRatio(
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {NCAV_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          PER
          <select
            value={perMax ?? ""}
            onChange={(e) =>
              setPerMax(e.target.value === "" ? null : Number(e.target.value))
            }
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {PER_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          PBR
          <select
            value={pbrMax ?? ""}
            onChange={(e) =>
              setPbrMax(e.target.value === "" ? null : Number(e.target.value))
            }
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {PBR_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {loading && <span className="text-xs text-gray-500">로딩 중...</span>}
      </div>
      <TopStocksTable
        rows={rows}
        favorites={favorites}
        onToggle={handleToggle}
        onExport={handleExport}
        exporting={exporting}
      />
    </div>
  );
}
