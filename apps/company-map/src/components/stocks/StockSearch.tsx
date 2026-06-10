"use client";

import { isValidStockCode } from "@/lib/stocks/stock-code";
import { useEffect, useState, useTransition } from "react";
import { Search, Loader2 } from "lucide-react";
import {
  searchStocks,
  analyzeStockOnDemand,
  type StockListItem,
} from "@/actions/stocks";
import type { TopStockRow } from "@/types/stocks";

interface Props {
  onSelect: (row: TopStockRow) => void;
}

export function StockSearch({ onSelect }: Props) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<StockListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, startSearch] = useTransition();
  const [analyzing, startAnalyze] = useTransition();

  useEffect(() => {
    if (input.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => {
      startSearch(async () => {
        const data = await searchStocks(input.trim());
        setResults(data);
        setOpen(true);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const handleAnalyzeDirect = async () => {
    const trimmed = input.trim();
    if (!isValidStockCode(trimmed)) return;
    startAnalyze(async () => {
      try {
        const row = await analyzeStockOnDemand(trimmed);
        onSelect(row);
        setOpen(false);
      } catch (e) {
        console.error(e);
        alert(e instanceof Error ? e.message : "분석 실패");
      }
    });
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="종목명 또는 6자리 종목코드를 입력하세요"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-28 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
        />
        {(searching || analyzing) && (
          <Loader2
            size={16}
            className="absolute right-24 top-1/2 -translate-y-1/2 animate-spin text-gray-400"
          />
        )}
        {isValidStockCode(input.trim()) && (
          <button
            type="button"
            onClick={handleAnalyzeDirect}
            disabled={analyzing}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            지금 분석
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
          {results.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => {
                  startAnalyze(async () => {
                    try {
                      const row = await analyzeStockOnDemand(r.code);
                      onSelect(row);
                    } catch {
                      onSelect({
                        code: r.code,
                        name: r.name,
                        currentPrice: r.currentPrice,
                        intrinsicValue: null,
                        safetyMargin: r.safetyMargin,
                        treasuryRatio: null,
                        dividendYield: null,
                        per: null,
                        pbr: null,
                        lastUpdated: r.lastUpdated,
                        ncavRatio: null,
                      });
                    }
                    setOpen(false);
                    setInput(r.name);
                  });
                }}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span>
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-gray-500">{r.code}</span>
                </span>
                {r.safetyMargin != null && (
                  <span
                    className={
                      r.safetyMargin >= 0 ? "text-emerald-600" : "text-red-600"
                    }
                  >
                    {r.safetyMargin.toFixed(1)}%
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
