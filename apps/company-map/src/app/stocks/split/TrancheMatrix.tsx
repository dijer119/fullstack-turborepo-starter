import Link from "next/link";
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
          <th scope="col" className="sticky left-0 z-20 min-w-36 border-b border-r border-line bg-surface-inset px-4 py-3 text-left sm:min-w-48  ">종목명 <span className="font-normal">↑</span></th>
          {Array.from({ length: slots }, (_, i) => <th key={i} scope="col" className="min-w-28 border-b border-r border-line px-3 py-3 font-medium ">{i + 1}차</th>)}
        </tr></thead>
        <tbody>{rows.map(row => {
          const href = `/stocks/split/${mode}/${row.id}`;
          const state = row.status === "active" ? "실행 중" : row.status === "reserved" ? "예약 감시 중" : row.status === "paused" ? "일시정지" : "종료";
          return <tr key={row.id} aria-label={`${row.name} 차수별 전략`}>
            <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-surface px-4 py-3 text-left font-normal  ">
              <Link href={href} className="block space-y-1 rounded focus-visible:outline-2 focus-visible:outline-blue-500" title={row.note ?? undefined}>
                <span className="flex items-center gap-1.5 text-[11px] text-muted"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${["active", "reserved"].includes(row.status) ? "bg-emerald-500" : "bg-gray-400"}`} />{state}{row.pendingCount > 0 && <span className="text-amber-700 dark:text-amber-400">· 주문 {row.pendingCount}</span>}</span>
                <span className="block max-w-36 truncate font-semibold hover:text-blue-ink" title={row.name}>{row.name}</span>
                <span className={`block font-semibold tabular-nums ${profitColor(row.profitPct)}`}>{percent(row.profitPct)}</span>
                <span className="block text-[11px] text-muted">{row.symbol} · {row.accountLabel}</span>
                <span className="block text-[10px] text-subtle">{row.lastCheckedAt ? `${mode === "live" ? "감시" : "관측"} ${new Date(row.lastCheckedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "시세 확인 전"}</span>
                {mode === "live" && monitoringWarning(row, asOf) && <span className="block text-[11px] font-medium text-amber-800 dark:text-amber-300">{monitoringWarning(row, asOf)}</span>}
              </Link>
            </th>
            {Array.from({ length: slots }, (_, index) => {
              const cell = row.cells[index];
              if (!cell) return <td key={index + 1} className="border-b border-r border-line bg-surface-muted px-3 text-center text-subtle  " aria-label={`${index + 1}차 미설정`}>—</td>;
              const pending = ["buy_pending", "sell_pending", "review"].includes(cell.state);
              return <td key={cell.slot} className={`border-b border-r border-line text-center  ${pending ? "bg-amber-50 dark:bg-amber-950/30" : cell.quantity > 0 ? "bg-rose-50/60 dark:bg-rose-950/15" : cell.state === "buy_wait" ? "bg-cyan-50/60 dark:bg-cyan-950/20" : "bg-surface-muted "}`}>
                <Link href={href} aria-label={`${row.name} ${cell.slot}차 ${labels[cell.state]}${cell.quantity > 0 ? ` ${percent(cell.profitPct)}` : ""} 설정·장부`} className="flex min-h-32 flex-col items-center justify-center gap-1 px-3 py-4 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5">
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
