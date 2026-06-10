"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import type { ShareHistory, ShareHistoryRow } from "@/lib/etf/history";

function deltaColor(v: number): string {
  return v > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

// "20260610" → "06-10"
function fmtDate(trdDd: string): string {
  return trdDd.length === 8 ? `${trdDd.slice(4, 6)}-${trdDd.slice(6, 8)}` : trdDd;
}

const rowKey = (r: ShareHistoryRow) => r.constituentCode || r.constituentName;

export function ShareHistorySection({ history }: { history: ShareHistory }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (history.dates.length <= 1) {
    return (
      <section>
        <h2 className="mb-2 text-base font-semibold">주식수 변경 이력</h2>
        <p className="text-sm text-gray-500">
          이력이 쌓이는 중입니다 (스냅샷 {history.dates.length}개)
        </p>
      </section>
    );
  }

  const open = history.rows.find((r) => rowKey(r) === openKey) ?? null;

  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">주식수 변경 이력</h2>
      <p className="mb-2 text-xs text-gray-500">
        최근 {history.dates.length}개 스냅샷 · 행 클릭 시 추이 차트 · — 는 해당일 Top10 밖
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-left">
              <th className="sticky left-0 z-10 border-b bg-white p-2 dark:bg-gray-950">종목명</th>
              {history.dates.map((d) => (
                <th key={d} className="whitespace-nowrap border-b p-2 text-right">{fmtDate(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.rows.map((r) => {
              const key = rowKey(r);
              const firstIdx = r.cells.findIndex((c) => c != null);
              return (
                <tr
                  key={key}
                  onClick={() => setOpenKey(openKey === key ? null : key)}
                  className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900 ${
                    r.inLatest ? "" : "text-gray-400"
                  } ${openKey === key ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
                >
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white p-2 dark:bg-gray-950">
                    {r.constituentName}
                  </td>
                  {r.cells.map((c, i) => (
                    <td key={history.dates[i]} className="whitespace-nowrap p-2 text-right">
                      {c == null ? (
                        <span className="text-gray-300 dark:text-gray-700">—</span>
                      ) : (
                        <>
                          {c.shares?.toLocaleString() ?? "—"}
                          {i === firstIdx && firstIdx > 0 && (
                            <span className="ml-1 text-xs text-green-600 dark:text-green-400">신규</span>
                          )}
                          {c.delta != null && c.delta !== 0 && (
                            <span className={`ml-1 text-xs ${deltaColor(c.delta)}`}>
                              {c.delta > 0 ? "▲" : "▼"}
                              {Math.abs(c.delta).toLocaleString()}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="mt-3 rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <div className="mb-1 text-sm font-medium">{open.constituentName} 주식수 추이</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={history.dates.map((d, i) => ({
                  date: fmtDate(d),
                  shares: open.cells[i]?.shares ?? null,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis
                  fontSize={11}
                  width={72}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => v.toLocaleString()}
                />
                <Tooltip formatter={(v) => (typeof v === "number" ? v.toLocaleString() : v)} />
                <Line type="monotone" dataKey="shares" stroke="#2563eb" dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
