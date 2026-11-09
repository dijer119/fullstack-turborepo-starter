import Link from "next/link";
import { StrategyStatusBadge, pausedRowAccent } from "./StrategyStatusBadge";
import { NaverFinanceLink } from "@/components/stocks/NaverFinanceLink";
import { monitoringWarning, type StrategyListRow } from "@/lib/split/strategy-list";
import type { TrancheState } from "@/lib/split/strategy-tranches";

const labels: Record<TrancheState, string> = {
  held: "보유", buy_wait: "매수 대기", buy_pending: "매수 미체결", sell_pending: "매도 미체결",
  review: "주문 확인", paused: "일시정지", closed: "매도 완료", waiting: "—",
};
const percent = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const profitColor = (value: number | null) => value !== null && value > 0 ? "text-red-ink " : value !== null && value < 0 ? "text-blue-ink " : "text-muted";

export function TrancheMatrix({ rows, mode, asOf }: { rows: StrategyListRow[]; mode: "live" | "simulation"; asOf: number }) {
  const slots = Math.max(1, ...rows.map(row => row.cells.length));
  return <div className="space-y-2">
    <p className="text-xs leading-5 text-muted">평가등락률 = 보유분 매수가 대비 장부의 마지막 가격 · 수수료·세금 미포함 · 당일 등락률이 아닙니다.<br />매수 대기는 조건 감시 상태입니다. 차수를 누르면 설정·장부로 이동합니다. 옆으로 스크롤해 다음 차수를 확인하세요.</p>
    <div className="max-w-full overflow-x-auto rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-blue-500 " tabIndex={0} role="region" aria-label="차수별 수익률 표">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">종목별 보유 차수의 평가등락률과 주문 상태</caption>
        <thead><tr className="bg-surface-inset text-muted ">
          <th scope="col" className="sticky left-0 z-20 min-w-52 border-b border-r border-line bg-surface-inset px-3 py-2 text-left sm:min-w-60  ">종목명 <span className="font-normal">↑</span></th>
          {Array.from({ length: slots }, (_, i) => <th key={i} scope="col" className="min-w-28 border-b border-r border-line px-3 py-3 font-medium ">{i + 1}차</th>)}
        </tr></thead>
        <tbody>{rows.map(row => {
          const href = `/stocks/split/${mode}/${row.id}`;
          const paused = row.status === "paused";
          return <tr key={row.id} aria-label={`${row.name} 차수별 전략`} className={paused ? "[&>td:not([data-pending])]:bg-violet-50 dark:[&>td:not([data-pending])]:bg-violet-950" : undefined}>
            <th scope="row" className={`sticky left-0 z-10 border-b border-r border-line px-3 py-2 text-left font-normal ${paused ? pausedRowAccent : "bg-surface"}`}>
              <Link href={href} className="block space-y-0.5 rounded focus-visible:outline-2 focus-visible:outline-blue-500" title={row.note ?? undefined}>
                <span className="flex items-center justify-between gap-2">
                  <span className="max-w-36 truncate font-semibold hover:text-blue-ink" title={row.name}>{row.name}</span>
                  <StrategyStatusBadge status={row.status} />
                </span>
                <span className="flex items-center justify-between gap-2 tabular-nums">
                  <span className="font-semibold" title={mode === "live" ? "최근 매매 판단 가격" : "최근 관측 가격"}><span className="mr-1 text-[10px] font-normal text-muted">{mode === "live" ? "현재가" : "관측가"}</span>{row.lastPrice === null ? "미수신" : `${row.market === "KR" ? "₩" : "$"}${row.lastPrice.toLocaleString("ko-KR", { maximumFractionDigits: row.market === "KR" ? 0 : 2 })}`}</span>
                  <span className={`font-semibold ${profitColor(row.profitPct)}`}>{percent(row.profitPct)}</span>
                </span>
              </Link>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted">
                <span>{row.symbol} · {row.accountLabel}</span>
                {row.market === "KR" && <NaverFinanceLink code={row.symbol} name="네이버 금융" className="shrink-0 text-[10px] text-blue-ink" />}
              </div>
              <span className="block text-[10px] leading-4 text-subtle"><span className="font-medium text-foreground" title={mode === "live" ? "실제 매도 체결이 있는 주문 수 · 부분 체결도 주문당 1회 · 전체 이력 기준" : "모의 매도 완료 횟수 · 전체 이력 기준"}>매도 {row.sellCount.toLocaleString("ko-KR")}회</span> · {row.lastCheckedAt ? `${mode === "live" ? "감시" : "관측"} ${new Date(row.lastCheckedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "시세 확인 전"}{row.pendingCount > 0 && <span className="ml-1 text-amber-700 dark:text-amber-400">· 주문 {row.pendingCount}</span>}</span>
              {mode === "live" && monitoringWarning(row, asOf) && <span className="block text-[11px] font-medium text-amber-800 dark:text-amber-300">{monitoringWarning(row, asOf)}</span>}
            </th>
            {Array.from({ length: slots }, (_, index) => {
              const cell = row.cells[index];
              if (!cell) return <td key={index + 1} className="border-b border-r border-line bg-surface-muted px-3 text-center text-subtle  " aria-label={`${index + 1}차 미설정`}>—</td>;
              const pending = ["buy_pending", "sell_pending", "review"].includes(cell.state);
              return <td key={cell.slot} data-pending={pending || undefined} className={`border-b border-r border-line text-center  ${pending ? "bg-amber-50 dark:bg-amber-950/30" : cell.quantity > 0 ? "bg-rose-50/60 dark:bg-rose-950/15" : cell.state === "buy_wait" ? "bg-cyan-50/60 dark:bg-cyan-950/20" : "bg-surface-muted "}`}>
                <Link href={href} aria-label={`${row.name} ${cell.slot}차 ${labels[cell.state]}${cell.quantity > 0 ? ` ${percent(cell.profitPct)}` : ""} 설정·장부`} className="flex min-h-20 flex-col items-center justify-center gap-0.5 px-3 py-2 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5">
                  {cell.quantity > 0 && <><span className={`text-base font-semibold tabular-nums ${profitColor(cell.profitPct)}`}>{percent(cell.profitPct)}</span><span className="text-xs text-muted">{cell.quantity.toLocaleString("ko-KR")}주 보유</span></>}
                  {cell.state !== "held" && <span className={`whitespace-nowrap rounded-lg px-2 py-1 text-xs ${pending ? "border border-amber-200 bg-surface text-amber-800 dark:border-amber-800  dark:text-amber-400" : cell.state === "buy_wait" ? "border border-red-200 bg-surface text-red-ink dark:border-red-900 " : "text-subtle"}`}>{labels[cell.state]}</span>}
                </Link>
              </td>;
            })}
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
