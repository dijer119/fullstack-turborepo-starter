"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { getSplitPerformance } from "@/actions/split-performance";
import { performanceBuckets, profitTotals, type ProfitMode } from "@/lib/split/performance";

const control = "min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm  ";
const rate = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const tone = (value: number) => value > 0 ? "text-pink-600 dark:text-pink-400" : value < 0 ? "text-blue-ink " : "text-muted ";

export function PerformanceDashboard({ data }: { data: Awaited<ReturnType<typeof getSplitPerformance>> }) {
  const router = useRouter();
  const [mode, setMode] = useState<ProfitMode>("live");
  const [market, setMarket] = useState("KR");
  const [strategyId, setStrategyId] = useState("all");
  const [period, setPeriod] = useState<"monthly" | "daily">("monthly");
  const [year, setYear] = useState(Number(data.today.slice(0, 4)));
  const [month, setMonth] = useState(Number(data.today.slice(5, 7)));
  const [metric, setMetric] = useState<"pnl" | "returnPct">("pnl");
  useEffect(() => { const timer = setInterval(() => router.refresh(), 30000); return () => clearInterval(timer); }, [router]);
  const years = [...new Set([Number(data.today.slice(0, 4)), year, ...data.records.flatMap(r => r.date ? [Number(r.date.slice(0, 4))] : [])])].sort((a, b) => b - a);
  const strategies = data.strategies.filter(s => s.mode === mode && s.market === market);
  const selected = data.records.filter(r => r.mode === mode && r.market === market && (strategyId === "all" || r.strategyId === strategyId));
  const undated = selected.filter(r => r.date === null).length;
  const buckets = performanceBuckets(data.records, { mode, market, strategyId, year, month: period === "daily" ? month : null });
  const totals = profitTotals(buckets);
  const currency = market === "KR" ? "원" : "USD";
  const money = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 4 })} ${currency}`;
  const title = period === "monthly" ? `${year}년 월별` : `${year}년 ${month}월 일별`;
  const selectMonth = (key: string) => { setMonth(Number(key.slice(5, 7))); setPeriod("daily"); };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2" aria-label="수익 장부 선택">{([["live", "실거래"], ["simulation", "모의"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} onClick={() => { setMode(key); setStrategyId("all"); }} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === key ? "bg-accent text-on-accent" : "bg-surface-inset text-muted  "}`}>{label}</button>)}</div>
      <button type="button" className={control} onClick={() => router.refresh()}>새로고침</button>
    </div>
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs leading-6 text-muted dark:border-blue-950 dark:bg-blue-950/20 ">
      <p><strong>{mode === "live" ? "매도 주문일 기준 (한국시간)" : "모의 실행일 기준 (한국시간)"}</strong> · 수익률 = 순실현손익 ÷ 매도분 매입원가 × 100</p>
      <p>매수·매도 수수료와 세금을 반영합니다. 보유 평가손익과 계좌 전체의 기간 수익률은 포함하지 않습니다. 매도 원가가 없는 기간의 수익률은 —로 표시합니다.</p>
      <p>{mode === "live" ? "체결별 시각이 없어 주문일에 누적 체결분을 집계합니다. 날짜를 넘긴 부분 체결도 주문일에 포함되며, 미확정 비용은 장부 반영분만 표시하고 추후 정산 시 과거 금액이 바뀔 수 있습니다." : "가격 경로의 각 단계를 실행 기록에 연결합니다. 한 번에 입력한 여러 가격은 같은 실행일에 집계되며 실제 거래 수익이 아닙니다."}</p>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs text-muted">기간<select aria-label="수익 조회 단위" className={control} value={period} onChange={e => setPeriod(e.target.value as "monthly" | "daily")}><option value="monthly">월별</option><option value="daily">일별</option></select></label>
      <label className="grid gap-1 text-xs text-muted">연도<select aria-label="수익 조회 연도" className={control} value={year} onChange={e => setYear(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y}년</option>)}</select></label>
      {period === "daily" && <label className="grid gap-1 text-xs text-muted">월<select aria-label="수익 조회 월" className={control} value={month} onChange={e => setMonth(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}</select></label>}
      <label className="grid gap-1 text-xs text-muted">통화<select aria-label="수익 조회 통화" className={control} value={market} onChange={e => { setMarket(e.target.value); setStrategyId("all"); }}><option value="KR">원화 · KRW</option><option value="US">달러 · USD</option></select></label>
      <label className="grid min-w-0 flex-1 basis-56 gap-1 text-xs text-muted">종목·전략<select aria-label="수익 조회 전략" className={control} value={strategyId} onChange={e => setStrategyId(e.target.value)}><option value="all">전체 전략 (종료 포함)</option>{strategies.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
    </div>
    {undated > 0 && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">날짜를 확인할 수 없는 실현손익 기록 {undated}건은 기간 집계에서 제외했습니다. 주문·실행 이력을 확인하세요.</p>}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="선택 기간 수익 요약">
      <div className="rounded-xl border border-line bg-surface p-4 "><p className="text-xs text-muted">{title} 순실현손익</p><p className={`mt-2 break-words text-xl font-bold tabular-nums ${tone(totals.pnl)}`}>{money(totals.pnl)}</p></div>
      <div className="rounded-xl border border-line bg-surface p-4 "><p className="text-xs text-muted">매도 원가 대비 수익률</p><p className={`mt-2 text-xl font-bold tabular-nums ${tone(totals.pnl)}`}>{rate(totals.returnPct)}</p></div>
      <div className="rounded-xl border border-line bg-surface p-4 "><p className="text-xs text-muted">매도분 매입원가</p><p className="mt-2 break-words text-xl font-semibold tabular-nums">{money(totals.cost)}</p></div>
      <div className="rounded-xl border border-line bg-surface p-4 "><p className="text-xs text-muted">매도 기록 · 수량</p><p className="mt-2 text-xl font-semibold">{totals.count}건 · {totals.quantity.toLocaleString("ko-KR")}주</p></div>
    </section>
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4 " aria-label="기간별 수익 그래프">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{title} {metric === "pnl" ? "수익금" : "수익률"}</h2><div className="flex gap-2">{([["pnl", "수익금"], ["returnPct", "수익률"]] as const).map(([key, label]) => <button key={key} className={`${control} ${metric === key ? "border-pink-300 text-pink-600 dark:text-pink-400" : ""}`} aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>)}</div></div>
      {!totals.count && <p className="text-sm text-muted">선택한 기간에 장부에 반영된 매도 기록이 없습니다.</p>}
      <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="월별 일별 수익 막대그래프">
        <div style={{ minWidth: period === "daily" ? 960 : 600, height: 320 }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 320 }}>
            <BarChart data={buckets} margin={{ top: 16, right: 20, bottom: 8, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} interval={0} />
              <YAxis width={70} tick={{ fontSize: 11, fill: "var(--muted)" }} tickFormatter={value => metric === "returnPct" ? `${value}%` : Number(value).toLocaleString("ko-KR", { notation: "compact" })} />
              <Tooltip contentStyle={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--foreground)" }} itemStyle={{ color: "var(--foreground)" }} formatter={value => metric === "returnPct" ? rate(typeof value === "number" ? value : null) : money(Number(value))} labelFormatter={(_, payload) => payload[0]?.payload?.key ?? ""} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              <Bar dataKey={metric} name={metric === "pnl" ? `순실현손익 (${currency})` : "수익률"} maxBarSize={48} isAnimationActive={false}>
                {buckets.map(bucket => <Cell key={bucket.key} fill={bucket.pnl < 0 ? "var(--chart-sell)" : "var(--chart-buy)"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="text-xs text-muted">분홍색: 수익 · 파란색: 손실 · 상세 수치는 아래 표에서 확인하세요. {period === "monthly" ? "월을 선택하면 일별 내역으로 이동합니다." : "좌우로 스크롤해 모든 날짜를 확인하세요."}</p>
    </section>
    <section className="space-y-3" aria-label="기간별 수익 상세">
      <h2 className="font-semibold">{title} 상세 내역</h2>
      <div className="overflow-x-auto rounded-xl border border-line " tabIndex={0}>
        <table className="w-full min-w-[700px] text-right text-sm"><caption className="sr-only">기간별 순실현손익, 수익률, 매도 원가와 수량</caption><thead className="bg-surface-muted text-xs text-muted "><tr>{["기간", `순실현손익 (${currency})`, "수익률", `매입원가 (${currency})`, `매도 순수입 (${currency})`, "수량", "기록"].map(label => <th key={label} scope="col" className="whitespace-nowrap px-3 py-3">{label}</th>)}</tr></thead>
          <tbody>{buckets.map(bucket => <tr key={bucket.key} className="border-t border-line "><th scope="row" className="px-3 py-3 font-medium">{period === "monthly" ? <button className="text-blue-ink hover:underline " aria-label={`${year}년 ${bucket.label} 일별 수익 보기`} onClick={() => selectMonth(bucket.key)}>{bucket.label}</button> : bucket.label}</th><td className={`px-3 py-3 tabular-nums ${tone(bucket.pnl)}`}>{bucket.pnl.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}</td><td className={`px-3 py-3 tabular-nums ${tone(bucket.pnl)}`}>{rate(bucket.returnPct)}</td><td className="px-3 py-3 tabular-nums">{bucket.cost.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}</td><td className="px-3 py-3 tabular-nums">{bucket.proceeds.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}</td><td className="px-3 py-3">{bucket.quantity}</td><td className="px-3 py-3">{bucket.count}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted">매도 기록은 실거래에서는 주문 단위, 모의에서는 매도한 차수·회차 단위입니다. 현재 장부 기준으로 30초마다 갱신합니다.</p>
    </section>
  </div>;
}
