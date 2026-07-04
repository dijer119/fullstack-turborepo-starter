"use client";

import { useState } from "react";
import Link from "next/link";
import type { TossHoldingsResult } from "@/actions/toss-holdings";
import type { StockWatchRow } from "@/actions/stock-watches";
import type { MarketStatus } from "@/actions/market";
import { TossHoldingsView } from "./TossHoldingsView";
import { WatchlistManager } from "../watchlist/WatchlistManager";

type Tab = "holdings" | "watchlist";

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

function MarketBadge({ label, s }: { label: string; s: MarketStatus }) {
  const color =
    s.kind === "regular"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
      : s.kind === "extended"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
  const dot =
    s.kind === "regular" ? "🟢" : s.kind === "extended" ? "🟡" : "⚪";
  const suffix =
    s.until != null
      ? s.kind === "closed"
        ? ` · 개장 ${fmtTime(s.until)}`
        : ` · ~${fmtTime(s.until)}`
      : "";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {dot} {label} {s.label}
      {s.kind === "extended" && " (시장외)"}
      <span className="font-normal opacity-80">{suffix}</span>
    </span>
  );
}

function TabButton({
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
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
          : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

export function TossTabs({
  holdings,
  watches,
  marketStatus,
}: {
  holdings: TossHoldingsResult;
  watches: StockWatchRow[];
  marketStatus: { kr: MarketStatus; us: MarketStatus } | null;
}) {
  const [tab, setTab] = useState<Tab>("holdings");

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">토스증권</h1>
        <p className="mt-1 text-sm text-gray-500">
          토스증권 Open API 기반 보유종목·관심종목 현황입니다.
        </p>
        <Link
          href="/stocks"
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← 전종목 조회
        </Link>
      </header>

      {marketStatus && (
        <div className="flex flex-wrap gap-2">
          <MarketBadge label="국내" s={marketStatus.kr} />
          <MarketBadge label="미국" s={marketStatus.us} />
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        <TabButton active={tab === "holdings"} onClick={() => setTab("holdings")}>
          보유종목
        </TabButton>
        <TabButton active={tab === "watchlist"} onClick={() => setTab("watchlist")}>
          관심종목
        </TabButton>
      </div>

      {tab === "holdings" ? (
        <TossHoldingsView result={holdings} />
      ) : (
        <WatchlistManager initialWatches={watches} />
      )}
    </main>
  );
}
