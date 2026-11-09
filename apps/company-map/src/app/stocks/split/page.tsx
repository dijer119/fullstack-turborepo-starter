import Link from "next/link";
import { listSplitSimulations } from "@/actions/split";
import { listSplitLive } from "@/actions/split-live";
import { LiveHoldingsSummary } from "./LiveHoldingsSummary";
import { StrategyList } from "./StrategyList";
import { summarizeTranches } from "@/lib/split/strategy-tranches";
import { SplitNavigation } from "./SplitNavigation";

export const dynamic = "force-dynamic";

export default async function SplitPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode: requestedMode } = await searchParams;
  const mode = requestedMode === "simulation" ? "simulation" : "live";
  const [simulations, live] = await Promise.all([
    listSplitSimulations(undefined, false),
    listSplitLive(undefined, false),
  ]);
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <Link href="/stocks" className="text-sm text-blue-ink hover:underline ">← 전종목 조회</Link>
    <header><h1 className="mt-3 text-2xl font-bold">분할매매 종목 목록</h1><p className="mt-2 text-sm text-muted">종목별 운용 현황을 확인하고, 설정·장부에서 전략을 관리하세요.</p></header>
    <SplitNavigation />
    <StrategyList key={mode} mode={mode} asOf={live.loadedAt}
      live={live.strategies.map(s => ({ id: s.id, name: s.name, symbol: s.symbol, market: s.market, status: s.status, accountLabel: `계좌 ${s.accountSeq}`, holdingQty: s.holdingQty, sellCount: s.sellCount, realizedPnl: s.realizedPnl, totalPnl: s.totalPnl, lastPrice: s.lastPrice, lastCheckedAt: s.lastCheckedAt, note: s.note, ...summarizeTranches(s.maxTranches, s.status, s.lastPrice, s.lots, s.orders.map(o => ({ ...o, slot: s.lots.find(l => l.id === o.lotId)!.slot }))) }))}
      simulations={simulations.map(s => ({ id: s.id, name: s.config.name || s.config.symbol, symbol: s.config.symbol, market: s.config.market, status: s.state.status, accountLabel: s.config.source === "manual" ? "가격 경로" : "토스 시세", holdingQty: s.summary.holdingQty, sellCount: s.state.lots.filter(l => l.closedStep !== null).length, realizedPnl: s.summary.realizedPnl, totalPnl: s.summary.totalPnl, lastPrice: s.state.lastPrice, lastCheckedAt: s.lastObservedAt, note: s.state.note, ...summarizeTranches(s.config.maxTranches, s.state.status, s.state.lastPrice, s.state.lots, []) }))}>
      {mode === "live" && <LiveHoldingsSummary strategies={live.strategies} />}
    </StrategyList>
  </main>;
}
