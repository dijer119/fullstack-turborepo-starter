"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  addWatch,
  removeWatch,
  searchWatchCandidates,
  setWatchPurchasePrice,
  type StockWatchRow,
} from "@/actions/stock-watches";
import type { StockSearchResult } from "@/lib/stocks/naver-search";
import { isValidStockCode } from "@/lib/stocks/stock-code";
import { OrderButton } from "../toss-holdings/OrderModal";

type MarketFilter = "ALL" | "KR" | "US";

// 통화로 국가 구분 (KRW→KR, 그 외→US).
function countryOf(currency: string | null): "KR" | "US" {
  return currency === "KRW" ? "KR" : "US";
}

function fmtPrice(currency: string | null, v: number | null): string {
  if (v == null) return "—";
  if (currency === "USD") {
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₩${Math.round(v).toLocaleString("ko-KR")}`;
}

function signClass(v: number): string {
  if (v > 0) return "text-green-600 dark:text-green-400";
  if (v < 0) return "text-red-600 dark:text-red-400";
  return "text-gray-500";
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-3 py-1.5 text-sm ${
        active
          ? "border-blue-500 bg-blue-50 font-medium text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300"
          : "border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

function WatchRow({
  w,
  pending,
  onSavePrice,
  onRemove,
}: {
  w: StockWatchRow;
  pending: boolean;
  onSavePrice: (symbol: string, price: number | null) => void;
  onRemove: (symbol: string) => void;
}) {
  const country = countryOf(w.currency);
  const krCode = country === "KR" && isValidStockCode(w.symbol);
  const [input, setInput] = useState(
    w.purchasePrice != null ? String(w.purchasePrice) : "",
  );

  const save = () => {
    const trimmed = input.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    const next =
      parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    if (next === (w.purchasePrice ?? null)) return; // 변경 없으면 생략
    onSavePrice(w.symbol, next);
  };

  // 등락: 현재가 vs 구매가
  const cmp =
    w.purchasePrice != null && w.purchasePrice > 0 && w.lastPrice != null
      ? {
          diff: w.lastPrice - w.purchasePrice,
          pct: (w.lastPrice - w.purchasePrice) / w.purchasePrice,
        }
      : null;

  return (
    <tr className="border-b border-gray-100 text-right last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
      <td className="p-2 text-left">
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded px-1 py-0.5 text-[10px] font-medium ${
              country === "US"
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            }`}
          >
            {country}
          </span>
          {krCode ? (
            <Link
              href={`/stocks/${w.symbol}`}
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              {w.name}
            </Link>
          ) : (
            <span className="font-medium">{w.name}</span>
          )}
          <span className="text-xs text-gray-400">{w.symbol}</span>
          {w.market && <span className="text-xs text-gray-400">· {w.market}</span>}
        </div>
      </td>
      <td className="p-2 tabular-nums">{fmtPrice(w.currency, w.lastPrice)}</td>
      <td className="p-2 tabular-nums">
        {w.previousClose != null ? fmtPrice(w.currency, w.previousClose) : "—"}
      </td>
      <td className="p-2 tabular-nums">
        {w.changeBase != null && w.changeBase > 0 && w.lastPrice != null ? (
          (() => {
            // 등락은 기준가(KR=정규장 기준가, US=일봉 종가) 대비 — 토스 등락률과 일치
            const diff = w.lastPrice - w.changeBase;
            const pct = diff / w.changeBase;
            return (
              <span className={signClass(diff)}>
                {diff > 0 ? "▲" : diff < 0 ? "▼" : ""} {diff > 0 ? "+" : ""}
                {(pct * 100).toFixed(2)}%
              </span>
            );
          })()
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="p-2">
        <input
          type="number"
          step="any"
          min="0"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          onBlur={save}
          disabled={pending}
          placeholder="구매가"
          className="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right text-sm tabular-nums disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900"
        />
      </td>
      <td className="p-2 tabular-nums">
        {cmp ? (
          <div className={signClass(cmp.diff)}>
            <div>
              {cmp.diff > 0 ? "▲" : cmp.diff < 0 ? "▼" : ""}{" "}
              {cmp.pct > 0 ? "+" : ""}
              {(cmp.pct * 100).toFixed(2)}%
            </div>
            <div className="text-xs">
              {cmp.diff > 0 ? "+" : ""}
              {fmtPrice(w.currency, cmp.diff)}
            </div>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="p-2 text-center">
        <OrderButton
          symbol={w.symbol}
          name={w.name}
          currency={w.currency === "KRW" ? "KRW" : "USD"}
          lastPrice={w.lastPrice}
          defaultSide="BUY"
        />
      </td>
      <td className="p-2 text-right">
        <button
          type="button"
          onClick={() => onRemove(w.symbol)}
          disabled={pending}
          title="삭제"
          className="text-gray-400 hover:text-red-600 disabled:opacity-50"
        >
          <X size={14} />
        </button>
      </td>
    </tr>
  );
}

export function WatchlistManager({
  initialWatches,
}: {
  initialWatches: StockWatchRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<MarketFilter>("ALL");
  const [pending, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const counts = useMemo(
    () => ({
      ALL: initialWatches.length,
      KR: initialWatches.filter((w) => countryOf(w.currency) === "KR").length,
      US: initialWatches.filter((w) => countryOf(w.currency) === "US").length,
    }),
    [initialWatches],
  );

  const rows = useMemo(
    () =>
      filter === "ALL"
        ? initialWatches
        : initialWatches.filter((w) => countryOf(w.currency) === filter),
    [initialWatches, filter],
  );

  // 입력 변경 시 디바운스 검색 (useEffect 없이 — set-state-in-effect 회피).
  const onQueryChange = (val: string) => {
    setQuery(val);
    setMsg(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = val.trim();
    if (!q) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const r = await searchWatchCandidates(q);
      setResults(r);
    }, 250);
  };

  const add = (sym?: string) =>
    startTransition(async () => {
      const target = (sym ?? query).trim();
      if (!target) return;
      const r = await addWatch(target);
      setMsg(r.ok ? "추가되었습니다." : (r.reason ?? "추가 실패"));
      if (r.ok) {
        setQuery("");
        setResults([]);
      }
      router.refresh();
    });

  const remove = (sym: string) =>
    startTransition(async () => {
      await removeWatch(sym);
      router.refresh();
    });

  const savePrice = (sym: string, price: number | null) =>
    startTransition(async () => {
      await setWatchPurchasePrice(sym, price);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => {
              if (blurTimer.current) clearTimeout(blurTimer.current);
            }}
            onBlur={() => {
              // 드롭다운 항목 클릭이 먼저 처리되도록 약간 지연 후 닫음.
              blurTimer.current = setTimeout(() => setResults([]), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !pending) {
                if (results.length > 0) add(results[0].symbol);
                else if (query.trim()) add();
              } else if (e.key === "Escape") {
                setResults([]);
              }
            }}
            placeholder="종목명 또는 심볼 (예: 삼성전자, 로빈후드, HOOD)"
            className="w-72 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-72 w-72 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
              {results.map((r) => (
                <li key={`${r.country}-${r.symbol}`}>
                  <button
                    type="button"
                    onClick={() => add(r.symbol)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <span
                      className={`rounded px-1 py-0.5 text-[10px] font-medium ${
                        r.country === "US"
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      }`}
                    >
                      {r.country}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">{r.name}</span>
                    <span className="text-xs text-gray-400">
                      {r.symbol} · {r.market}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => add()}
          disabled={pending || query.trim() === ""}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "처리 중…" : "추가"}
        </button>
        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          disabled={pending}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          ↻ 새로고침
        </button>
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>

      <div className="flex gap-2">
        <FilterButton active={filter === "ALL"} onClick={() => setFilter("ALL")}>
          전체 ({counts.ALL})
        </FilterButton>
        <FilterButton active={filter === "KR"} onClick={() => setFilter("KR")}>
          국내 ({counts.KR})
        </FilterButton>
        <FilterButton active={filter === "US"} onClick={() => setFilter("US")}>
          미국 ({counts.US})
        </FilterButton>
      </div>

      {initialWatches.length === 0 ? (
        <p className="text-sm text-gray-500">
          관심목록이 비어 있습니다. 심볼을 입력해 추가하세요.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">표시할 종목이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right">
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 text-left font-medium dark:border-gray-700 dark:bg-gray-900">
                  종목
                </th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">
                  현재가
                </th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">
                  전일종가
                </th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">
                  전일대비
                </th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">
                  구매가
                </th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">
                  등락
                </th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">
                  주문
                </th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900" />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <WatchRow
                  key={w.symbol}
                  w={w}
                  pending={pending}
                  onSavePrice={savePrice}
                  onRemove={remove}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
