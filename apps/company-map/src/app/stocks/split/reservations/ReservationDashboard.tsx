"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { listSplitReservations } from "@/actions/split-reservations";
import { pauseSplitLive } from "@/actions/split-live";
import { reservationDate, reservationLabels } from "@/lib/split/reservation";

type Data = Awaited<ReturnType<typeof listSplitReservations>>;
const control = "rounded-lg border border-line bg-surface px-3 py-2 text-sm";
const date = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "아직 없음";
const money = (value: number | null, market: string) => value === null ? "—" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}${market === "KR" ? "원" : "달러"}`;
const eventLabels: Record<string, string> = { ...reservationLabels, registered: "등록", updated: "조건 변경" };

export function ReservationDashboard({ data }: { data: Data }) {
  const router = useRouter();
  const [tab, setTab] = useState<"watching" | "executions" | "failures" | "history">("watching");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => { const timer = setInterval(() => router.refresh(), 30000); return () => clearInterval(timer); }, [router]);
  const matches = (name: string, symbol: string) => `${name} ${symbol}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const watching = data.rows.filter(r => ["waiting", "ordering"].includes(r.status));
  const rows = watching.filter(r => matches(r.strategy.name, r.strategy.symbol));
  const events = tab === "watching" ? [] : data[tab].filter(e => matches(e.reservation.strategy.name, e.reservation.strategy.symbol));
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">감시 중 {watching.filter(r => r.strategy.status === "reserved").length}개 · 대기·일시정지 {watching.filter(r => r.strategy.status === "paused").length}개</p>
      <Link className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent" href="/stocks/split/new?mode=live&entry=reservation">+ 예약 매수 등록</Link>
    </div>
    <p className="rounded-xl border border-line bg-surface-muted p-4 text-sm leading-6 text-muted">예약을 저장한 뒤 종목 상세에서 자동매매 시작을 확인하면 감시합니다. 유효일은 한국시간 기준이며, 거래 가능 시간의 유효 시세가 감시 가격 이하일 때 지정가 주문을 보냅니다. 접수만으로 체결 완료로 표시하지 않습니다. 워커가 실행 중이어야 하며 화면은 30초마다 갱신됩니다.</p>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="예약 매수 내역">
      {([["watching", "감시 현황"], ["executions", "실행 내역"], ["failures", "실패·만료 내역"], ["history", "전체 이력"]] as const).map(([key, label]) => <button type="button" role="tab" id={`reservation-${key}`} aria-controls={`reservation-${key}-panel`} aria-selected={tab === key} key={key} onClick={() => setTab(key)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === key ? "bg-accent text-on-accent" : "bg-surface-inset text-muted"}`}>{label}</button>)}
    </div>
    <div className="flex gap-2"><input aria-label="예약 종목 검색" className={`${control} min-w-0 flex-1`} value={query} onChange={e => setQuery(e.target.value)} placeholder="종목명·코드 검색" /><button type="button" className={control} onClick={() => router.refresh()}>새로고침</button></div>
    {message && <p role="status" className="text-sm">{message}</p>}
    <div role="tabpanel" id={`reservation-${tab}-panel`} aria-labelledby={`reservation-${tab}`} className="space-y-3">
      {tab === "watching" ? rows.length ? rows.map(r => <article key={r.strategyId} className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><Link href={`/stocks/split/live/${r.strategyId}`} className="font-semibold text-blue-ink hover:underline">{r.strategy.name}</Link><p className="mt-1 text-xs text-muted">{r.strategy.symbol} · 계좌 {r.strategy.accountSeq}</p></div><span className="rounded-full bg-surface-inset px-3 py-1 text-xs">{r.status === "ordering" ? reservationLabels.ordering : r.strategy.status === "reserved" ? "가격 감시 중" : "감시 시작 전·일시정지"}</span></div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><dt className="text-xs text-muted">감시 가격 이하</dt><dd className="mt-1 font-semibold">{money(r.watchPrice, r.strategy.market)}</dd></div><div><dt className="text-xs text-muted">마지막 판단가</dt><dd className="mt-1">{money(r.strategy.lastPrice, r.strategy.market)}</dd></div><div><dt className="text-xs text-muted">감시 유효일</dt><dd className="mt-1">{reservationDate(r.expiresAt)}</dd></div><div><dt className="text-xs text-muted">최근 감시 (한국시간)</dt><dd className="mt-1">{date(r.strategy.lastCheckedAt)}</dd></div></dl>
        <p className="break-words text-xs text-muted">{r.strategy.note ?? r.note}</p>
        <div className="flex flex-wrap gap-2"><Link className={control} href={`/stocks/split/live/${r.strategyId}`}>설정·감시 시작·장부</Link>{r.strategy.status === "reserved" && <button className={control} disabled={pending} onClick={() => start(async () => { try { const result = await pauseSplitLive(r.strategyId); setMessage(result.message); router.refresh(); } catch { setMessage("정지 결과를 확인하지 못했습니다. 새로고침 후 확인하세요."); } })}>감시 일시정지</button>}</div>
      </article>) : <p className="rounded-xl border border-line bg-surface p-8 text-center text-muted">{query ? "검색 결과가 없습니다." : "등록된 감시가 없습니다. 예약 매수를 등록해 주세요."}</p> : <>
        <p className="text-xs text-muted">이 탭의 최근 200건 · 시각은 한국시간 · 조건 도달과 실제 체결을 구분해 표시합니다.</p>
        {events.map(e => <article key={e.id} className="space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><Link className="font-semibold text-blue-ink hover:underline" href={`/stocks/split/live/${e.strategyId}`}>{e.reservation.strategy.name} · {e.reservation.strategy.symbol}</Link><time className="text-xs text-muted">{date(e.createdAt)}</time></div>
          <p className={e.type === "failed" ? "text-red-ink" : "font-medium"}>{eventLabels[e.type] ?? e.type}</p><p className="break-words">{e.message}</p>
          <p className="text-xs text-muted">계좌 {e.reservation.strategy.accountSeq} · 감시 가격 {money(e.watchPrice, e.reservation.strategy.market)} · 유효일 {reservationDate(e.expiresAt)}</p>
          {e.orderId && <Link href={`/stocks/split/live/${e.strategyId}`} className="inline-block text-xs text-blue-ink underline">연결된 주문·체결 상태 확인</Link>}
        </article>)}
        {!events.length && <p className="rounded-xl border border-line bg-surface p-8 text-center text-muted">조회할 내역이 없습니다.</p>}
      </>}
    </div>
  </section>;
}
