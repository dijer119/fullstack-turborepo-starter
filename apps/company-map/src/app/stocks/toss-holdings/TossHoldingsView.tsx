"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  TossHoldingRow,
  TossHoldingsResult,
} from "@/actions/toss-holdings";
import { isValidStockCode } from "@/lib/stocks/stock-code";
import { OrderButton } from "./OrderModal";

type MarketFilter = "ALL" | "KR" | "US";

function fmtMoney(currency: "KRW" | "USD", v: number): string {
  if (currency === "USD") {
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₩${Math.round(v).toLocaleString("ko-KR")}`;
}

function fmtQty(v: number): string {
  return Number.isInteger(v)
    ? v.toLocaleString()
    : v.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function signClass(v: number): string {
  if (v > 0) return "text-green-600 dark:text-green-400";
  if (v < 0) return "text-red-600 dark:text-red-400";
  return "text-gray-500";
}

// 행의 통화를 KRW로 환산. KRW면 그대로, USD면 환율 곱.
function toKrw(v: number, currency: "KRW" | "USD", usdKrwRate: number): number {
  return currency === "USD" ? v * usdKrwRate : v;
}

interface KrwSummary {
  totalPurchase: number;
  marketValue: number;
  profitLoss: number;
  profitLossRate: number;
  dailyProfitLoss: number;
  dailyProfitLossRate: number;
}

// 필터된 행들로부터 원화 환산 합계를 재계산.
function computeKrwSummary(rows: TossHoldingRow[], usdKrwRate: number): KrwSummary {
  let totalPurchase = 0;
  let marketValue = 0;
  let profitLoss = 0;
  let dailyProfitLoss = 0;
  for (const r of rows) {
    totalPurchase += toKrw(r.purchaseAmount, r.currency, usdKrwRate);
    marketValue += toKrw(r.marketValue, r.currency, usdKrwRate);
    profitLoss += toKrw(r.profitLoss, r.currency, usdKrwRate);
    dailyProfitLoss += toKrw(r.dailyProfitLoss, r.currency, usdKrwRate);
  }
  const prevValue = marketValue - dailyProfitLoss; // 전일 평가금액
  return {
    totalPurchase,
    marketValue,
    profitLoss,
    profitLossRate: totalPurchase !== 0 ? profitLoss / totalPurchase : 0,
    dailyProfitLoss,
    dailyProfitLossRate: prevValue !== 0 ? dailyProfitLoss / prevValue : 0,
  };
}

function SummaryCard({
  label,
  amount,
  rate,
}: {
  label: string;
  amount: number;
  rate?: number;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${rate != null ? signClass(amount) : ""}`}>
        {fmtMoney("KRW", amount)}
      </div>
      {rate != null && (
        <div className={`mt-0.5 text-xs font-medium ${signClass(rate)}`}>
          {rate > 0 ? "+" : ""}
          {fmtPct(rate)}
        </div>
      )}
    </div>
  );
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

