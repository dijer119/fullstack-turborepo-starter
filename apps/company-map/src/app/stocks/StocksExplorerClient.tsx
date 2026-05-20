"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Filter, ChevronDown, ChevronUp } from "lucide-react";
import type {
  MarketFilter,
  StocksExplorerRow,
  StocksSort,
} from "@/actions/stocks-explorer";
import { formatMarcap } from "@/lib/format-marcap";

export interface StocksExplorerView {
  market: MarketFilter;
  search: string;
  minMarcapEok: number | null;
  maxMarcapEok: number | null;
  perMax: number | null;
  pbrMax: number | null;
  analyzedOnly: boolean;
  sort: StocksSort;
  page: number;
  pageSize: number;
}

interface Props {
  rows: StocksExplorerRow[];
  total: number;
  view: StocksExplorerView;
}

function buildQuery(view: Partial<StocksExplorerView>): string {
  const qs = new URLSearchParams();
  if (view.market && view.market !== "ALL") qs.set("market", view.market);
  if (view.search) qs.set("search", view.search);
  if (view.minMarcapEok != null) qs.set("minMarcap", String(view.minMarcapEok));
  if (view.maxMarcapEok != null) qs.set("maxMarcap", String(view.maxMarcapEok));
  if (view.perMax != null) qs.set("perMax", String(view.perMax));
  if (view.pbrMax != null) qs.set("pbrMax", String(view.pbrMax));
  if (view.analyzedOnly) qs.set("analyzed", "1");
  if (view.sort && view.sort !== "marcap_desc") qs.set("sort", view.sort);
  if (view.page && view.page > 1) qs.set("page", String(view.page));
  return qs.toString();
}

function pct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function num(v: number | null, digits = 1): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

function price(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString();
}

const MARKET_OPTIONS: Array<{ value: MarketFilter; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "KOSPI", label: "KOSPI" },
  { value: "KOSDAQ", label: "KOSDAQ" },
];

const SORT_OPTIONS: Array<{ value: StocksSort; label: string }> = [
  { value: "marcap_desc", label: "시가총액 ↓" },
  { value: "name_asc", label: "종목명 ↑" },
  { value: "safetyMargin_desc", label: "안전마진 ↓ (분석된 종목)" },
];

