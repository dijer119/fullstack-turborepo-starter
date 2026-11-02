import {
  sumRealizedProfits,
  type ProfitEntry,
} from "@/lib/split/profit-summary";

export function ProfitSummary({
  entries,
  mode,
}: {
  entries: readonly ProfitEntry[];
  mode: "실거래" | "모의";
}) {
  const totals = sumRealizedProfits(entries);
  return (
    <section
      aria-label={`${mode} 누적 수익금`}
      className="rounded-lg border border-line bg-surface-inset p-4"
    >
      <h3 className="font-semibold">
        누적 수익금{" "}
        <span className="text-xs font-normal text-muted">
          {mode} 전체 전략 · 실현손익
        </span>
      </h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        {(
          [
            ["KR", "원화 · KRW", "₩"],
            ["US", "달러 · USD", "$"],
          ] as const
        ).map(([market, label, symbol]) => (
          <div key={market} className="min-w-0">
            <dt className="text-xs text-muted">{label}</dt>
            <dd
              className={`mt-1 break-words text-2xl font-semibold tabular-nums ${totals[market] > 0 ? "text-emerald-700 dark:text-emerald-400" : totals[market] < 0 ? "text-red-ink " : ""}`}
            >
              {symbol}
              {totals[market].toLocaleString("ko-KR", {
                maximumFractionDigits: 4,
              })}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">
        장부에 반영된 매도 체결의 순손익 합계입니다. 수수료·세금과 손실을
        반영하며 보유 평가손익은 포함하지 않습니다. 종료한 전략과 이전 재진입
        회차도 포함합니다.
      </p>
    </section>
  );
}
