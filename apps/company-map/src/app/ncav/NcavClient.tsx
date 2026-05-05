"use client";

import { useEffect, useState, useTransition } from "react";
import { NcavTable } from "@/components/stocks/NcavTable";
import { getNcavStocks } from "@/actions/ncav";
import type { NcavRow } from "@/types/stocks";

const LIMIT_OPTIONS = [50, 100, 200, 500];
const DIVIDEND_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "전체", value: null },
  { label: "≥ 1%", value: 1 },
  { label: "≥ 3%", value: 3 },
  { label: "≥ 5%", value: 5 },
];

interface Props {
  initial: { stocks: NcavRow[]; total: number; positiveCount: number };
}

export function NcavClient({ initial }: Props) {
  const [rows, setRows] = useState<NcavRow[]>(initial.stocks);
  const [total, setTotal] = useState(initial.total);
  const [positive, setPositive] = useState(initial.positiveCount);
  const [limit, setLimit] = useState(50);
  const [onlyPositive, setOnlyPositive] = useState(false);
  const [dividend, setDividend] = useState<number | null>(null);
  const [loading, startLoad] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const data = await getNcavStocks({
        limit,
        positive: onlyPositive,
        dividend,
      });
      setRows(data.stocks);
      setTotal(data.total);
      setPositive(data.positiveCount);
    });
  }, [limit, onlyPositive, dividend]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-gray-900">
        <span className="text-gray-500">
          전체 분석 {total.toLocaleString()}개 · NCAV&gt;시총{" "}
          {positive.toLocaleString()}개
        </span>
        <label className="ml-auto flex items-center gap-2">
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
          <input
            type="checkbox"
            checked={onlyPositive}
            onChange={(e) => setOnlyPositive(e.target.checked)}
          />
          NCAV&gt;시총만
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
        {loading && <span className="text-xs text-gray-500">로딩 중...</span>}
      </div>
      <NcavTable rows={rows} />
    </div>
  );
}
