"use client";

import { useEffect, useState, useTransition } from "react";
import { Download, X } from "lucide-react";
import { getStocksByCodes } from "@/actions/stocks";
import { exportStocksExcel } from "@/actions/watchlist";
import type { TopStockRow } from "@/types/stocks";
import { NaverFinanceLink } from "./NaverFinanceLink";

const STORAGE_KEY = "company-map.watchlist";

export function readWatchlistCodes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function writeWatchlistCodes(codes: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
}

export function toggleWatchlistCode(code: string): string[] {
  const cur = readWatchlistCodes();
  const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
  writeWatchlistCodes(next);
  return next;
}

export function WatchlistPanel({
  codes,
  onRemove,
}: {
  codes: string[];
  onRemove: (code: string) => void;
}) {
  const [rows, setRows] = useState<TopStockRow[]>([]);
  const [loading, startLoad] = useTransition();
  const [exporting, startExport] = useTransition();

  useEffect(() => {
    if (codes.length === 0) {
      setRows([]);
      return;
    }
    startLoad(async () => {
      const data = await getStocksByCodes(codes);
      setRows(data);
    });
  }, [codes]);

  const handleExport = () => {
    if (rows.length === 0) return;
    startExport(async () => {
      const { buffer, filename } = await exportStocksExcel(rows, {
        sheetName: "관심종목",
        filename: "관심종목.xlsx",
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

  if (codes.length === 0) {
    return <p className="text-sm text-gray-500">관심종목이 비어 있습니다.</p>;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">관심종목 ({codes.length})</h3>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || rows.length === 0}
          className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Download size={14} /> 엑셀
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">로딩 중...</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.code}
              className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <span>
                <NaverFinanceLink
                  code={r.code}
                  name={r.name}
                  className="font-medium"
                  iconSize={11}
                />
                <span className="ml-2 text-xs text-gray-500">{r.code}</span>
              </span>
              <span className="flex items-center gap-3">
                <span
                  className={
                    r.safetyMargin != null && r.safetyMargin >= 0
                      ? "text-emerald-600"
                      : "text-red-600"
                  }
                >
                  {r.safetyMargin != null
                    ? `${r.safetyMargin.toFixed(1)}%`
                    : "-"}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(r.code)}
                  aria-label="제거"
                >
                  <X size={14} className="text-gray-400 hover:text-red-500" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
