"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Settings2, Star, RefreshCw } from "lucide-react";
import { addWatch, removeWatch, searchWatchCandidates, saveWatchGroupAction, deleteWatchGroupAction, setWatchGroupAction, clearRecentStocks, type listWatchDashboard, type StockWatchRow } from "@/actions/stock-watches";
import type { StockSearchResult } from "@/lib/stocks/naver-search";
import { isValidStockCode } from "@/lib/stocks/stock-code";
import { WatchlistManager } from "./WatchlistManager";

type Data = Awaited<ReturnType<typeof listWatchDashboard>>;
const button = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-surface-muted disabled:opacity-50   ";
const input = "min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100   dark:focus:ring-blue-900";

function price(value: number | null, currency: string | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${Math.abs(value).toLocaleString("ko-KR", { maximumFractionDigits: currency === "USD" ? 2 : 0, minimumFractionDigits: currency === "USD" ? 2 : 0 })}${currency === "USD" ? "달러" : "원"}`;
}

function StockCard({ stock, watched, groups, pending, onAdd, onRemove, onGroup }: {
  stock: StockWatchRow;
  watched: boolean;
  groups: Data["groups"];
  pending: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onGroup: (id: string, selected: boolean) => void;
}) {
  const diff = stock.lastPrice !== null && stock.changeBase !== null && stock.changeBase > 0 ? stock.lastPrice - stock.changeBase : null;
  const changeClass = diff === null || diff === 0 ? "text-muted" : diff > 0 ? "text-red-ink" : "text-blue-ink";
  const domestic = stock.currency === "KRW" && isValidStockCode(stock.symbol);
  const name = <><span className="truncate font-semibold">{stock.name}</span>{stock.nxtSupported && <span className="shrink-0 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">NXT 지원</span>}</>;
  return (
    <article className="min-w-0 border-b border-line px-4 py-5 last:border-0 sm:px-6 " aria-label={`${stock.name} 관심종목`}>
      <div className="flex min-w-0 items-center gap-3">
        <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white dark:bg-slate-600">{stock.name.slice(0, 1)}</div>
        <div className="min-w-0 flex-1">
          {domestic ? <Link href={`/stocks/${stock.symbol}`} prefetch={false} className="flex flex-wrap items-center gap-1.5 rounded focus-visible:outline-2 focus-visible:outline-blue-500 hover:underline">{name}</Link> : <span className="flex flex-wrap items-center gap-1.5">{name}</span>}
          <p className="mt-1 text-xs text-subtle">{stock.symbol} · {stock.market ?? (stock.currency === "USD" ? "미국" : "국내")}</p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="font-semibold">{price(stock.lastPrice, stock.currency)}</p>
          <p className={`mt-0.5 text-xs font-medium sm:text-sm ${changeClass}`}>{diff === null ? "등락 정보 없음" : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${price(diff, stock.currency)} (${diff > 0 ? "+" : ""}${(diff / stock.changeBase! * 100).toFixed(2)}%)`}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-[52px]">
        <span className="text-[11px] text-subtle">{stock.quotedAt ? `시세 ${new Date(stock.quotedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "시세 조회 불가"}</span>
        {watched ? <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface-inset "><Settings2 size={13} /> 관리</summary>
          <div className="absolute right-0 z-10 mt-1 w-60 space-y-2 rounded-xl border border-line bg-surface p-3 shadow-lg  ">
            <p className="text-xs font-semibold">관심 그룹 선택</p>
            {groups.length === 0 && <p className="text-xs text-muted">상단 그룹 관리에서 그룹을 만드세요.</p>}
            <div className="max-h-52 space-y-2 overflow-y-auto">{groups.map(g => <label key={g.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={g.symbols.includes(stock.symbol)} disabled={pending} onChange={e => onGroup(g.id, e.target.checked)} />{g.name}</label>)}</div>
            <button className="w-full border-t border-line pt-2 text-left text-xs text-red-ink disabled:opacity-50 " disabled={pending} onClick={onRemove}>관심종목에서 삭제</button>
          </div>
        </details> : <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-ink hover:bg-blue-50 disabled:opacity-50" disabled={pending} onClick={onAdd}><Star size={13} /> 관심 등록</button>}
      </div>
    </article>
  );
}

export function WatchlistDashboard({ data }: { data: Data }) {
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [market, setMarket] = useState("ALL");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [rename, setRename] = useState<Record<string, string>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!query.trim()) return;
      try {
        const found = await searchWatchCandidates(query);
        if (!cancelled) setResults(found);
      } catch { if (!cancelled) setMessage("검색하지 못했습니다. 다시 입력해 주세요."); }
      finally { if (!cancelled) setSearching(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  const selectedGroup = data.groups.find(g => g.id === tab);
  const effectiveTab = ["all", "recent", "ungrouped"].includes(tab) || selectedGroup ? tab : "all";
  const grouped = new Set(data.groups.flatMap(g => g.symbols));
  const ungrouped = data.watches.filter(w => !grouped.has(w.symbol));
  const candidates = effectiveTab === "recent" ? data.recent : effectiveTab === "ungrouped" ? ungrouped : selectedGroup ? data.watches.filter(w => selectedGroup.symbols.includes(w.symbol)) : data.watches;
  const rows = candidates.filter(w => market === "ALL" || w.currency === market);
  const watched = new Set(data.watches.map(w => w.symbol));
  const execute = (work: () => Promise<{ ok: boolean; reason?: string }>, success: string) => start(async () => {
    try {
      const result = await work();
      setMessage(result.ok ? success : result.reason ?? "처리하지 못했습니다.");
      if (result.ok) router.refresh();
    } catch { setMessage("요청을 처리하지 못했습니다. 다시 시도하세요."); }
  });
  const add = (symbol: string) => execute(async () => {
    const result = await addWatch(symbol, selectedGroup?.id);
    if (result.ok) { setQuery(""); setResults([]); setSearchOpen(false); }
    return result;
  }, selectedGroup ? `${selectedGroup.name}에 추가했습니다.` : "관심종목에 추가했습니다.");
  const tabs = [{ id: "recent", name: "최근 본", count: data.recent.length }, { id: "all", name: "전체 관심", count: data.watches.length }, { id: "ungrouped", name: "미분류", count: ungrouped.length }, ...data.groups.map(g => ({ id: g.id, name: g.name, count: g.symbols.length }))];
  return (
    <section className="min-w-0 space-y-5 rounded-2xl bg-surface-muted p-3 sm:p-5 " aria-label="관심종목 관리">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label="관심 목록">{tabs.map(t => <button key={t.id} type="button" aria-pressed={effectiveTab === t.id} onClick={() => setTab(t.id)} className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${effectiveTab === t.id ? "bg-accent text-on-accent" : "bg-surface-inset text-muted hover:bg-line  "}`}>{t.name} ({t.count})</button>)}</div>
        <button className={button} onClick={() => setGroupOpen(!groupOpen)} aria-expanded={groupOpen}><Settings2 size={15} /> 그룹 관리</button>
      </div>
      {groupOpen && <div className="space-y-3 rounded-xl border border-line bg-surface p-4  ">
        <h2 className="font-semibold">관심 그룹 관리</h2>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); execute(async () => { const result = await saveWatchGroupAction(null, newGroup); if (result.ok) setNewGroup(""); return result; }, "그룹을 만들었습니다."); }}>
          <input aria-label="새 그룹 이름" className={`${input} flex-1`} placeholder="예: 배당주, 반도체, 분할매매 후보" maxLength={30} value={newGroup} onChange={e => setNewGroup(e.target.value)} required />
          <button className={button} disabled={pending || !newGroup.trim()}><Plus size={15} /> 만들기</button>
        </form>
        {data.groups.map(g => <div key={g.id} className="flex flex-wrap gap-2">
          <input aria-label={`${g.name} 그룹 이름`} className={`${input} flex-1`} maxLength={30} value={rename[g.id] ?? g.name} onChange={e => setRename({ ...rename, [g.id]: e.target.value })} />
          <button className={button} disabled={pending || !(rename[g.id] ?? g.name).trim()} onClick={() => execute(() => saveWatchGroupAction(g.id, rename[g.id] ?? g.name), "그룹 이름을 변경했습니다.")}>이름 변경</button>
          <button className={`${button} text-red-ink`} disabled={pending} onClick={() => { if (window.confirm(`‘${g.name}’ 그룹을 삭제할까요? 관심종목은 그대로 유지됩니다.`)) execute(() => deleteWatchGroupAction(g.id), "그룹만 삭제했습니다. 관심종목은 유지됩니다."); }}>삭제</button>
        </div>)}
        <p className="text-xs text-muted">종목 카드의 관리에서 여러 그룹에 담을 수 있습니다. 그룹을 삭제해도 관심종목은 남습니다.</p>
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-subtle" />
          <input aria-label="관심종목 검색" className={`${input} w-full pl-9`} placeholder={selectedGroup ? `${selectedGroup.name}에 추가할 종목 검색` : "종목명 또는 코드로 검색"} value={query}
            onChange={e => { setQuery(e.target.value); setResults([]); setSearching(Boolean(e.target.value.trim())); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)} onKeyDown={e => { if (e.key === "Escape") setSearchOpen(false); if (e.key === "Enter" && !pending) { e.preventDefault(); if (results.length) add(results[0].symbol); else if (/^[A-Za-z0-9.]{1,12}$/.test(query.trim())) add(query); } }} />
          {searchOpen && query.trim() && <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg  ">
            {searching ? <p className="p-3 text-sm text-muted">검색 중…</p> : results.length === 0 ? <p className="p-3 text-sm text-muted">검색 결과가 없습니다. 코드를 직접 입력해 추가할 수 있습니다.</p> : results.map(r => <button type="button" key={`${r.country}:${r.symbol}`} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted disabled:opacity-50 " disabled={pending} onClick={() => add(r.symbol)}><span className="min-w-0 truncate font-medium">{r.name}</span><span className="shrink-0 text-xs text-subtle">{r.symbol} · {r.country}</span></button>)}
          </div>}
        </div>
        <button className={button} disabled={pending || !query.trim() || searching} onClick={() => add(results[0]?.symbol ?? query)}><Plus size={15} /> 추가</button>
        <button className={button} disabled={pending} onClick={() => start(() => router.refresh())} aria-label="관심종목 시세 새로고침"><RefreshCw size={15} /> 새로고침</button>
        <select aria-label="관심종목 시장" className={input} value={market} onChange={e => setMarket(e.target.value)}><option value="ALL">전체 시장</option><option value="KRW">국내</option><option value="USD">미국</option></select>
        {effectiveTab !== "recent" && <button className={button} onClick={() => setView(view === "cards" ? "table" : "cards")}>{view === "cards" ? "표 보기" : "카드 보기"}</button>}
        {effectiveTab === "recent" && <button className={button} disabled={pending || !data.recent.length} onClick={() => { if (window.confirm("최근 본 기록을 모두 비울까요? 관심종목은 유지됩니다.")) execute(clearRecentStocks, "최근 본 기록을 비웠습니다."); }}>기록 비우기</button>}
      </div>
      {message && <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{message}</p>}
      {view === "table" && effectiveTab !== "recent" ? <WatchlistManager initialWatches={rows} compact /> : <div className="min-h-80 rounded-2xl bg-surface py-2 ">
        {rows.length === 0 ? <div className="px-5 py-16 text-center"><Star className="mx-auto mb-3 text-subtle" size={28} /><p className="font-medium">{effectiveTab === "recent" ? "최근 본 종목이 없습니다" : "표시할 관심종목이 없습니다"}</p><p className="mt-2 text-sm text-muted">{effectiveTab === "recent" ? "국내 종목 상세 화면을 열면 이곳에 기록됩니다." : selectedGroup ? "검색으로 추가하거나, 전체 관심의 종목 관리에서 이 그룹을 선택하세요." : "종목명 또는 코드를 검색해 관심종목에 추가하세요."}</p></div> : <div className="grid items-start md:grid-cols-2">{rows.map(stock => <StockCard key={stock.symbol} stock={stock} watched={watched.has(stock.symbol)} groups={data.groups} pending={pending} onAdd={() => add(stock.symbol)} onRemove={() => { if (window.confirm(`‘${stock.name}’을 관심종목에서 삭제할까요?`)) execute(() => removeWatch(stock.symbol), "관심종목에서 삭제했습니다."); }} onGroup={(id, selected) => execute(() => setWatchGroupAction(id, stock.symbol, selected), "그룹 구성을 저장했습니다.")} />)}</div>}
      </div>}
      <p className="text-xs text-subtle">시세는 페이지를 열거나 새로고침할 때 조회합니다. NXT 지원은 현재 주문 가능 여부를 뜻하지 않습니다. 구매가 입력과 주문은 표 보기에서 사용할 수 있습니다.</p>
    </section>
  );
}
