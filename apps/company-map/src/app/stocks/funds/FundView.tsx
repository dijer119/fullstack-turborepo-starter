"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";
import {
  refreshFund,
  type FundDetailView,
  type FundWeightHistory,
  type FundWeightHistoryRow,
  type FundNavPoint,
} from "@/actions/funds";

function pct(v: number | null): string { return v == null ? "—" : `${v.toFixed(2)}%`; }
function deltaP(v: number | null): string { return v == null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%p`; }
function deltaColor(v: number | null): string {
  if (v == null || v === 0) return "text-gray-400";
  return v > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}
function statusBadge(status: string): string {
  const base = "rounded px-1.5 py-0.5 text-xs font-medium ";
  if (status === "신규") return base + "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (status === "이탈") return base + "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  return base + "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
}

// "20260626" → "06-26", "2026-06-26"
function fmtDate(d: string): string {
  return d.length === 8 ? `${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
}
function fmtFull(d: string | null): string {
  return d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "—";
}

const LINE_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea",
  "#0891b2", "#db2777", "#65a30d", "#4f46e5", "#ea580c",
];

export function FundView({
  detail, history, nav,
}: {
  detail: FundDetailView;
  history: FundWeightHistory;
  nav: FundNavPoint[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const onRefresh = () =>
    start(async () => {
      setMsg(null);
      const { result } = await refreshFund();
      setMsg(
        result === "saved" ? "새 스냅샷 저장됨"
          : result === "skipped" ? "변동 없음 (또는 오늘 이미 수집)"
          : "수집 실패",
      );
      router.refresh();
    });

  const hasData = detail.changes.length > 0;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{detail.name}</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {detail.manager} · 기준일 {fmtFull(detail.latestTrdDd)}
              {detail.latestNav != null && (
                <> · 기준가 {detail.latestNav.toLocaleString()}원</>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={onRefresh}
              disabled={pending}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "수집 중…" : "새로고침"}
            </button>
            {msg && <span className="text-xs text-gray-500">{msg}</span>}
          </div>
        </div>
      </section>

      {/* 보유 TOP10 diff */}
      <section>
        <h2 className="mb-2 text-base font-semibold">
          보유종목 TOP10 {detail.prevTrdDd && <span className="text-xs font-normal text-gray-500">(직전 {fmtFull(detail.prevTrdDd)} 대비)</span>}
        </h2>
        {!hasData ? (
          <p className="text-sm text-gray-500">스냅샷이 아직 없습니다. 새로고침을 눌러 수집하세요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="p-2">#</th>
                  <th className="p-2">종목명</th>
                  <th className="p-2 text-right">비중</th>
                  <th className="p-2 text-right">비중변동</th>
                  <th className="p-2 text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {detail.changes.map((c, i) => (
                  <tr
                    key={c.constituentName}
                    className={`border-b border-gray-100 dark:border-gray-800 ${c.status === "이탈" ? "text-gray-400" : ""}`}
                  >
                    <td className="p-2 text-gray-400">{c.status === "이탈" ? "—" : i + 1}</td>
                    <td className="p-2 font-medium">{c.constituentName}</td>
                    <td className="p-2 text-right">{pct(c.weight)}</td>
                    <td className={`p-2 text-right ${deltaColor(c.weightDelta)}`}>{deltaP(c.weightDelta)}</td>
                    <td className="p-2 text-center"><span className={statusBadge(c.status)}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 기준가(NAV) 추이 */}
      <section>
        <h2 className="mb-2 text-base font-semibold">기준가(NAV) 추이</h2>
        {nav.length <= 1 ? (
          <p className="text-sm text-gray-500">기준가 데이터가 충분하지 않습니다.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={nav.map((p) => ({ date: fmtDate(p.date), nav: p.nav }))} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} minTickGap={24} />
                <YAxis fontSize={11} width={64} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toLocaleString()} />
                <Tooltip formatter={(v) => (typeof v === "number" ? `${v.toLocaleString()}원` : v)} />
                <Line type="monotone" dataKey="nav" name="기준가" stroke="#2563eb" dot={false} strokeWidth={1.8} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* 비중 변경 이력 */}
      <WeightHistorySection history={history} />
    </div>
  );
}

const rowKey = (r: FundWeightHistoryRow) => r.name;

function WeightHistorySection({ history }: { history: FundWeightHistory }) {
  const [view, setView] = useState<"table" | "chart">("table");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const toggleActive = (k: string) => setActiveKey((cur) => (cur === k ? null : k));

  if (history.dates.length <= 1) {
    return (
      <section>
        <h2 className="mb-2 text-base font-semibold">비중 변경 이력</h2>
        <p className="text-sm text-gray-500">
          이력이 쌓이는 중입니다 (스냅샷 {history.dates.length}개). 보유 구성이 바뀔 때마다 추가됩니다.
        </p>
      </section>
    );
  }

  const chartRows = history.rows.filter((r) => r.inLatest).slice(0, LINE_COLORS.length);
  const chartData = history.dates.map((d, i) => {
    const point: Record<string, number | string | null> = { date: fmtDate(d) };
    for (const r of chartRows) point[rowKey(r)] = r.weights[i] ?? null;
    return point;
  });
  const active = chartRows.some((r) => rowKey(r) === activeKey) ? activeKey : null;

  const renderLegend = (value: string, entry: { dataKey?: unknown }) => {
    const k = String(entry?.dataKey ?? "");
    const isActive = k === active;
    return (
      <span style={{ cursor: "pointer", fontWeight: isActive ? 700 : 400, opacity: active && !isActive ? 0.4 : 1 }}>
        {value}
      </span>
    );
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">비중 변경 이력</h2>
        <div className="inline-flex overflow-hidden rounded border border-gray-300 text-xs dark:border-gray-700">
          <button onClick={() => setView("table")} className={`px-2.5 py-1 ${view === "table" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300"}`}>
            테이블
          </button>
          <button onClick={() => setView("chart")} className={`px-2.5 py-1 ${view === "chart" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300"}`}>
            그래프
          </button>
        </div>
      </div>

      {view === "chart" ? (
        <div>
          <p className="mb-2 text-xs text-gray-500">
            최근 {history.dates.length}개 스냅샷 · 최신 TOP10 종목 비중 추이 · 끊긴 구간은 해당일 TOP10 밖
          </p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} minTickGap={24} />
                <YAxis fontSize={11} width={48} domain={["auto", "auto"]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip formatter={(v) => (typeof v === "number" ? `${v.toFixed(2)}%` : v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={renderLegend} onClick={(o: { dataKey?: unknown }) => toggleActive(String(o?.dataKey ?? ""))} />
                {chartRows.map((r, idx) => {
                  const k = rowKey(r);
                  const isActive = k === active;
                  return (
                    <Line
                      key={k}
                      type="monotone"
                      dataKey={k}
                      name={r.name}
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
            최근 {history.dates.length}개 스냅샷 · — 는 해당일 TOP10 밖
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
                {history.rows.map((r) => (
                  <tr key={rowKey(r)} className={`border-b border-gray-100 dark:border-gray-800 ${r.inLatest ? "" : "text-gray-400"}`}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white p-2 dark:bg-gray-950">{r.name}</td>
                    {r.weights.map((w, i) => (
                      <td key={history.dates[i]} className="whitespace-nowrap p-2 text-right">
                        {w == null ? <span className="text-gray-300 dark:text-gray-700">—</span> : `${w.toFixed(2)}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
