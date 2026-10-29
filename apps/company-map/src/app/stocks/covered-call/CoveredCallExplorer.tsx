"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncCoveredCallEtfs } from "@/actions/covered-call-etfs";
import type { CoveredCallEtf } from "@/lib/etf/covered-call-snapshot";

const CATEGORIES = ["국내주식형", "해외대체", "해외주식형", "해외채권형", "해외혼합형"];
const NUMBER_FORMAT = new Intl.NumberFormat("ko-KR");
const SOURCE_DATE = "2026.09.25";
const PRICE_DATE = "2026.09.22";
const PRICE_DATE_SHORT = PRICE_DATE.slice(5);

function won(value: number): string {
  return `${NUMBER_FORMAT.format(value)}원`;
}

function percent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function CoveredCallExplorer({
  etfs,
  updatedAt,
}: {
  etfs: CoveredCallEtf[];
  updatedAt: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"yield_ttm" | "yield_latest" | "name">("yield_ttm");
  const [fullOnly, setFullOnly] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const completeCount = useMemo(() => etfs.filter((etf) => etf.full).length, [etfs]);

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR");
    return etfs
      .filter((etf) =>
        (!query || `${etf.name} ${etf.code}`.toLocaleLowerCase("ko-KR").includes(query)) &&
        (!category || etf.category === category) &&
        (!fullOnly || etf.full),
      )
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "ko");
        return b[sort] - a[sort];
      });
  }, [category, etfs, fullOnly, search, sort]);

  const onSync = () => {
    setSyncMessage("");
    startTransition(async () => {
      const result = await syncCoveredCallEtfs();
      setSyncMessage(result.message);
      if (result.ok) router.refresh();
    });
  };

  const dataDate = updatedAt
    ? new Date(updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : null;
  const priceDate = useMemo(() => {
    const dates = [...new Set(etfs.map((etf) => etf.price_date).filter((date): date is string => Boolean(date)))];
    if (dates.length === 1) return dates[0].replace(/-/g, ".");
    if (dates.length > 1) return "종목별 기준일";
    return PRICE_DATE;
  }, [etfs]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header className="border-b border-gray-200 pb-5 dark:border-gray-800">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">ETF 분배금 비교</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">국내 상장 커버드콜 ETF</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              실제 지급된 분배금과 최근 회차 기준 연환산 분배율을 비교합니다. 국내외 주식·채권·혼합형 등 국내 상장 상품을 포함합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-baseline gap-5 border-l-2 border-blue-600 pl-4">
              <div>
                <strong className="text-3xl tabular-nums">{etfs.length}</strong>
                <span className="ml-1 text-sm text-gray-500">종</span>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{completeCount}</span>종 12개월 실적
                <span className="mx-2 text-gray-300 dark:text-gray-700">/</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{etfs.length - completeCount}</span>종 이력 부족
              </div>
            </div>
            <button
              type="button"
              onClick={onSync}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <RefreshCw size={15} className={pending ? "animate-spin" : ""} />
              {pending ? "동기화 중…" : "데이터 동기화"}
            </button>
          </div>
        </div>
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-500">
          {dataDate
            ? `최근 동기화 ${dataDate} · 종가 기준 ${priceDate} · 세전 금액`
            : `조사일 ${SOURCE_DATE} · 공통 가격 기준 ${PRICE_DATE} 종가 · 세전 금액`}
        </p>
        {syncMessage && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400" role="status" aria-live="polite">{syncMessage}</p>}
      </header>

      <section className="rounded-md border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-gray-700 dark:border-blue-950 dark:bg-blue-950/30 dark:text-gray-300" aria-label="분배율 비교 기준">
        <p><strong className="text-gray-900 dark:text-gray-100">실제 지급액 분배율</strong>은 최근 12개월 주당 분배금 합계를 {priceDate} 종가로 나눈 값입니다.</p>
        <p><strong className="text-gray-900 dark:text-gray-100">최근 회차 연환산</strong>은 최근 주당 분배금에 연간 지급 횟수를 적용한 참고치로, 다음 분배금을 보장하지 않습니다.</p>
        <p>분배율은 투자 수익률과 다릅니다. 분배금을 받아도 ETF 가격 하락으로 손실이 날 수 있습니다.</p>
      </section>

      <section aria-labelledby="covered-call-list-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="covered-call-list-heading" className="text-lg font-semibold">전체 목록</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">실제 지급액 분배율이 높은 순으로 표시합니다.</p>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400" aria-live="polite">{rows.length}종 표시</p>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.5fr)_minmax(9rem,0.8fr)_minmax(14rem,1.2fr)_auto] lg:items-end">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            ETF 검색
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름 또는 종목코드"
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            투자 유형
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
              <option value="">전체</option>
              {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            정렬 기준
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
              <option value="yield_ttm">실제 지급액 분배율 높은 순</option>
              <option value="yield_latest">최근 회차 연환산 높은 순</option>
              <option value="name">ETF 이름순</option>
            </select>
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={fullOnly} onChange={(event) => setFullOnly(event.target.checked)} className="size-4 accent-blue-600" />
            12개월 실적만
          </label>
        </div>

        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800" tabIndex={0} aria-label="커버드콜 ETF 순위표, 가로 스크롤 가능">
          <table className="w-full min-w-[1050px] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              <tr>
                <th scope="col" className="border-b border-gray-200 px-3 py-3 text-right dark:border-gray-800">순위</th>
                <th scope="col" className="border-b border-gray-200 px-3 py-3 dark:border-gray-800">ETF / 종목코드</th>
                <th scope="col" className="border-b border-gray-200 px-3 py-3 text-right dark:border-gray-800">실제 지급액<br />분배율</th>
                <th scope="col" className="border-b border-gray-200 px-3 py-3 text-right dark:border-gray-800">최근 회차<br />연환산</th>
                <th scope="col" className="border-b border-gray-200 px-3 py-3 text-right dark:border-gray-800">최근 분배금<br />실제 지급일</th>
                <th scope="col" className="border-b border-gray-200 px-3 py-3 text-right dark:border-gray-800">12개월<br />분배금 합계</th>
                <th scope="col" className="border-b border-gray-200 px-3 py-3 text-right dark:border-gray-800">{priceDate === PRICE_DATE ? `${PRICE_DATE_SHORT} 종가` : `${priceDate} 종가`}</th>
                <th scope="col" className="border-b border-gray-200 px-3 py-3 dark:border-gray-800">주기 / 이력</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((etf, index) => (
                <tr key={etf.code} className="align-top hover:bg-blue-50/50 dark:hover:bg-blue-950/20">
                  <td className="border-b border-gray-100 px-3 py-3 text-right tabular-nums text-gray-500 dark:border-gray-900">{index + 1}</td>
                  <td className="max-w-[330px] border-b border-gray-100 px-3 py-3 dark:border-gray-900">
                    <a href={etf.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline dark:text-blue-300">{etf.name}</a>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{etf.code} · {etf.category}{!etf.full && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">이력 짧음</span>}</div>
                    <details className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <summary className="w-fit cursor-pointer hover:text-gray-800 dark:hover:text-gray-200">기준일·기초지수</summary>
                      <p className="mt-1 leading-5">{etf.manager}<br />{etf.index}<br />지급기준일 {etf.base_date} · 실제 지급일 {etf.pay_date}</p>
                    </details>
                  </td>
                  <td className="border-b border-gray-100 px-3 py-3 text-right font-semibold tabular-nums text-blue-700 dark:border-gray-900 dark:text-blue-300">{percent(etf.yield_ttm)}</td>
                  <td className="border-b border-gray-100 px-3 py-3 text-right tabular-nums dark:border-gray-900">{percent(etf.yield_latest)}</td>
                  <td className="border-b border-gray-100 px-3 py-3 text-right tabular-nums dark:border-gray-900">{won(etf.recent)}<div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{etf.pay_date}</div></td>
                  <td className="border-b border-gray-100 px-3 py-3 text-right tabular-nums dark:border-gray-900">{won(etf.amount)}</td>
                  <td className="border-b border-gray-100 px-3 py-3 text-right tabular-nums dark:border-gray-900">{won(etf.price)}</td>
                  <td className="border-b border-gray-100 px-3 py-3 dark:border-gray-900">{etf.frequency}분배<div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{etf.count}회 지급 · {etf.full ? "12개월 실적" : "1년 미만·부족"}</div></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">조건에 맞는 ETF가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">순위는 현재 필터와 정렬 기준 안에서 다시 매깁니다. 이력이 짧은 상품은 실제 지급액만 집계해 분배율이 낮게 보일 수 있습니다.</p>
      </section>

      <footer className="border-t border-gray-200 pt-4 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <p>자료 출처: <a href="https://etf-lab.kr/sector" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline dark:text-blue-300">ETF 연구소 전체 목록</a>, <a href="https://etf-lab.kr/distribution" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline dark:text-blue-300">분배금 자료</a>. 분배금 원자료는 한국예탁결제원(SEIBRO) 공개 내역을 사용한 원문 집계입니다.</p>
        <p className="mt-1">{dataDate ? `가격은 네이버 최신 거래일 종가, 분배금은 ETF 연구소 최근 공개 자료 기준입니다. 마지막 동기화: ${dataDate}.` : `가격·분배금은 ${SOURCE_DATE} 기준 정적 자료입니다. 위의 데이터 동기화 버튼으로 최신 자료를 가져올 수 있습니다.`} 투자 판단 전 최신 공시와 상품 정보를 확인하세요.</p>
      </footer>
    </main>
  );
}
