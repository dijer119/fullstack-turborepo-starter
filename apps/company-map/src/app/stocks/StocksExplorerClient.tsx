"use client";

import React, { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Filter, ChevronDown, ChevronUp, ExternalLink, FileText } from "lucide-react";
import type {
  MarketFilter,
  StocksExplorerRow,
  StocksSort,
} from "@/actions/stocks-explorer";
import {
  getVipHoldingsByCode,
  type VipHoldingDetailRow,
} from "@/actions/vip-holdings";
import { formatMarcap } from "@/lib/format-marcap";
import { formatStockRatio, ratioColorClass } from "@/lib/format-ratio";
import { computeGrowth, formatGrowth, growthColorClass } from "@/lib/format-growth";
import {
  addTagToStock,
  removeTagFromStock,
  type TagView,
} from "@/actions/tags";
import { getMemoByCode, setMemo } from "@/actions/memos";

export interface StocksExplorerView {
  market: MarketFilter;
  search: string;
  minMarcapEok: number | null;
  maxMarcapEok: number | null;
  perMax: number | null;
  pbrMax: number | null;
  analyzedOnly: boolean;
  vipOnly: boolean;
  tagIds: number[];
  sort: StocksSort;
  page: number;
  pageSize: number;
}

interface Props {
  rows: StocksExplorerRow[];
  total: number;
  view: StocksExplorerView;
  allTags: TagView[];
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
  if (view.vipOnly) qs.set("vip", "1");
  if (view.tagIds && view.tagIds.length > 0) qs.set("tags", view.tagIds.join(","));
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

function titleForGrowth(
  latestReprtCode: string | null,
  kind: "yoy" | "qoq",
): string {
  const base = kind === "yoy" ? "전년 동기 누계" : "직전 보고 누계";
  const reportLabel = latestReprtCode
    ? ({ "11011": "사업", "11013": "1분기", "11012": "반기", "11014": "3분기" } as Record<string, string>)[latestReprtCode] ?? latestReprtCode
    : "?";
  return `${base} 기준 (최신: ${reportLabel})`;
}

export function StocksExplorerClient({ rows, total, view, allTags }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filterOpen, setFilterOpen] = useState(
    view.minMarcapEok != null ||
      view.maxMarcapEok != null ||
      view.perMax != null ||
      view.pbrMax != null ||
      view.analyzedOnly ||
      view.vipOnly ||
      view.tagIds.length > 0,
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
  const [vipOnly, setVipOnly] = useState(view.vipOnly);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(view.tagIds);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [vipDetails, setVipDetails] = useState<Record<string, VipHoldingDetailRow[]>>({});
  const [vipLoading, setVipLoading] = useState<Set<string>>(new Set());

  const navigate = (next: Partial<StocksExplorerView>) => {
    const merged: Partial<StocksExplorerView> = { ...view, ...next };
    const qs = buildQuery(merged);
    startTransition(() => router.replace(qs ? `/stocks?${qs}` : "/stocks"));
  };

  const toggleExpand = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    // Fetch is guarded by data state, not expand state — so double-clicks
    // and toggles can't trigger duplicate or stuck loads.
    if (vipDetails[code] || vipLoading.has(code)) return;
    setVipLoading((prev) => new Set(prev).add(code));
    startTransition(async () => {
      try {
        const data = await getVipHoldingsByCode(code);
        setVipDetails((prev) => ({ ...prev, [code]: data }));
      } catch (err) {
        console.error("[vip] failed to load disclosures for", code, err);
      } finally {
        setVipLoading((prev) => {
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
      }
    });
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
      vipOnly,
      tagIds: selectedTagIds,
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
    setVipOnly(false);
    setSelectedTagIds([]);
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={vipOnly}
              onChange={(e) => setVipOnly(e.target.checked)}
            />
            <span>VIP 보유 종목만</span>
          </label>
          {allTags.length > 0 && (
            <div className="md:col-span-2 lg:col-span-3">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                태그 (모두 포함):
              </div>
              <div className="flex flex-wrap gap-1">
                {allTags.map((t) => {
                  const active = selectedTagIds.includes(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => {
                        setSelectedTagIds(
                          active
                            ? selectedTagIds.filter((id) => id !== t.id)
                            : [...selectedTagIds, t.id],
                        );
                      }}
                      className={`rounded px-2 py-0.5 text-xs ${
                        active
                          ? "bg-blue-600 text-white"
                          : "border border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                      }`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
            <tr className="text-left">
              <th className="p-2 font-medium">종목명</th>
              <th className="p-2 font-medium">코드</th>
              <th className="p-2 font-medium text-right">시가총액</th>
              <th className="p-2 font-medium text-right">현재가</th>
              <th className="p-2 font-medium text-right">PER</th>
              <th className="p-2 font-medium text-right">PBR</th>
              <th className="p-2 font-medium text-right">배당%</th>
              <th className="p-2 font-medium text-right">안전마진</th>
              <th className="p-2 font-medium text-right">3M</th>
              <th className="p-2 font-medium text-right">VIP</th>
              <th className="p-2 font-medium text-right">YoY</th>
              <th className="p-2 font-medium">Tag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <React.Fragment key={r.code}>
                <tr
                  className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/50"
                >
                  <td className="p-2 font-medium">
                    <div className="flex items-center gap-1.5">
                      <MemoButton stockCode={r.code} initialHasMemo={r.hasMemo} />
                      <a
                        href={`https://finance.naver.com/item/main.naver?code=${r.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {r.name}
                      </a>
                    </div>
                  </td>
                  <td className="p-2 font-mono text-gray-500">{r.code}</td>
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
                  <td
                    className={`p-2 text-right ${
                      r.pctChange3M == null
                        ? "text-gray-400"
                        : r.pctChange3M >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {r.pctChange3M == null
                      ? "—"
                      : `${r.pctChange3M >= 0 ? "+" : ""}${r.pctChange3M.toFixed(1)}%`}
                  </td>
                  <td className="p-2 text-right">
                    {r.vipHoldingsCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(r.code)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {r.vipHoldingsCount}건
                        {expanded.has(r.code) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  {(() => {
                    const yoy = computeGrowth(r.opIncome, r.opIncomeYoyBase);
                    return (
                      <td
                        className={`p-2 text-right font-mono ${growthColorClass(yoy)}`}
                        title={titleForGrowth(r.latestReprtCode, "yoy")}
                      >
                        {formatGrowth(yoy)}
                      </td>
                    );
                  })()}
                  <td className="p-2">
                    <TagCell stockCode={r.code} tags={r.tags} allTags={allTags} />
                  </td>
                </tr>
                {expanded.has(r.code) && (
                  <tr key={r.code + "-expand"} className="bg-blue-50/40 dark:bg-blue-950/20">
                    <td colSpan={12} className="p-3">
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        브이아이피자산운용 보유 공시 (최근 6개월)
                      </div>
                      {vipLoading.has(r.code) ? (
                        <div className="text-sm text-gray-500">불러오는 중…</div>
                      ) : (vipDetails[r.code] ?? []).length === 0 ? (
                        <div className="text-sm text-gray-500">공시 없음</div>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {(vipDetails[r.code] ?? []).map((d) => (
                            <li key={d.rcpNo} className="flex items-center gap-3">
                              <span className="font-mono text-gray-500 w-24">
                                {d.rceptDt.slice(0, 10)}
                              </span>
                              <span className="flex-1 min-w-0 truncate">{d.reportNm}</span>
                              <span className={`w-36 text-right font-mono ${ratioColorClass(d.stockRatioChange)}`}>
                                {formatStockRatio(d.stockRatio, d.stockRatioChange, d.reportResn)}
                              </span>
                              <a
                                href={d.dartUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                              >
                                공시 보기 <ExternalLink size={12} />
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="p-6 text-center text-gray-500">
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

function TagCell({
  stockCode,
  tags: initialTags,
  allTags,
}: {
  stockCode: string;
  tags: TagView[];
  allTags: TagView[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");

  const onAdd = async () => {
    const name = input.trim();
    if (!name) {
      setEditing(false);
      return;
    }
    const created = await addTagToStock(stockCode, name);
    if (created && !tags.find((t) => t.id === created.id)) {
      setTags([...tags, created]);
    }
    setInput("");
    setEditing(false);
  };

  const onRemove = async (id: number) => {
    setTags(tags.filter((t) => t.id !== id));
    await removeTagFromStock(stockCode, id);
  };

  const suggestions = input
    ? allTags
        .filter((t) => t.name.startsWith(input) && !tags.find((tt) => tt.id === t.id))
        .slice(0, 5)
    : [];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800"
        >
          {t.name}
          <button
            type="button"
            onClick={() => onRemove(t.id)}
            className="text-gray-400 hover:text-red-600"
            aria-label={`${t.name} 제거`}
          >
            ×
          </button>
        </span>
      ))}
      {editing ? (
        <div className="relative">
          <input
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
              else if (e.key === "Escape") {
                setInput("");
                setEditing(false);
              }
            }}
            onBlur={onAdd}
            className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-900"
            placeholder="태그명"
          />
          {suggestions.length > 0 && (
            <ul className="absolute left-0 top-full z-10 mt-1 w-32 rounded border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-900">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="cursor-pointer px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInput(s.name);
                  }}
                >
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-gray-400 hover:text-blue-600"
        >
          + 태그
        </button>
      )}
    </div>
  );
}

function MemoButton({
  stockCode,
  initialHasMemo,
}: {
  stockCode: string;
  initialHasMemo: boolean;
}) {
  const [hasMemo, setHasMemo] = useState(initialHasMemo);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  // popover 위치(viewport 기준). 부모 overflow-x-auto에 갇히지 않게 fixed 사용.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const POPOVER_W = 288; // w-72 = 18rem = 288px

  const openPopover = async () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // 오른쪽 화면 밖으로 벗어나면 좌측 정렬을 button.right - width로 보정.
      const left = Math.min(rect.left, window.innerWidth - POPOVER_W - 8);
      setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    }
    setOpen(true);
    setLoading(true);
    try {
      const t = await getMemoByCode(stockCode);
      setText(t ?? "");
    } finally {
      setLoading(false);
    }
  };

  const closePopover = () => {
    setOpen(false);
    setText("");
    setPos(null);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const r = await setMemo(stockCode, text);
      setHasMemo(r.hasMemo);
      setOpen(false);
      setText("");
      setPos(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openPopover}
        aria-label={hasMemo ? "메모 편집" : "메모 추가"}
        className={`inline-flex items-center justify-center rounded p-0.5 transition ${
          hasMemo
            ? "text-blue-600 hover:text-blue-700 dark:text-blue-400"
            : "text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
        }`}
      >
        <FileText size={14} fill={hasMemo ? "currentColor" : "none"} />
      </button>
      {open && pos && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={closePopover}
            aria-hidden
          />
          <div
            className="fixed z-40 w-72 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {loading ? (
              <div className="text-xs text-gray-500">불러오는 중…</div>
            ) : (
              <>
                <textarea
                  autoFocus
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void onSave();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      closePopover();
                    }
                  }}
                  placeholder="메모 입력…"
                  className="w-full resize-y rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                />
                <div className="mt-1 flex items-center justify-end gap-1 text-xs">
                  <button
                    type="button"
                    onClick={closePopover}
                    className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    disabled={saving}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    className="rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={saving}
                  >
                    저장 ⌘↵
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
