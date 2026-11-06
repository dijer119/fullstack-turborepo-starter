"use client";

import { useEffect, useState } from "react";
import { Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getSplitChart } from "@/actions/split-chart";
import { tradeChartPoints, trancheChartLevels, type SplitChartData } from "@/lib/split/chart";

const control = "rounded-lg border border-line bg-surface px-3 py-2 text-sm  ";
export function SplitPriceChart({ id, mode, version, market, maxTranches }: {
  id: string; mode: "live" | "simulation"; version: string; market: string; maxTranches: number;
}) {
  const [reload, setReload] = useState(0);
  const [slot, setSlot] = useState(0);
  const [selected, setSelected] = useState("");
  const [snapshot, setSnapshot] = useState<{ key: string; data?: SplitChartData; error?: string }>();
  const requestKey = `${id}:${mode}:${version}:${reload}`;
  useEffect(() => {
    if (mode !== "live") return;
    const timer = setInterval(() => setReload(n => n + 1), 300000);
    return () => clearInterval(timer);
  }, [mode]);
  useEffect(() => {
    let cancelled = false;
    getSplitChart(id, mode).then(data => {
      if (!cancelled) setSnapshot({ key: requestKey, data });
    }).catch(() => {
      if (!cancelled) setSnapshot({ key: requestKey, error: "차트를 불러오지 못했습니다. 차트 새로고침을 눌러 다시 시도하세요." });
    });
    return () => { cancelled = true; };
  }, [id, mode, requestKey]);
  const data = snapshot?.key === requestKey ? snapshot.data : undefined;
  const error = snapshot?.key === requestKey ? snapshot.error : undefined;
  const trades = data?.trades.filter(t => !slot || t.slot === slot) ?? [];
  const levels = trancheChartLevels(trades);
  const levelPrices = [...new Set(levels.map(l => l.price))];
  const groups = tradeChartPoints(trades);
  const active = groups.find(g => g.key === selected) ?? groups.at(-1);
  const prices = groups.map(group => ({ x: group.x, price: group.price }));
  const money = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}${market === "KR" ? "원" : "달러"}`;
  const axisLabel = (value: number) => `${Math.round(value)}번째`;
  const xs = prices.map(p => p.x);
  const ys = [...prices.map(p => p.price), ...trades.map(t => t.price), ...levelPrices];
  const hasData = xs.length > 0;
  const minX = hasData ? Math.min(...xs) : 0;
  const maxX = hasData ? Math.max(...xs) : 1;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 1;
  const yPadding = Math.max((maxY - minY) * 0.3, maxY * 0.02, 0.01);
  const xPadding = minX === maxX ? 1 : (maxX - minX) * 0.03;

  return <section aria-label="가격·매매 차트" className="space-y-3 rounded-xl border border-line bg-surface-muted p-4 ">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="font-semibold">차수별 매매 흐름</h4><p className="mt-1 text-xs text-muted">체결 기록만 순서대로 연결 · 거래 없는 구간 제외</p></div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="차트 차수 선택" className={control} value={slot} onChange={e => { setSlot(Number(e.target.value)); setSelected(""); }}>
          <option value={0}>전체 차수</option>{Array.from({ length: Math.max(maxTranches, ...data?.trades.map(t => t.slot) ?? []) }, (_, i) => <option key={i} value={i + 1}>{i + 1}차</option>)}
        </select>
        <button type="button" className={control} onClick={() => setReload(n => n + 1)} disabled={!data && !error}>차트 새로고침</button>
      </div>
    </div>
    <p className="text-xs leading-5 text-muted">선은 체결가를 연결한 것으로, 중간 시세나 시간 간격을 나타내지 않습니다. {mode === "live" ? "B/S 한 개는 체결된 주문 한 건의 누적 평균 체결가입니다. 부분 체결은 포함하고 미체결 주문은 제외합니다. B/S 옆 날짜는 한국시간 주문일이며, 정확한 체결 시각과는 다를 수 있습니다." : "B/S 한 개는 차수·회차별 모의 체결 한 건입니다. 원래 관측 번호는 거래 상세에 표시합니다."}</p>
    {error ? <p role="alert" className="py-6 text-sm text-red-ink">{error}</p> : !data ? <p role="status" className="py-12 text-center text-sm text-muted">체결 기록을 불러오는 중…</p> : !hasData ? <p className="py-12 text-center text-sm text-muted">아직 체결 기록이 없습니다.</p> : <>
      <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="가격과 매수 매도 그래프">
        <div style={{ minWidth: Math.max(640, groups.length * 104 + 128), height: 400 }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 400 }}>
            <LineChart data={prices} margin={{ top: 60, right: 52, bottom: 40, left: 20 }}>
              <XAxis type="number" dataKey="x" domain={[minX - xPadding, maxX + xPadding]} ticks={groups.length <= 10 ? groups.map(g => g.x) : undefined} tickCount={6} allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} tickFormatter={axisLabel} />
              <YAxis type="number" domain={[Math.max(0, minY - yPadding), maxY + yPadding]} ticks={levelPrices} interval={0} axisLine={false} tickLine={false} width={64} tick={{ fontSize: 13, fill: "var(--muted)" }} tickFormatter={n => levels.filter(l => l.price === n).map(l => `${l.slot}차`).join("·")} />
              <Tooltip contentStyle={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--foreground)" }} itemStyle={{ color: "var(--foreground)" }} labelFormatter={value => axisLabel(Number(value))} formatter={value => money(Number(value))} />
              <Line dataKey="price" name="체결가" type="linear" stroke="var(--chart-line)" strokeWidth={2} dot={false} isAnimationActive={false} />
              {levelPrices.map(price => <ReferenceLine key={price} y={price} stroke="var(--line)" strokeDasharray="6 6" />)}
              {groups.map(group => <ReferenceDot key={group.key} x={group.x} y={group.price} ifOverflow="extendDomain" shape={({ cx = 0, cy = 0 }) => {
                const buy = group.side === "BUY";
                const color = buy ? "var(--chart-buy)" : "var(--chart-sell)";
                const offset = buy ? 24 : -24;
                const label = `${buy ? "B" : "S"}${group.trades.length > 1 ? `×${group.trades.length}` : ""}`;
                const orderDate = group.trades[0].orderDate;
                const description = `${axisLabel(group.x)} ${buy ? "매수" : "매도"} ${money(group.price)} ${group.trades.length}건${orderDate ? ` · 주문일 ${orderDate}` : ""}`;
                return <g role="button" tabIndex={0} aria-label={description} className="cursor-pointer outline-none" onClick={() => setSelected(group.key)} onFocus={() => setSelected(group.key)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(group.key); } }}>
                  <title>{description}</title><line x1={cx} y1={cy} x2={cx} y2={cy + offset} stroke={color} /><circle cx={cx} cy={cy} r={3} fill={color} />
                  <path d={buy ? `M ${cx} ${cy + 8} l 18 10 v 24 h -36 v -24 Z` : `M ${cx} ${cy - 8} l 18 -10 v -24 h -36 v 24 Z`} fill={color} stroke={active?.key === group.key ? "var(--foreground)" : "var(--surface)"} strokeWidth={2} />
                  <text x={cx} y={cy + offset + (buy ? 6 : -1)} textAnchor="middle" fontSize={group.trades.length > 1 ? 12 : 18} fontWeight={700} fill="var(--chart-marker-text)">{label}</text>
                  {orderDate && <text x={cx} y={cy + (buy ? 58 : -52)} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)" stroke="var(--surface-muted)" strokeWidth={3} paintOrder="stroke">{orderDate}</text>}
                </g>;
              }} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs"><span className="text-red-ink">B 매수 체결</span><span className="text-blue-ink">S 매도 체결</span><span className="text-muted">왼쪽 차수·점선은 실제 매수한 차수의 최근 회차 평균 체결가 기준입니다.</span></div>
      <p className="text-xs text-muted sm:hidden">차트를 좌우로 밀어 전체 구간을 확인하세요.</p>
      {groups.length > 0 ? <div className="space-y-2 rounded-lg bg-surface-muted p-3 ">
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted">거래 상세<select aria-label="차트 거래 선택" className={`${control} max-w-full`} value={active?.key ?? ""} onChange={e => setSelected(e.target.value)}>{groups.map(g => <option key={g.key} value={g.key}>{axisLabel(g.x)}{g.trades[0].orderDate ? ` · ${g.trades[0].orderDate}` : ""} · {g.side === "BUY" ? "매수" : "매도"} · {money(g.price)} · {g.trades.length}건</option>)}</select></label>
        <ul aria-label="선택한 차트 거래" className="max-h-48 space-y-1 overflow-y-auto text-sm">{active?.trades.map(t => <li key={t.id}><strong className={t.side === "BUY" ? "text-red-ink" : "text-blue-ink"}>{t.side === "BUY" ? "매수" : "매도"}</strong> · {t.slot}차 {t.generation}회차 · {t.quantity.toLocaleString("ko-KR")}주 · {money(t.price)}<span className="mt-1 block text-xs text-muted">{mode === "live" ? "주문 시각 " : ""}{t.label}</span></li>)}</ul>
      </div> : <p className="text-xs text-muted">선택한 차수에 체결 기록이 없습니다.</p>}
    </>}
  </section>;
}
