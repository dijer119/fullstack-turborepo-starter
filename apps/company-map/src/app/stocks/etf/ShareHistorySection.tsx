"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";
import type { ShareHistory, ShareHistoryRow } from "@/lib/etf/history";

function deltaColor(v: number): string {
  return v > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

// 멀티라인 차트 색상 팔레트 (최신 Top10 종목 구분용)
const LINE_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea",
  "#0891b2", "#db2777", "#65a30d", "#4f46e5", "#ea580c",
];

// "20260610" → "06-10"
function fmtDate(trdDd: string): string {
  return trdDd.length === 8 ? `${trdDd.slice(4, 6)}-${trdDd.slice(6, 8)}` : trdDd;
}

const rowKey = (r: ShareHistoryRow) => r.constituentCode || r.constituentName;

export function ShareHistorySection({ history }: { history: ShareHistory }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "chart">("table");
  // 그래프 모드에서 강조 중인 종목 (범례/선 클릭으로 토글)
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const toggleActive = (k: string) => setActiveKey((cur) => (cur === k ? null : k));

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

  // 그래프 모드: 최신 Top10 종목 전체의 주식수 추이를 한 차트에 겹쳐 표시
  const chartRows = history.rows.filter((r) => r.inLatest).slice(0, LINE_COLORS.length);
  const chartData = history.dates.map((d, i) => {
    const point: Record<string, number | string | null> = { date: fmtDate(d) };
    for (const r of chartRows) point[rowKey(r)] = r.cells[i]?.shares ?? null;
    return point;
  });
  // ETF 전환 등으로 activeKey가 현재 라인 집합에 없으면 강조 해제로 간주
  const active = chartRows.some((r) => rowKey(r) === activeKey) ? activeKey : null;

  // 범례: 강조 종목은 굵게, 그 외엔 흐리게. 클릭 시 토글.
  const renderLegend = (value: string, entry: { dataKey?: unknown }) => {
    const k = String(entry?.dataKey ?? "");
    const isActive = k === active;
    return (
      <span
        style={{
          cursor: "pointer",
          fontWeight: isActive ? 700 : 400,
          opacity: active && !isActive ? 0.4 : 1,
        }}
      >
        {value}
      </span>
    );
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">주식수 변경 이력</h2>
        <div className="inline-flex overflow-hidden rounded border border-gray-300 text-xs dark:border-gray-700">
          <button
            onClick={() => setView("table")}
            className={`px-2.5 py-1 ${view === "table" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300"}`}
          >
            테이블
          </button>
          <button
            onClick={() => setView("chart")}
            className={`px-2.5 py-1 ${view === "chart" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300"}`}
          >
            그래프
          </button>
        </div>
      </div>

      {view === "chart" ? (
        <div>
          <p className="mb-2 text-xs text-gray-500">
            최근 {history.dates.length}개 스냅샷 · 최신 Top10 종목의 주식수 추이 · 끊긴 구간은 해당일 Top10 밖
          </p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis
                  fontSize={11}
                  width={72}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => v.toLocaleString()}
                />
                <Tooltip formatter={(v) => (typeof v === "number" ? v.toLocaleString() : v)} />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={renderLegend}
                  onClick={(o: { dataKey?: unknown }) => toggleActive(String(o?.dataKey ?? ""))}
                />
                {chartRows.map((r, idx) => {
                  const k = rowKey(r);
                  const isActive = k === active;
                  return (
                    <Line
                      key={k}
                      type="monotone"
                      dataKey={k}
                      name={r.constituentName}
                      stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                      strokeWidth={isActive ? 3 : 1.5}
                      strokeOpacity={active && !isActive ? 0.18 : 1}
                      dot={{ r: 1.5 }}
                      activeDot={{ r: 4, onClick: () => toggleActive(k) }}
                      onClick={() => toggleActive(k)}
                      style={{ cursor: "pointer" }}
                      connectNulls
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
      <>
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
                  className={`group cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900 ${
                    r.inLatest ? "" : "text-gray-400"
                  } ${openKey === key ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
                >
                  <td
                    className={`sticky left-0 z-10 whitespace-nowrap p-2 group-hover:bg-gray-50 dark:group-hover:bg-gray-900 ${
                      openKey === key ? "bg-blue-50 dark:bg-blue-950" : "bg-white dark:bg-gray-950"
                    }`}
                  >
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
      </>
      )}
    </section>
  );
}
