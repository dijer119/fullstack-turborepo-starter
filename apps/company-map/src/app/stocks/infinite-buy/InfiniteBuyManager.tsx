"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  createCycle, updateCycle, deleteCycle, runCycleNow, getCycleOrders, getPriceHistory,
  type CycleView, type OrderView,
} from "@/actions/infinite-buy";
import type { DailyCandle } from "@/lib/toss/client";

function usd(v: number | null): string {
  return v == null ? "—" : `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function pct(v: number | null): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function InfiniteBuyManager({
  cycles,
  usdBuyingPower,
}: {
  cycles: CycleView[];
  usdBuyingPower: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<Record<string, OrderView[]>>({});
  const [charts, setCharts] = useState<Record<string, DailyCandle[]>>({});

  const onCreate = () =>
    start(async () => {
      setMsg(null);
      const r = await createCycle({ symbol, name, principal: Number(principal) });
      if (!r.ok) { setMsg(r.reason ?? "실패"); return; }
      setSymbol(""); setName(""); setPrincipal("");
      router.refresh();
    });

  const toggleDryRun = (c: CycleView) =>
    start(async () => {
      if (c.dryRun && !confirm(`${c.symbol}를 LIVE로 전환합니다. 실제 주문이 체결됩니다. 계속할까요?`)) return;
      await updateCycle(c.id, { dryRun: !c.dryRun });
      router.refresh();
    });

  const setStatus = (c: CycleView, status: string) =>
    start(async () => { await updateCycle(c.id, { status }); router.refresh(); });

  const remove = (c: CycleView) =>
    start(async () => {
      if (!confirm(`${c.symbol} 사이클을 삭제할까요? (주문 이력도 삭제)`)) return;
      await deleteCycle(c.id); router.refresh();
    });

  const runNow = (c: CycleView) =>
    start(async () => {
      if (!c.dryRun && !confirm(`${c.symbol} LIVE 즉시 실행 — 실제 주문이 들어갑니다. 계속할까요?`)) return;
      const r = await runCycleNow(c.id);
      setMsg(r.ok ? `${c.symbol} 실행됨` : (r.reason ?? "실패"));
      router.refresh();
    });

  const loadOrders = (c: CycleView) =>
    start(async () => {
      if (openOrders[c.id]) { setOpenOrders((p) => { const n = { ...p }; delete n[c.id]; return n; }); return; }
      const orders = await getCycleOrders(c.id);
      setOpenOrders((p) => ({ ...p, [c.id]: orders }));
    });

  const loadChart = (c: CycleView) =>
    start(async () => {
      if (charts[c.id]) { setCharts((p) => { const n = { ...p }; delete n[c.id]; return n; }); return; }
      const data = await getPriceHistory(c.symbol);
      setCharts((p) => ({ ...p, [c.id]: data }));
    });

  return (
    <div className="space-y-6">
      {/* USD 잔고 + 갱신 */}
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
        <div className="text-sm">
          <span className="text-gray-500">USD 매수가능금액</span>{" "}
          <span className="font-semibold tabular-nums">{usd(usdBuyingPower)}</span>
          {usdBuyingPower == null && (
            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">(토스 조회 실패/미설정)</span>
          )}
        </div>
        <button
          onClick={() => start(() => router.refresh())}
          disabled={pending}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {pending ? "갱신 중…" : "갱신"}
        </button>
      </section>

      {/* 등록 폼 */}
      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-2 text-sm font-semibold">새 사이클</h2>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">심볼(US)</span>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="TQQQ"
              className="w-28 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">종목명</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="(선택)"
              className="w-40 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">원금(USD)</span>
            <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="4000"
              className="w-28 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
          </label>
          <button onClick={onCreate} disabled={pending}
            className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50">
            추가 (dryRun)
          </button>
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
        </div>
        <p className="mt-1 text-xs text-gray-400">기본: 40분할 · 익절 +10% · 큰수 +12% · 손절 -10%. 모든 사이클은 dryRun으로 시작.</p>
      </section>

      {/* 사이클 목록 */}
      {cycles.length === 0 ? (
        <p className="text-sm text-gray-500">등록된 사이클이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {cycles.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <span className="font-mono text-xs text-gray-500">{c.symbol}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${c.dryRun
                    ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                    {c.dryRun ? "dryRun" : "LIVE"}
                  </span>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    {c.status}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <button onClick={() => toggleDryRun(c)} disabled={pending} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                    {c.dryRun ? "LIVE 전환" : "dryRun 전환"}
                  </button>
                  <button onClick={() => runNow(c)} disabled={pending} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">지금 실행</button>
                  {c.status === "active"
                    ? <button onClick={() => setStatus(c, "paused")} disabled={pending} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">일시정지</button>
                    : <button onClick={() => setStatus(c, "active")} disabled={pending} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">재개</button>}
                  <button onClick={() => remove(c)} disabled={pending} className="rounded border border-gray-300 px-2 py-1 text-red-600 hover:bg-red-50 dark:border-gray-700 dark:hover:bg-gray-800">삭제</button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <div><span className="text-gray-500">진행</span> {c.round}/{c.splits}</div>
                <div><span className="text-gray-500">원금</span> {usd(c.principal)}</div>
                <div><span className="text-gray-500">평단</span> {usd(c.avgPrice)}</div>
                <div><span className="text-gray-500">보유</span> {c.holdingQty ?? "—"}</div>
                <div><span className="text-gray-500">수익률</span> <span className={c.pnlPct == null ? "" : c.pnlPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>{pct(c.pnlPct)}</span></div>
                <div><span className="text-gray-500">목표매도</span> {usd(c.targetSellPrice)}</div>
                <div><span className="text-gray-500">마지막실행</span> {c.lastRunDate ?? "—"}</div>
              </div>

              <div className="mt-2 flex gap-3">
                <button onClick={() => loadChart(c)} disabled={pending} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                  {charts[c.id] ? "가격 차트 닫기" : "가격 차트 보기"}
                </button>
                <button onClick={() => loadOrders(c)} disabled={pending} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                  {openOrders[c.id] ? "주문 이력 닫기" : "주문 이력 보기"}
                </button>
              </div>

              {charts[c.id] && (
                charts[c.id].length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">가격 데이터를 불러올 수 없습니다 (토스 미설정/조회 실패).</p>
                ) : (
                  <div className="mt-2">
                    <p className="mb-1 text-xs text-gray-500">
                      일별 종가 (최근 {charts[c.id].length}거래일) · <span className="text-green-600 dark:text-green-400">초록=평단 {usd(c.avgPrice)}</span> · <span className="text-red-600 dark:text-red-400">빨강=익절목표 {usd(c.targetSellPrice)}</span>
                    </p>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={charts[c.id].map((d) => ({ date: d.date.slice(5), close: d.close }))} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" fontSize={11} minTickGap={28} />
                          <YAxis fontSize={11} width={56} domain={["auto", "auto"]} tickFormatter={(v: number) => `$${v}`} />
                          <Tooltip formatter={(v) => (typeof v === "number" ? `$${v.toFixed(2)}` : v)} />
                          <Line type="monotone" dataKey="close" name="종가" stroke="#2563eb" dot={false} strokeWidth={1.6} />
                          {c.avgPrice != null && (
                            <ReferenceLine y={c.avgPrice} stroke="#16a34a" strokeDasharray="4 2"
                              label={{ value: `평단 ${usd(c.avgPrice)}`, position: "insideTopLeft", fontSize: 10, fill: "#16a34a" }} />
                          )}
                          {c.targetSellPrice != null && (
                            <ReferenceLine y={c.targetSellPrice} stroke="#dc2626" strokeDasharray="2 2"
                              label={{ value: `익절 ${usd(c.targetSellPrice)}`, position: "insideBottomLeft", fontSize: 10, fill: "#dc2626" }} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )
              )}
              {openOrders[c.id] && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-gray-500">
                      <th className="p-1">거래일</th><th className="p-1">회차</th><th className="p-1">종류</th>
                      <th className="p-1 text-right">가격</th><th className="p-1 text-right">수량</th><th className="p-1">상태</th>
                    </tr></thead>
                    <tbody>
                      {openOrders[c.id].length === 0 ? (
                        <tr><td colSpan={6} className="p-2 text-gray-500">주문 이력 없음</td></tr>
                      ) : openOrders[c.id].map((o) => (
                        <tr key={o.id} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="p-1">{o.tradeDate}</td>
                          <td className="p-1">{o.round}</td>
                          <td className="p-1">{o.side}/{o.kind}</td>
                          <td className="p-1 text-right">{o.price == null ? "MKT" : usd(o.price)}</td>
                          <td className="p-1 text-right">{o.quantity}</td>
                          <td className="p-1">{o.status}{o.error ? ` (${o.error})` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
