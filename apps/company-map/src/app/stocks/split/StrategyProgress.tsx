import type { strategyProgress } from "@/lib/split/progress";
import type { ReactNode } from "react";

export interface RecentTrade { id: string; side: "BUY" | "SELL"; label: string; detail: string }
export function StrategyProgress({ progress, money, recent, recentNote, onTrades, children }: { progress: ReturnType<typeof strategyProgress>; money: (value: number) => string; recent: RecentTrade[]; recentNote: string; onTrades: () => void; children?: ReactNode }) {
  const tone = (value: number) => value > 0 ? "text-red-ink " : value < 0 ? "text-blue-ink " : "";
  return <div className="space-y-5 pt-4">
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="종목 진행 요약">
      {[["누적 실현손익", money(progress.realizedPnl)], ["총 반복 완료", `${progress.completed}회`], ["보유 차수", `${progress.holdingSlots}개`], ["보유수량", `${progress.holdingQty.toLocaleString("ko-KR")}주`]].map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-surface-muted p-4  "><dt className="text-xs text-muted">{label}</dt><dd className={`mt-2 break-words text-xl font-bold tabular-nums ${label === "누적 실현손익" ? tone(progress.realizedPnl) : ""}`}>{value}</dd></div>)}
    </dl>
    <p className="text-xs leading-5 text-muted">누적 실현손익은 수수료·세금·손실과 부분 매도 손익을 포함합니다. 반복 완료는 한 회차의 보유를 모두 매도하고 미해결 주문까지 정리한 횟수입니다.</p>
    {progress.pendingOrders > 0 && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">미체결·정산 확인이 필요한 주문 {progress.pendingOrders}건이 있습니다. 해당 회차는 반복 완료에서 제외됩니다.</p>}
    {children}
    <section aria-label="차수별 반복 현황" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2"><h4 className="font-semibold">차수별 반복 현황</h4><p className="text-xs text-muted">막대: 매수 회차 중 청산 완료 비율</p></div>
      <div className="overflow-x-auto rounded-xl border border-line " tabIndex={0}>
        <table className="w-full min-w-[640px] text-right text-sm"><caption className="sr-only">차수별 진입 회차, 청산 완료 횟수, 보유수량과 누적 실현손익</caption><thead className="bg-surface-muted text-xs text-muted "><tr>{["차수", "완료 비율", "매수 회차", "반복 완료", "보유수량", "누적 실현손익", "미해결 주문"].map(label => <th key={label} scope="col" className="whitespace-nowrap px-3 py-3">{label}</th>)}</tr></thead><tbody>{progress.rows.map(row => <tr key={row.slot} className="border-t border-line "><th scope="row" className="px-3 py-3">{row.slot}차</th><td className="min-w-32 px-3 py-3"><div className="h-2 overflow-hidden rounded-full bg-line " role="progressbar" aria-label={`${row.slot}차 청산 완료 비율`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.completionPct)} aria-valuetext={`${row.entries}회 진입 중 ${row.completed}회 완료`}><div className="h-full rounded-full bg-rose-400" style={{ width: `${row.completionPct}%` }} /></div><span className="mt-1 block text-[10px] text-subtle">{row.completed}/{row.entries}회</span></td><td className="px-3 py-3 text-red-ink">{row.entries}</td><td className="px-3 py-3 font-semibold text-blue-ink ">{row.completed}</td><td className="px-3 py-3 tabular-nums">{row.holdingQty.toLocaleString("ko-KR")}주</td><td className={`px-3 py-3 tabular-nums ${tone(row.realizedPnl)}`}>{money(row.realizedPnl)}</td><td className="px-3 py-3">{row.pendingOrders ? `${row.pendingOrders}건` : "—"}</td></tr>)}</tbody></table>
      </div>
      {progress.entries === 0 && <p className="text-sm text-muted">아직 매수 체결된 회차가 없습니다.</p>}
    </section>
    <section className="space-y-3" aria-label="최근 거래 요약">
      <div className="flex items-center justify-between gap-2"><h4 className="font-semibold">최근 거래</h4><button type="button" className="text-sm text-blue-ink hover:underline " onClick={onTrades}>최근 거래 더 보기 →</button></div>
      <p className="text-xs text-muted">{recentNote}</p>
      <RecentTradeList recent={recent.slice(0, 5)} />
    </section>
  </div>;
}

export function RecentTradeList({ recent }: { recent: RecentTrade[] }) {
  return (
      <ul className="divide-y divide-line rounded-xl border border-line px-4  ">{recent.map(trade => <li key={trade.id} className="flex items-start gap-3 py-3"><span className={`rounded px-2 py-1 text-xs font-semibold ${trade.side === "BUY" ? "bg-red-50 text-red-ink dark:bg-red-950/30" : "bg-blue-50 text-blue-ink dark:bg-blue-950/30 "}`}>{trade.side === "BUY" ? "매수" : "매도"}</span><div className="min-w-0"><p className="text-sm font-medium">{trade.label}</p><p className="mt-1 break-words text-xs leading-5 text-muted">{trade.detail}</p></div></li>)}{!recent.length && <li className="py-5 text-center text-sm text-muted">아직 거래 기록이 없습니다.</li>}</ul>
  );
}
