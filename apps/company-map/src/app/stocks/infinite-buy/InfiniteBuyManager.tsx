"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  createCycle, updateCycle, deleteCycle, runCycleNow, getCycleOrders, getPriceHistory, getSellHistory, syncSellFills, getRsiTable,
  type CycleView, type OrderView, type RsiTable,
} from "@/actions/infinite-buy";
import type { DailyCandle } from "@/lib/toss/client";

function usd(v: number | null): string {
  return v == null ? "—" : `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function pct(v: number | null): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// 매도 주문 kind → 한글 라벨 (v1/v2.2/v4 공통)
function sellKindLabel(kind: string): string {
  switch (kind) {
    case "reset_sell": return "손절";
    case "target_sell": return "익절(+10%)";       // v1
    case "sell_lim_10": return "지정가(+10%)";      // v2.2 3/4
    case "sell_loc_var": return "LOC(변동)";        // v2.2 1/4 @ (10−T/2)%
    case "sell_loc_star": return "쿼터(LOC@별지점)"; // v4 ¼
    case "sell_lim_target": return "지정가(+base%)";  // v4 ¾
    default: return kind;
  }
}

export function InfiniteBuyManager({
  cycles,
  usdBuyingPower,
  initialRsi,
}: {
  cycles: CycleView[];
  usdBuyingPower: number | null;
  initialRsi: RsiTable;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [version, setVersion] = useState<"v1" | "v2.2" | "v4.0">("v1");
  const [starBase, setStarBase] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<Record<string, OrderView[]>>({});
  const [sells, setSells] = useState<Record<string, OrderView[]>>({});
  const [charts, setCharts] = useState<Record<string, DailyCandle[]>>({});
  const [rsi, setRsi] = useState<RsiTable>(initialRsi);
  const [rsiLoading, setRsiLoading] = useState(false);

  const onCreate = () =>
    start(async () => {
      setMsg(null);
      const r = await createCycle({
        symbol, name, principal: Number(principal), version,
        starBase: starBase ? Number(starBase) : undefined,
      });
      if (!r.ok) { setMsg(r.reason ?? "실패"); return; }
      setSymbol(""); setName(""); setPrincipal(""); setVersion("v1"); setStarBase("");
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

  const loadSells = (c: CycleView) =>
    start(async () => {
      if (sells[c.id]) { setSells((p) => { const n = { ...p }; delete n[c.id]; return n; }); return; }
      const data = await getSellHistory(c.id);
      setSells((p) => ({ ...p, [c.id]: data }));
    });

  const syncSells = (c: CycleView) =>
    start(async () => {
      setMsg(null);
      const r = await syncSellFills(c.id);
      setMsg(r.ok ? `${c.symbol} 체결 동기화: ${r.updated}건 반영` : (r.reason ?? "실패"));
      const data = await getSellHistory(c.id);
      setSells((p) => ({ ...p, [c.id]: data }));
    });

  const refreshRsi = () => {
    setRsiLoading(true);
    start(async () => {
      try {
        setRsi(await getRsiTable(true)); // 15종목 순차 수집 (~20초)
      } finally {
        setRsiLoading(false);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* USD 잔고 + 갱신 */}
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-gray-500">USD 매수가능금액</span>{" "}
            <span className="font-semibold tabular-nums">{usd(usdBuyingPower)}</span>
            {usdBuyingPower == null && (
              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">(토스 조회 실패/미설정)</span>
            )}
          </div>
          {(() => {
            // 전체 사이클 누적 실현수익 합계 (체결 확인된 매도 기준). 항상 표시.
            const hasFills = cycles.some((c) => c.realizedPnl != null);
            const total = cycles.reduce((a, c) => a + (c.realizedPnl ?? 0), 0);
            return (
              <div title="모든 사이클의 체결 확인된 매도(익절/손절) 실현수익 합계. '토스 체결 동기화'로 갱신됨">
                <span className="text-gray-500">전체 누적수익</span>{" "}
                <span className={`font-semibold tabular-nums ${
                  !hasFills ? "text-gray-400"
                    : total >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}>
                  {total >= 0 ? "+" : ""}${total.toFixed(2)}
                </span>
                {!hasFills && <span className="ml-1.5 text-xs text-gray-400">(체결된 매도 없음)</span>}
              </div>
            );
          })()}
        </div>
        <button
          onClick={() => start(() => router.refresh())}
          disabled={pending}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {pending ? "갱신 중…" : "갱신"}
        </button>
      </section>

      {/* RSI 모니터 — 무한매수 유니버스(3배 ETF 15종) */}
      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            RSI(14) — 3배 ETF 유니버스
            <span className="ml-2 text-xs font-normal text-gray-400">≤30 과매도 · ≥60 과매수</span>
          </h2>
          <div className="flex items-center gap-2">
            {rsi.fetchedAt && (
              <span className="text-xs text-gray-400">
                갱신 {new Date(rsi.fetchedAt).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(5, 16)}
              </span>
            )}
            <button
              onClick={refreshRsi}
              disabled={rsiLoading || pending}
              className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {rsiLoading ? "수집 중… (~20초)" : "RSI 갱신"}
            </button>
          </div>
        </div>
        {rsi.rows.length === 0 ? (
          <p className="text-sm text-gray-500">아직 수집 전입니다. RSI 갱신을 눌러 토스에서 수집하세요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="p-1.5">심볼</th>
                  <th className="p-1.5 text-right">RSI</th>
                  <th className="p-1.5 text-right">종가</th>
                  <th className="p-1.5">기준일</th>
                  <th className="p-1.5">판정</th>
                </tr>
              </thead>
              <tbody>
                {rsi.rows.map((r) => {
                  const hasCycle = cycles.some((c) => c.symbol === r.symbol && c.status === "active");
                  return (
                    <tr key={r.symbol} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="p-1.5 font-mono">
                        {r.symbol}
                        {hasCycle && (
                          <span className="ml-1.5 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">사이클</span>
                        )}
                      </td>
                      <td className={`p-1.5 text-right font-semibold tabular-nums ${
                        r.rsi == null ? "text-gray-400"
                          : r.rsi <= 30 ? "text-green-600 dark:text-green-400"
                          : r.rsi >= 60 ? "text-red-600 dark:text-red-400" : ""
                      }`}>
                        {r.rsi == null ? "—" : r.rsi.toFixed(1)}
                      </td>
                      <td className="p-1.5 text-right tabular-nums">{r.close == null ? "—" : usd(r.close)}</td>
                      <td className="p-1.5 text-gray-500">{r.date ?? "—"}</td>
                      <td className="p-1.5 text-xs">
                        {r.error ? (
                          <span className="text-amber-600 dark:text-amber-400" title={r.error}>조회 실패</span>
                        ) : r.rsi == null ? "" : r.rsi <= 30 ? (
                          <span className="text-green-600 dark:text-green-400">과매도</span>
                        ) : r.rsi >= 60 ? (
                          <span className="text-red-600 dark:text-red-400">과매수</span>
                        ) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">전략</span>
            <select value={version} onChange={(e) => setVersion(e.target.value as "v1" | "v2.2" | "v4.0")}
              className="w-28 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
              <option value="v1">v1</option>
              <option value="v2.2">v2.2</option>
              <option value="v4.0">v4.0</option>
            </select>
          </label>
          {version === "v4.0" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">별% base</span>
              <input type="number" value={starBase} onChange={(e) => setStarBase(e.target.value)}
                placeholder="TQQQ 15 / SOXL 20 자동"
                className="w-40 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
            </label>
          )}
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
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                    {c.version}
                  </span>
                  {c.note && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title={c.note}>
                      ⚠ {c.note.length > 30 ? `${c.note.slice(0, 30)}…` : c.note}
                    </span>
                  )}
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
                <div>
                  <span className="text-gray-500">진행</span>{" "}
                  {c.version === "v4.0"
                    ? `T ${c.tValue == null ? "—" : c.tValue.toFixed(2)}/${c.splits}`
                    : `${c.round}/${c.splits}`}
                </div>
                <div><span className="text-gray-500">원금</span> {usd(c.principal)}</div>
                <div><span className="text-gray-500">평단</span> {usd(c.avgPrice)}</div>
                <div><span className="text-gray-500">보유</span> {c.holdingQty ?? "—"}</div>
                <div><span className="text-gray-500">수익률</span> <span className={c.pnlPct == null ? "" : c.pnlPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>{pct(c.pnlPct)}</span></div>
                <div><span className="text-gray-500">목표매도</span> {usd(c.targetSellPrice)}</div>
                <div>
                  <span className="text-gray-500">누적수익</span>{" "}
                  <span className={c.realizedPnl == null ? "" : c.realizedPnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"} title="체결 확인된 매도(익절/손절) 실현수익 합계. '토스 체결 동기화'로 갱신됨">
                    {c.realizedPnl == null ? "—" : `${c.realizedPnl >= 0 ? "+" : ""}$${c.realizedPnl.toFixed(2)}`}
                  </span>
                </div>
                {c.version === "v4.0" && (
                  <>
                    <div><span className="text-gray-500">잔금</span> {usd(c.cashRemaining)}</div>
                    <div><span className="text-gray-500">별지점</span> {usd(c.starPrice)}</div>
                    <div><span className="text-gray-500">1회매수금</span> {usd(c.perBuyAmount)}</div>
                  </>
                )}
                <div><span className="text-gray-500">마지막실행</span> {c.lastRunDate ?? "—"}</div>
              </div>

              <div className="mt-2 flex gap-3">
                <button onClick={() => loadChart(c)} disabled={pending} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                  {charts[c.id] ? "가격 차트 닫기" : "가격 차트 보기"}
                </button>
                <button onClick={() => loadSells(c)} disabled={pending} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                  {sells[c.id] ? "매도 이력 닫기" : "매도 이력 보기"}
                </button>
                <button onClick={() => loadOrders(c)} disabled={pending} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                  {openOrders[c.id] ? "주문 이력 닫기" : "주문 이력 보기"}
                </button>
              </div>

              {sells[c.id] && (
                <div className="mt-2 overflow-x-auto">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      매도 <b>체결</b> 이력 (익절/손절) · 자동 리셋 후에도 누적
                      {sells[c.id].length > 0 && (() => {
                        const sum = sells[c.id].reduce((a, o) => a + (o.realizedPnl ?? 0), 0);
                        return <> · 실현손익 합계 <span className={sum >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>{sum >= 0 ? "+" : ""}${sum.toFixed(2)}</span></>;
                      })()}
                    </p>
                    <button onClick={() => syncSells(c)} disabled={pending} className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800">
                      토스 체결 동기화
                    </button>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-gray-500">
                      <th className="p-1">체결일</th><th className="p-1">회차</th><th className="p-1">종류</th>
                      <th className="p-1 text-right">평단</th><th className="p-1 text-right">체결가</th>
                      <th className="p-1 text-right">체결수량</th><th className="p-1 text-right">실현손익</th>
                    </tr></thead>
                    <tbody>
                      {sells[c.id].length === 0 ? (
                        <tr><td colSpan={7} className="p-2 text-gray-500">체결된 매도 없음. 상단 동기화 버튼으로 확인하세요.</td></tr>
                      ) : sells[c.id].map((o) => (
                        <tr key={o.id} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="p-1">{o.filledAt ? o.filledAt.slice(0, 10) : o.tradeDate}</td>
                          <td className="p-1">{o.round}</td>
                          <td className="p-1">{sellKindLabel(o.kind)}</td>
                          <td className="p-1 text-right">{usd(o.avgCost)}</td>
                          <td className="p-1 text-right">{usd(o.filledPrice ?? o.price)}</td>
                          <td className="p-1 text-right">{o.filledQty ?? o.quantity}</td>
                          <td className={`p-1 text-right ${o.realizedPnl == null ? "" : o.realizedPnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                            {o.realizedPnl == null ? "—" : `${o.realizedPnl >= 0 ? "+" : ""}$${o.realizedPnl.toFixed(2)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

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
