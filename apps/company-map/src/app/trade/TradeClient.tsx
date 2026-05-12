"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";
import {
  getTopCountries,
  syncTradeMonth,
  type MonthlySummary,
  type MonthlyBreakdown,
  type CountryRow,
} from "@/actions/trade";
import { CATEGORIES, type CategoryKey, getCategory } from "@/lib/trade/categories";

export type CategoryBundle = {
  key: CategoryKey;
  summary: MonthlySummary[];
  breakdown: MonthlyBreakdown[];
  months: string[];
  latest: string;
  topCountries: CountryRow[];
};

type Props = {
  bundles: CategoryBundle[];
  initialTab: CategoryKey;
};

const BILLION = 1_000_000_000;
const MILLION = 1_000_000;

function fmtAuto(v: number): string {
  if (Math.abs(v) >= BILLION) return `$${(v / BILLION).toFixed(2)}B`;
  return `$${(v / MILLION).toFixed(1)}M`;
}
function fmtMillionDec(v: number): string {
  return `$${(v / MILLION).toFixed(1)}M`;
}

/** 오늘 기준 최근 N개월의 "YYYYMM" 리스트 (최신 → 과거). */
function recentMonthsYYYYMM(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i += 1) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    out.push(`${y}${String(m).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function formatYm(yyyymm: string): string {
  return `${yyyymm.slice(0, 4)}.${yyyymm.slice(4)}`;
}

function SyncPanel() {
  const router = useRouter();
  const recent = useMemo(() => recentMonthsYYYYMM(3), []);
  const [sector, setSector] = useState<CategoryKey>("semiconductor");
  const [month, setMonth] = useState(recent[0]);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSync = () => {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await syncTradeMonth(sector, month);
        setMsg({
          ok: true,
          text: `${formatYm(month)} ${getCategory(sector).label}: ${r.saved}건 갱신`,
        });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
      <span className="text-xs font-medium text-gray-500">동기화</span>
      <select
        value={sector}
        onChange={(e) => setSector(e.target.value as CategoryKey)}
        disabled={pending}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-950"
      >
        {CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        disabled={pending}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-950"
      >
        {recent.map((m) => (
          <option key={m} value={m}>
            {formatYm(m)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleSync}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        <RefreshCw
          size={14}
          className={pending ? "animate-spin" : ""}
        />
        {pending ? "동기화 중..." : "동기화"}
      </button>
      {msg && (
        <span
          className={`text-xs ${
            msg.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}

export function TradeClient({ bundles, initialTab }: Props) {
  const [tab, setTab] = useState<CategoryKey>(initialTab);
  const bundleMap = useMemo(
    () => new Map(bundles.map((b) => [b.key, b])),
    [bundles],
  );
  const active = bundleMap.get(tab)!;
  const def = getCategory(tab);

  const [month, setMonth] = useState(active.latest);
  const [topCountries, setTopCountries] = useState<CountryRow[]>(
    active.topCountries,
  );
  const [loading, startLoad] = useTransition();

  // Tab 변경 시 active 카테고리의 latest로 reset + 미리 받아둔 top 사용.
  useEffect(() => {
    setMonth(active.latest);
    setTopCountries(active.topCountries);
  }, [active]);

  // 월 변경 시 server action 재호출.
  useEffect(() => {
    if (!month || month === active.latest) return;
    startLoad(async () => {
      const data = await getTopCountries(tab, month, 10);
      setTopCountries(data);
    });
  }, [tab, month, active.latest]);

  // Chart 단위는 카테고리별로 동적 결정 — 반도체는 $B, 화장품은 $M 수준.
  const maxExp = Math.max(...active.summary.map((s) => s.expDlr), 0);
  const useBillion = maxExp >= 5 * BILLION;
  const unit = useBillion ? BILLION : MILLION;
  const unitLabel = useBillion ? "B" : "M";

  const chartData = active.summary.map((s) => ({
    yearMonth: s.yearMonth,
    수출: +(s.expDlr / unit).toFixed(useBillion ? 2 : 0),
    수입: +(s.impDlr / unit).toFixed(useBillion ? 2 : 0),
    수지: +(s.balPayments / unit).toFixed(useBillion ? 2 : 0),
  }));

  const tableRows = [...active.breakdown].reverse();

  return (
    <div className="space-y-6">
      <SyncPanel />
      {/* 탭 */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-900">
        {CATEGORIES.map((c) => {
          const isActive = c.key === tab;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setTab(c.key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                isActive
                  ? "bg-white text-blue-600 shadow-sm dark:bg-gray-950 dark:text-blue-400"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* 차트 */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <h2 className="mb-3 text-lg font-semibold">
          월별 수출입 추이 (단위: ${unitLabel})
        </h2>
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb20" />
              <XAxis dataKey="yearMonth" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit={unitLabel} />
              <Tooltip
                formatter={(v) =>
                  `$${Number(v).toFixed(useBillion ? 2 : 0)}${unitLabel}`
                }
                contentStyle={{
                  background: "rgba(17,24,39,0.95)",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                }}
              />
              <Legend />
              <Bar dataKey="수출" fill="#3b82f6">
                <LabelList
                  dataKey="수출"
                  position="top"
                  formatter={(v: unknown) =>
                    `${Number(v).toFixed(useBillion ? 1 : 0)}${unitLabel}`
                  }
                  className="fill-gray-700 dark:fill-gray-300"
                  style={{ fontSize: 10, fontWeight: 600 }}
                />
              </Bar>
              <Bar dataKey="수입" fill="#f87171" />
              <Line
                type="monotone"
                dataKey="수지"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* HS 분해 테이블 */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <h2 className="mb-3 text-lg font-semibold">월별 수출액 카테고리 분해</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left dark:border-gray-800">
                <th className="px-2 py-2 font-medium">월</th>
                {def.subCategories.map((sub) => (
                  <th
                    key={sub.hsPrefix}
                    className="px-2 py-2 text-right font-medium"
                  >
                    {sub.label}
                    <br />
                    <span className="text-[10px] text-gray-400">
                      {sub.hsPrefix}
                    </span>
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-semibold">총수출</th>
                <th className="px-2 py-2 text-right font-medium text-gray-500">
                  총수입
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr
                  key={r.yearMonth}
                  className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-900 dark:hover:bg-gray-900"
                >
                  <td className="px-2 py-2 font-mono">{r.yearMonth}</td>
                  {def.subCategories.map((sub) => (
                    <td
                      key={sub.hsPrefix}
                      className="px-2 py-2 text-right"
                    >
                      {fmtAuto(r.bySubCategory[sub.label] ?? 0)}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right font-semibold text-blue-600 dark:text-blue-400">
                    {fmtAuto(r.totalExp)}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-500">
                    {fmtAuto(r.totalImp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 국가 TOP */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">국가별 TOP 10 (수출 기준)</h2>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={loading}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            {active.months
              .slice()
              .reverse()
              .map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
          </select>
          {loading && (
            <span className="text-xs text-gray-400">불러오는 중...</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left dark:border-gray-800">
                <th className="px-2 py-2 font-medium">순위</th>
                <th className="px-2 py-2 font-medium">국가</th>
                <th className="px-2 py-2 text-right font-medium">수출</th>
                <th className="px-2 py-2 text-right font-medium">수입</th>
                <th className="px-2 py-2 text-right font-medium">무역수지</th>
              </tr>
            </thead>
            <tbody>
              {topCountries.map((c, i) => (
                <tr
                  key={c.countryCd}
                  className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-900 dark:hover:bg-gray-900"
                >
                  <td className="px-2 py-2">{i + 1}</td>
                  <td className="px-2 py-2">
                    <span className="font-medium">{c.countryName}</span>{" "}
                    <span className="text-[10px] text-gray-400">
                      {c.countryCd}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {fmtMillionDec(c.expDlr)}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-500">
                    {fmtMillionDec(c.impDlr)}
                  </td>
                  <td
                    className={`px-2 py-2 text-right font-semibold ${
                      c.balPayments >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {c.balPayments >= 0 ? "+" : ""}
                    {fmtMillionDec(c.balPayments)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