export function StocksExplorerClient({ rows, total, view }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filterOpen, setFilterOpen] = useState(
    view.minMarcapEok != null ||
      view.maxMarcapEok != null ||
      view.perMax != null ||
      view.pbrMax != null ||
      view.analyzedOnly,
  );

  // 폼 로컬 상태 (제출 전까지는 URL 미반영)
  const [search, setSearch] = useState(view.search);
  const [minMarcap, setMinMarcap] = useState(
    view.minMarcapEok != null ? String(view.minMarcapEok) : "",
  );
  const [maxMarcap, setMaxMarcap] = useState(
    view.maxMarcapEok != null ? String(view.maxMarcapEok) : "",
  );
  const [perMax, setPerMax] = useState(
    view.perMax != null ? String(view.perMax) : "",
  );
  const [pbrMax, setPbrMax] = useState(
    view.pbrMax != null ? String(view.pbrMax) : "",
  );
  const [analyzedOnly, setAnalyzedOnly] = useState(view.analyzedOnly);

  const navigate = (next: Partial<StocksExplorerView>) => {
    const merged: Partial<StocksExplorerView> = { ...view, ...next };
    const qs = buildQuery(merged);
    startTransition(() => router.replace(qs ? `/stocks?${qs}` : "/stocks"));
  };

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({
      search: search.trim(),
      minMarcapEok: minMarcap ? Number(minMarcap) : null,
      maxMarcapEok: maxMarcap ? Number(maxMarcap) : null,
      perMax: perMax ? Number(perMax) : null,
      pbrMax: pbrMax ? Number(pbrMax) : null,
      analyzedOnly,
      page: 1,
    });
  };

  const resetFilters = () => {
    setSearch("");
    setMinMarcap("");
    setMaxMarcap("");
    setPerMax("");
    setPbrMax("");
    setAnalyzedOnly(false);
    startTransition(() => router.replace("/stocks"));
  };

  const totalPages = Math.max(1, Math.ceil(total / view.pageSize));
  const startIdx = (view.page - 1) * view.pageSize + 1;
  const endIdx = Math.min(view.page * view.pageSize, total);

  return (
    <div className="space-y-4">
      {/* 시장 토글 + 검색 + 필터 토글 */}
      <form
        onSubmit={applyFilters}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700">
          {MARKET_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => navigate({ market: opt.value, page: 1 })}
              className={`px-3 py-1.5 text-sm transition first:rounded-l-md last:rounded-r-md ${
                view.market === opt.value
                  ? "bg-blue-600 text-white"
                  : "bg-white hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="종목명/코드 검색"
          className="flex-1 min-w-[180px] rounded border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          disabled={pending}
        >
          검색
        </button>
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <Filter size={14} />
          필터
          {filterOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <select
          value={view.sort}
          onChange={(e) => navigate({ sort: e.target.value as StocksSort, page: 1 })}
          className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </form>

      {/* 필터 패널 */}
      {filterOpen && (
        <form
          onSubmit={applyFilters}
          className="grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40 md:grid-cols-2 lg:grid-cols-3"
        >
          <label className="flex items-center gap-2">
            <span className="w-20 text-gray-600 dark:text-gray-400">시총 최소</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={minMarcap}
              onChange={(e) => setMinMarcap(e.target.value)}
              placeholder="억원"
              className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
            />
            <span className="text-xs text-gray-500">억</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-gray-600 dark:text-gray-400">시총 최대</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={maxMarcap}
              onChange={(e) => setMaxMarcap(e.target.value)}
              placeholder="억원"
              className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
            />
            <span className="text-xs text-gray-500">억</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-gray-600 dark:text-gray-400">PER ≤</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={perMax}
              onChange={(e) => setPerMax(e.target.value)}
              placeholder="상한"
              className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 text-gray-600 dark:text-gray-400">PBR ≤</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={pbrMax}
              onChange={(e) => setPbrMax(e.target.value)}
              placeholder="상한"
              className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={analyzedOnly}
              onChange={(e) => setAnalyzedOnly(e.target.checked)}
            />
            <span>분석된 종목만</span>
          </label>
          <div className="flex items-center justify-end gap-2 md:col-span-2 lg:col-span-3">
            <button
              type="button"
              onClick={resetFilters}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
              disabled={pending}
            >
              초기화
            </button>
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={pending}
            >
              필터 적용
            </button>
          </div>
        </form>
      )}

      {/* 결과 카운트 */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {total > 0
            ? `${startIdx.toLocaleString()}–${endIdx.toLocaleString()} / ${total.toLocaleString()}`
            : "0개"}
          {pending ? " · 로딩 중…" : ""}
        </span>
      </div>

      {/* 표 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr className="text-left">
              <th className="p-2 font-medium">종목명</th>
              <th className="p-2 font-medium">코드</th>
              <th className="p-2 font-medium">시장</th>
              <th className="p-2 font-medium text-right">시가총액</th>
              <th className="p-2 font-medium text-right">현재가</th>
              <th className="p-2 font-medium text-right">PER</th>
              <th className="p-2 font-medium text-right">PBR</th>
              <th className="p-2 font-medium text-right">배당%</th>
              <th className="p-2 font-medium text-right">안전마진</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.code}
                className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/50"
              >
                <td className="p-2 font-medium">
                  <Link
                    href={`/calculator?code=${r.code}`}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="p-2 font-mono text-gray-500">{r.code}</td>
                <td className="p-2 text-gray-500">{r.market ?? "—"}</td>
                <td className="p-2 text-right">{formatMarcap(r.marcap)}</td>
                <td className="p-2 text-right">{price(r.currentPrice)}</td>
                <td className="p-2 text-right">{num(r.per)}</td>
                <td className="p-2 text-right">{num(r.pbr, 2)}</td>
                <td className="p-2 text-right">{num(r.dividendYield, 2)}</td>
                <td
                  className={`p-2 text-right ${
                    r.safetyMargin == null
                      ? ""
                      : r.safetyMargin >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {pct(r.safetyMargin)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-500">
                  조건에 맞는 종목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Link
            href={
              "/stocks" +
              (buildQuery({ ...view, page: Math.max(1, view.page - 1) })
                ? "?" + buildQuery({ ...view, page: Math.max(1, view.page - 1) })
                : "")
            }
            aria-disabled={view.page === 1}
            className={`rounded border border-gray-300 px-2 py-1 dark:border-gray-700 ${
              view.page === 1
                ? "pointer-events-none opacity-40"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            이전
          </Link>
          <span className="px-2 py-1 text-gray-600 dark:text-gray-400">
            {view.page} / {totalPages}
          </span>
          <Link
            href={
              "/stocks" +
              (buildQuery({ ...view, page: Math.min(totalPages, view.page + 1) })
                ? "?" + buildQuery({ ...view, page: Math.min(totalPages, view.page + 1) })
                : "")
            }
            aria-disabled={view.page === totalPages}
            className={`rounded border border-gray-300 px-2 py-1 dark:border-gray-700 ${
              view.page === totalPages
                ? "pointer-events-none opacity-40"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            다음
          </Link>
        </div>
      )}
    </div>
  );
}
