"use client";

import { Heart } from "lucide-react";
import type { TopStockRow } from "@/types/stocks";

function safetyColor(margin: number | null): string {
  if (margin == null) return "text-gray-500";
  if (margin >= 30) return "text-emerald-600";
  if (margin >= 10) return "text-green-600";
  if (margin >= -10) return "text-amber-600";
  if (margin >= -30) return "text-orange-600";
  return "text-red-600";
}

interface Props {
  row: TopStockRow;
  isFavorite: boolean;
  onToggleFavorite: (code: string) => void;
}

export function StockResultCard({ row, isFavorite, onToggleFavorite }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">{row.name}</h2>
          <p className="text-sm text-gray-500">{row.code}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggleFavorite(row.code)}
          aria-label="관심종목 토글"
          className="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Heart
            size={20}
            className={isFavorite ? "fill-red-500 text-red-500" : "text-gray-400"}
          />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric
          label="현재가"
          value={
            row.currentPrice != null
              ? `${Math.round(row.currentPrice).toLocaleString()}원`
              : "-"
          }
        />
        <Metric
          label="내재가치"
          value={
            row.intrinsicValue != null
              ? `${Math.round(row.intrinsicValue).toLocaleString()}원`
              : "-"
          }
        />
        <Metric
          label="안전마진"
          value={
            row.safetyMargin != null
              ? `${row.safetyMargin > 0 ? "+" : ""}${row.safetyMargin.toFixed(1)}%`
              : "-"
          }
          valueClass={safetyColor(row.safetyMargin)}
        />
        <Metric
          label="자사주비율"
          value={
            row.treasuryRatio != null ? `${row.treasuryRatio.toFixed(2)}%` : "-"
          }
        />
        <Metric
          label="배당수익률"
          value={
            row.dividendYield != null ? `${row.dividendYield.toFixed(2)}%` : "-"
          }
        />
        <Metric
          label="NCAV 비율"
          value={
            row.ncavRatio != null ? `${row.ncavRatio.toFixed(1)}%` : "-"
          }
        />
      </div>

      <p className="mt-4 text-xs text-gray-500">
        마지막 업데이트: {new Date(row.lastUpdated).toLocaleString("ko-KR")}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}