function HoldingsTable({ rows }: { rows: TossHoldingRow[] }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.marketValue - a.marketValue),
    [rows],
  );
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-right">
            <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 text-left font-medium dark:border-gray-700 dark:bg-gray-900">
              종목
            </th>
            {["수량", "평균단가", "현재가", "전일종가", "전일대비", "평가금액", "평가손익", "당일손익"].map((h) => (
              <th
                key={h}
                className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900"
              >
                {h}
              </th>
            ))}
            <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">
              주문
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const krCode = r.marketCountry === "KR" && isValidStockCode(r.symbol);
            return (
              <tr
                key={`${r.marketCountry}-${r.symbol}`}
                className="border-b border-gray-100 text-right last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
              >
                <td className="p-2 text-left">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1 py-0.5 text-[10px] font-medium ${
                        r.marketCountry === "US"
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      }`}
                    >
                      {r.marketCountry}
                    </span>
                    {krCode ? (
                      <Link
                        href={`/stocks/${r.symbol}`}
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.name}</span>
                    )}
                    <span className="text-xs text-gray-400">{r.symbol}</span>
                  </div>
                </td>
                <td className="p-2 tabular-nums">{fmtQty(r.quantity)}</td>
                <td className="p-2 tabular-nums">{fmtMoney(r.currency, r.averagePurchasePrice)}</td>
                <td className="p-2 tabular-nums">{fmtMoney(r.currency, r.lastPrice)}</td>
                <td className="p-2 tabular-nums">
                  {r.previousClose != null ? fmtMoney(r.currency, r.previousClose) : "—"}
                </td>
                <td className="p-2 tabular-nums">
                  {r.previousClose != null && r.previousClose > 0 ? (
                    (() => {
                      const diff = r.lastPrice - r.previousClose;
                      const pct = diff / r.previousClose;
                      return (
                        <span className={signClass(diff)}>
                          <span>{diff > 0 ? "▲" : diff < 0 ? "▼" : ""} {diff > 0 ? "+" : ""}{fmtPct(pct)}</span>
                        </span>
                      );
                    })()
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-2 tabular-nums">{fmtMoney(r.currency, r.marketValue)}</td>
                <td className={`p-2 tabular-nums ${signClass(r.profitLoss)}`}>
                  <div>{fmtMoney(r.currency, r.profitLoss)}</div>
                  <div className="text-xs">
                    {r.profitLossRate > 0 ? "+" : ""}
                    {fmtPct(r.profitLossRate)}
                  </div>
                </td>
                <td className={`p-2 tabular-nums ${signClass(r.dailyProfitLoss)}`}>
                  <div>{fmtMoney(r.currency, r.dailyProfitLoss)}</div>
                  <div className="text-xs">
                    {r.dailyProfitLossRate > 0 ? "+" : ""}
                    {fmtPct(r.dailyProfitLossRate)}
                  </div>
                </td>
                <td className="p-2 text-center">
                  <OrderButton
                    symbol={r.symbol}
                    name={r.name}
                    currency={r.currency}
                    lastPrice={r.lastPrice}
                    defaultSide="SELL"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TossHoldingsView({ result }: { result: TossHoldingsResult }) {
  const [filter, setFilter] = useState<MarketFilter>("ALL");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const allRows = result.status === "ok" ? result.rows : [];
  const usdKrwRate = result.status === "ok" ? result.usdKrwRate : 0;

  const counts = useMemo(
    () => ({
      ALL: allRows.length,
      KR: allRows.filter((r) => r.marketCountry === "KR").length,
      US: allRows.filter((r) => r.marketCountry === "US").length,
    }),
    [allRows],
  );

  const filteredRows = useMemo(
    () => (filter === "ALL" ? allRows : allRows.filter((r) => r.marketCountry === filter)),
    [allRows, filter],
  );

  const summary = useMemo(
    () => computeKrwSummary(filteredRows, usdKrwRate),
    [filteredRows, usdKrwRate],
  );

  // USD 보유분이 있는데 환율이 없으면 원화 환산 합계가 부정확함을 알린다.
  const hasUsd = filteredRows.some((r) => r.currency === "USD");
  const conversionUnavailable = hasUsd && usdKrwRate <= 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          disabled={pending}
          className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {pending ? "새로고침 중…" : "↻ 새로고침"}
        </button>
      </div>

      {result.status === "not_configured" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
          토스증권 API 키가 설정되지 않았습니다. <code>.env.local</code>에{" "}
          <code>TOSS_API_KEY</code>, <code>TOSS_API_SECRET</code>를 추가하세요.
        </div>
      )}

      {result.status === "error" && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
          보유종목을 불러오지 못했습니다: {result.message}
        </div>
      )}

      {result.status === "ok" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
            <span>
              계좌 {result.account.accountNo} · {result.account.accountType} · 보유{" "}
              {counts.ALL}종목
            </span>
            {usdKrwRate > 0 && (
              <span>원화 환산 기준 USD→KRW {usdKrwRate.toLocaleString("ko-KR")}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="총 매입금액(원화환산)" amount={summary.totalPurchase} />
            <SummaryCard label="평가금액(원화환산)" amount={summary.marketValue} />
            <SummaryCard
              label="평가손익(원화환산)"
              amount={summary.profitLoss}
              rate={summary.profitLossRate}
            />
            <SummaryCard
              label="당일손익(원화환산)"
              amount={summary.dailyProfitLoss}
              rate={summary.dailyProfitLossRate}
            />
          </div>

          {conversionUnavailable && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠ 환율을 불러오지 못해 USD 보유분이 원화 환산 합계에서 누락되었습니다.
            </p>
          )}

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

          {filteredRows.length === 0 ? (
            <p className="text-sm text-gray-500">표시할 종목이 없습니다.</p>
          ) : (
            <HoldingsTable rows={filteredRows} />
          )}
        </>
      )}
    </div>
  );
}
