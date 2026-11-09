"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NaverFinanceLink } from "@/components/stocks/NaverFinanceLink";
import { filterStrategyRows, monitoringWarning, type StrategyListRow } from "@/lib/split/strategy-list";
import { matchesPositionFilter, type PositionFilter } from "@/lib/split/strategy-tranches";
import { TrancheMatrix } from "./TrancheMatrix";
import { StrategyStatusBadge, pausedRowAccent } from "./StrategyStatusBadge";
import { ProfitSummary } from "./ProfitSummary";

const control = "min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm  ";
const money = (row: StrategyListRow, value: number | null) => value === null ? "—" : `${row.market === "KR" ? "₩" : "$"}${value.toLocaleString("ko-KR", { maximumFractionDigits: row.market === "KR" ? 0 : 2 })}`;

export function StrategyList({ live, simulations, mode, asOf, children }: { live: StrategyListRow[]; simulations: StrategyListRow[]; mode: "live" | "simulation"; asOf: number; children?: ReactNode }) {
  const router = useRouter();
  const [view, setView] = useState<"tranches" | "summary">("tranches");
  const [position, setPosition] = useState<PositionFilter>("all");
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [visibleCount, setVisibleCount] = useState(20);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setInterval(() => router.refresh(), 30000); return () => clearInterval(timer); }, [router]);
  const rows = mode === "live" ? live : simulations;
  const searched = filterStrategyRows(rows, query, market, status);
  const filtered = searched.filter(row => matchesPositionFilter(row, position));
  const visibleRows = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        setVisibleCount(count => count + 20);
      }
    }, { rootMargin: "200px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, visibleCount, filtered.length, query, market, status, position, view]);
  const active = rows.filter(row => ["active", "reserved"].includes(row.status)).length;
  const warningCount = mode === "live" ? live.filter(row => monitoringWarning(row, asOf)).length : 0;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2" aria-label="장부 구분">
        {([ ["live", "자동 실거래", live.length], ["simulation", "모의 장부", simulations.length] ] as const).map(([key, label, count]) => <Link key={key} href={`/stocks/split?mode=${key}`} aria-current={mode === key ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === key ? "bg-accent text-on-accent" : "bg-surface-inset text-muted  "}`}>{label} ({count})</Link>)}
      </div>
      <Link className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" href={`/stocks/split/new?mode=${mode}`}>+ {mode === "live" ? "실거래" : "모의"} 전략 등록</Link>
    </div>
    {children}
    <ProfitSummary entries={rows} mode={mode === "live" ? "실거래" : "모의"} />
    <aside aria-label="가격 갱신 안내" className="space-y-2 rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>화면 30초마다 갱신</strong><span className="text-xs text-muted">화면 조회 {new Date(asOf).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국시간)</span></div>
      <p className="text-xs leading-5 text-muted">{mode === "live" ? "자동 감시는 한 번의 처리 완료 후 30초를 기다립니다. 종목 수·API 응답·오류 재시도에 따라 실제 간격은 길어질 수 있습니다. 표시 가격은 마지막 매매 판단에 사용한 가격으로, 장외·일시정지·주문 확인 중에는 유지될 수 있습니다. 최근 감시 시각은 가격 갱신 시각과 다릅니다." : "모의 장부의 가격은 가격 경로 실행 또는 시세 관측 시 반영됩니다. 화면 자동 갱신만으로 새 가격이 반영되지는 않습니다."}</p>
      {warningCount > 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">감시 확인 필요 {warningCount}개 · 실행 기록이 없거나 최근 감시가 90초 이상 지난 전략입니다. 종목별 표시와 워커 실행 상태를 확인하세요. 처리 지연일 수 있으며 워커 중단을 확정하는 표시는 아닙니다.</p>}
    </aside>
    <section className="space-y-3" aria-label="전략 종목 목록">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{mode === "live" ? "실거래 종목" : "모의 종목"}</h2><p className="text-xs text-muted">전체 {rows.length}개 · 실행 중 {active}개 · 종목명순</p></div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label="보유 구분">
          {([["all", "전체"], ["held", "보유"], ["watching", "감시"], ["pending", "주문 확인"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={position === key} onClick={() => { setPosition(key); setVisibleCount(20); }} className={`rounded-full px-4 py-2 text-sm font-semibold ${position === key ? "bg-accent text-on-accent" : "bg-surface-inset text-muted  "}`}>{label} ({searched.filter(row => matchesPositionFilter(row, key)).length})</button>)}
        </div>
        <div className="flex gap-1 rounded-lg bg-surface-inset p-1 " aria-label="목록 보기 방식">
          {([["tranches", "차수별 보기"], ["summary", "요약 보기"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`rounded-md px-3 py-1.5 text-sm ${view === key ? "bg-surface font-semibold text-blue-ink shadow-sm  " : "text-muted"}`}>{label}</button>)}
        </div>
      </div>
      {position === "watching" && <p className="text-xs text-muted">보유와 미해결 주문이 없는 실행 중 전략입니다.</p>}
      {position === "pending" && <p className="text-xs text-muted">미체결·접수 불명·체결 비용 확인 등 처리가 끝나지 않은 주문이 있는 전략입니다.</p>}
      <div className="flex flex-wrap gap-2">
        <input aria-label="전략 종목 검색" className={`${control} flex-1 basis-52`} placeholder="종목명·코드·계좌 검색" value={query} onChange={e => { setQuery(e.target.value); setVisibleCount(20); }} />
        <select aria-label="전략 시장 필터" className={control} value={market} onChange={e => { setMarket(e.target.value); setVisibleCount(20); }}><option value="ALL">전체 시장</option><option value="KR">국내</option><option value="US">미국</option></select>
        <select aria-label="전략 상태 필터" className={control} value={status} onChange={e => { setStatus(e.target.value); setVisibleCount(20); }}><option value="ALL">전체 상태</option><option value="active">실행 중</option><option value="reserved">예약 감시 중</option><option value="paused">일시정지</option><option value="completed">종료</option></select>
      </div>
      {view === "tranches" && visibleRows.length > 0 ? <TrancheMatrix rows={visibleRows} mode={mode} asOf={asOf} /> : <div className="overflow-hidden rounded-xl border border-line bg-surface ">
        <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr_7rem] gap-3 bg-surface-muted px-4 py-3 text-right text-xs text-muted md:grid "><span className="text-left">종목 · 계좌</span><span>상태</span><span>보유</span><span>누적 수익금</span><span>총손익</span><span>관리</span></div>
        {visibleRows.map(row => <article key={row.id} aria-label={`${row.name} 전략`} className={`border-t border-line px-4 py-2 first:border-t-0 ${row.status === "paused" ? pausedRowAccent : ""}`}>
          <div className="grid items-center gap-2 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr_7rem]">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2"><Link className="font-semibold hover:text-blue-ink hover:underline" href={`/stocks/split/${mode}/${row.id}`}>{row.name}</Link>{row.market === "KR" && <NaverFinanceLink code={row.symbol} name="네이버 금융" className="text-[10px] text-blue-ink" />}</div><p className="mt-0.5 text-sm font-semibold tabular-nums"><span className="mr-1 text-xs font-normal text-muted">{mode === "live" ? "현재가" : "관측가"}</span>{row.lastPrice === null ? "미수신" : money(row, row.lastPrice)}<span className="ml-1 text-[10px] font-normal text-muted">{mode === "live" ? "최근 판단" : "최근 관측"}</span></p><p className="mt-1 text-xs text-muted">{row.symbol} · {row.accountLabel} · {row.market === "KR" ? "KRW" : "USD"}</p></div>
            <div className="flex justify-between gap-2 md:block md:text-right"><span className="text-xs text-muted md:hidden">상태</span><StrategyStatusBadge status={row.status} /></div>
            <div className="flex justify-between text-sm tabular-nums md:block md:text-right"><span className="text-xs text-muted md:hidden">보유</span><span>{row.holdingQty.toLocaleString("ko-KR")}주 <span className="whitespace-nowrap text-xs text-muted" title={mode === "live" ? "실제 매도 체결이 있는 주문 수 · 부분 체결도 주문당 1회 · 전체 이력 기준" : "모의 매도 완료 횟수 · 전체 이력 기준"}>· 매도 {row.sellCount.toLocaleString("ko-KR")}회</span></span></div>
            <div className="flex justify-between text-sm tabular-nums md:block md:text-right"><span className="text-xs text-muted md:hidden">누적 수익금</span><span className="font-medium">{money(row, row.realizedPnl)}</span></div>
            <div className="flex justify-between text-sm tabular-nums md:block md:text-right"><span className="text-xs text-muted md:hidden">총손익</span><span className={row.totalPnl !== null && row.totalPnl < 0 ? "text-blue-ink " : row.totalPnl !== null && row.totalPnl > 0 ? "text-red-ink " : ""}>{money(row, row.totalPnl)}</span></div>
            <Link href={`/stocks/split/${mode}/${row.id}`} className={`${control} text-center text-blue-ink hover:bg-blue-50 dark:hover:bg-blue-950`}>설정·장부</Link>
          </div>
          {mode === "live" && monitoringWarning(row, asOf) && <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">{monitoringWarning(row, asOf)}</p>}
          <p className="mt-2 truncate text-xs text-muted" title={row.note ?? undefined}>{row.lastCheckedAt ? `${mode === "live" ? "최근 감시" : "최근 관측"} ${new Date(row.lastCheckedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · ` : ""}{row.note ?? "시작 전 설정 확인"}</p>
        </article>)}
        {!visibleRows.length && <p className="p-10 text-center text-sm text-muted">{rows.length ? "검색 조건에 맞는 전략이 없습니다." : "등록된 전략이 없습니다. 전략 등록에서 종목을 추가하세요."}</p>}
      </div>}
      <div ref={sentinel} className="py-3 text-center text-sm text-muted" role="status">
        {filtered.length}개 중 {visibleRows.length}개 표시{hasMore ? " · 아래로 스크롤하면 더 표시됩니다." : filtered.length ? " · 모든 종목을 표시했습니다." : ""}
      </div>
    </section>
  </div>;
}
