import { summarizeHoldings, type LiveHolding } from "@/lib/split/profit-summary";

export function LiveHoldingsSummary({ strategies }: { strategies: readonly LiveHolding[] }) {
  return <section aria-label="현재 보유 현황" className="rounded-lg border border-line bg-surface p-4">
    <h3 className="font-semibold">현재 보유 현황 <span className="text-xs font-normal text-muted">실거래 전체 전략</span></h3>
    {(["KR", "US"] as const).map(market => {
      const { cost, returnPct } = summarizeHoldings(strategies, market);
      const currency = market === "KR" ? "KRW" : "USD";
      return <dl key={market} className="mt-3 grid grid-cols-2 items-baseline gap-x-3 border-t border-line pt-2 sm:grid-cols-[5rem_1fr_1fr]">
        <div className="col-span-2 text-xs font-semibold text-muted sm:col-span-1"><dt className="sr-only">통화</dt><dd>{currency}</dd></div>
        <div><dt className="text-xs text-muted">총 매수금액</dt>
          <dd className="break-words text-xl font-semibold tabular-nums">{cost.toLocaleString("ko-KR", { style: "currency", currency })}</dd>
        </div>
        <div><dt className="text-xs text-muted">수익률 (누적 수익금 기준)</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {returnPct === null ? "—" : `${returnPct > 0 ? "+" : ""}${returnPct.toFixed(2)}%`}
          </dd>
        </div>
      </dl>;
    })}
    <p className="mt-2 text-xs text-muted">총 매수금액은 매수 비용을 포함한 현재 보유분의 원가입니다. 수익률 = 누적 실현수익금 ÷ 총 매수금액 × 100</p>
  </section>;
}
