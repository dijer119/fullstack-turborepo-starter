"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSplitSimulation,
  runSplitManual,
  runSplitQuote,
  setSplitStatus,
  type listSplitSimulations,
} from "@/actions/split";
import { strategyProgress } from "@/lib/split/progress";
import { DetailTabs, type DetailTab } from "./DetailTabs";
import { StrategyProgress, RecentTradeList } from "./StrategyProgress";
import { SplitPriceChart } from "./SplitPriceChart";
import type { SplitConfig } from "@/lib/split/engine";

type Simulation = Awaited<ReturnType<typeof listSplitSimulations>>[number];
const inputClass =
  "w-full rounded border border-line bg-surface px-2 py-1.5  ";
const buttonClass =
  "rounded border border-line bg-surface-inset px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-50  ";
const defaults: SplitConfig = {
  symbol: "005930",
  name: "",
  market: "KR",
  source: "manual",
  initialCash: 300000,
  trancheBudget: 100000,
  maxTranches: 3,
  buyDropPct: 10,
  takeProfitPct: 10,
  feePct: 0,
  sellTaxPct: 0,
};
const statusText = { active: "실행 중", paused: "일시정지", completed: "종료" };
const number = (value: number) =>
  value.toLocaleString("ko-KR", { maximumFractionDigits: 4 });

export function SplitManager({ simulations, mode }: { simulations: Simulation[]; mode: "create" | "detail" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [config, setConfig] = useState<SplitConfig>(defaults);
  const showForm = mode === "create";
  const [message, setMessage] = useState("");
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<DetailTab>("progress");

  const execute = (task: () => Promise<{ ok: boolean; message: string }>) => {
    start(async () => {
      try {
        const result = await task();
        setMessage(result.message);
        router.refresh();
      } catch {
        setMessage(
          "요청을 완료하지 못했습니다. 장부를 새로고침한 뒤 확인하세요.",
        );
      }
    });
  };

  const runPath = (simulation: Simulation) => {
    const text = paths[simulation.id] ?? "10000, 9000, 8100, 8910, 8100";
    const values = text
      .trim()
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map(Number);
    if (
      !values.length ||
      values.length > 200 ||
      values.some((v) => !Number.isFinite(v) || v <= 0)
    ) {
      setMessage(
        "공백이나 쉼표로 구분한 양수 가격을 1~200개 입력하세요. 천 단위 구분 쉼표는 넣지 마세요.",
      );
      return;
    }
    const requestKey = Array.from(
      crypto.getRandomValues(new Uint8Array(16)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    execute(() => runSplitManual(simulation.id, values, requestKey));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          disabled={pending}
          onClick={() => router.refresh()}
        >
          장부 새로고침
        </button>
      </div>
      {message && (
        <p
          role="status"
          className="rounded bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
        >
          {message}
        </p>
      )}
      {showForm && (
        <form
          className="rounded-lg border border-line bg-surface p-4 "
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              try {
                const result = await createSplitSimulation(config);
                if (result.ok) {
                  router.push(`/stocks/split/simulation/${result.id}`);
                  setMessage(
                    "모의 전략을 만들었습니다. 가격을 반영하면 1차 매수를 시작합니다.",
                  );
                  router.refresh();
                } else setMessage(result.message);
              } catch {
                setMessage("모의 전략 생성에 실패했습니다.");
              }
            });
          }}
        >
          <h2 className="mb-3 font-semibold">새 모의 전략</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              시장
              <select
                aria-label="시장"
                className={inputClass}
                value={config.market}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    market: event.target.value as SplitConfig["market"],
                    symbol: event.target.value === "KR" ? "005930" : "AAPL",
                    initialCash: event.target.value === "KR" ? 300000 : 3000,
                    trancheBudget: event.target.value === "KR" ? 100000 : 1000,
                  })
                }
              >
                <option value="KR">국내 · KRW</option>
                <option value="US">미국 · USD</option>
              </select>
            </label>
            <label className="text-sm">
              종목코드 / 티커
              <input
                aria-label="종목코드 / 티커"
                className={inputClass}
                required
                value={config.symbol}
                onChange={(event) =>
                  setConfig({ ...config, symbol: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              표시 이름
              <input
                aria-label="표시 이름"
                className={inputClass}
                maxLength={100}
                value={config.name}
                onChange={(event) =>
                  setConfig({ ...config, name: event.target.value })
                }
                placeholder="선택 사항"
              />
            </label>
            <label className="text-sm">
              가격 원천
              <select
                aria-label="가격 원천"
                className={inputClass}
                value={config.source}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    source: event.target.value as SplitConfig["source"],
                  })
                }
              >
                <option value="manual">직접 입력 · 가격 경로 재생</option>
                <option value="toss">토스 현재 시세 · 조회 전용</option>
              </select>
            </label>
            {(
              [
                ["initialCash", "모의 자금"],
                ["trancheBudget", "차수당 예산"],
                ["maxTranches", "최대 차수"],
                ["buyDropPct", "추가 매수 하락 간격 (%)"],
                ["takeProfitPct", "차수별 익절률 (%)"],
                ["feePct", "매수·매도 수수료 (%)"],
                ["sellTaxPct", "매도세 (%)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                {label}
                <input
                  aria-label={label}
                  className={inputClass}
                  type="number"
                  step={key === "maxTranches" ? "1" : "0.0001"}
                  required
                  value={Number.isNaN(config[key]) ? "" : config[key]}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      [key]:
                        event.target.value === ""
                          ? NaN
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="my-3 text-xs text-muted">
            예산에는 매수 수수료가 포함됩니다. 모의 자금 ≥ 차수당 예산 × 최대
            차수. 익절은 가격 수익률로 판단하며 손익에는 입력한 비용을
            반영합니다. 기본값은 예시이며 추천 조건이 아닙니다.
          </p>
          <button className={buttonClass} disabled={pending} type="submit">
            모의 전략 생성
          </button>
        </form>
      )}

      {simulations.length === 0 && !showForm && (
        <p className="text-sm text-muted">등록된 모의 전략이 없습니다.</p>
      )}
      {simulations.map((simulation) => {
        const { id, config: c, state, summary } = simulation;
        const money = (value: number) =>
          `${c.market === "KR" ? "₩" : "$"}${number(value)}`;
        const held = state.lots.filter((lot) => lot.remainingQty > 0);
        const progress = strategyProgress(c.maxTranches, state.lots.map(lot => ({ ...lot, boughtQty: lot.quantity, pendingOrderCount: 0 })));
        const recent = state.lots.flatMap(lot => [
          { id: `${lot.slot}-${lot.generation}-buy`, side: "BUY" as const, step: lot.openedStep, label: `${lot.slot}차 · ${lot.generation}회차 · 모의 매수`, detail: `${lot.quantity}주 · 매수가 ${money(lot.buyPrice)} · 관측 #${lot.openedStep}` },
          ...(lot.closedStep === null ? [] : [{ id: `${lot.slot}-${lot.generation}-sell`, side: "SELL" as const, step: lot.closedStep, label: `${lot.slot}차 · ${lot.generation}회차 · 모의 매도`, detail: `${lot.quantity}주 · 매도가 ${lot.sellPrice === null ? "—" : money(lot.sellPrice)} · 실현손익 ${money(lot.realizedPnl)} · 관측 #${lot.closedStep}` }]),
        ]).sort((a, b) => b.step - a.step).slice(0, 20);
        return (
          <section
            key={id}
            className="min-w-0 rounded-lg border border-line bg-surface p-4 "
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">{c.name || c.symbol}</h2>
              <span className="text-xs text-muted">
                {c.symbol} · {c.market === "KR" ? "KRW" : "USD"}
              </span>
              <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                모의 전용
              </span>
              <span className="text-xs">
                {statusText[state.status]} ·{" "}
                {c.source === "manual" ? "가격 경로" : "토스 시세"} ·{" "}
                {state.stepCount}회 관측
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">
              최대 {c.maxTranches}차 · 차수당 {money(c.trancheBudget)} · 하락{" "}
              {c.buyDropPct}% / 익절 {c.takeProfitPct}% ·{" "}
              {state.note ?? "첫 가격 입력 대기"}
            </p>
            <DetailTabs id={id} value={tab} onChange={setTab} />
            <p className="mt-3 text-xs text-muted">
              보유 {number(summary.holdingQty)}주 · 현재가{" "}
              {state.lastPrice === null ? "—" : money(state.lastPrice)} ·
              총수익률 {number(summary.totalReturnPct)}% · 총자산 = 잔액 +
              평가액
            </p>
            {tab === "progress" && <div role="tabpanel" id={`${id}-progress-panel`} aria-labelledby={`${id}-progress-tab`}>
              <StrategyProgress progress={progress} money={money} recent={recent} recentNote="최근 모의 체결 5건 · 실제 체결 시각 대신 가격 경로의 관측 번호를 표시합니다." onTrades={() => setTab("trades")}>
                <SplitPriceChart id={id} mode="simulation" version={String(state.stepCount)} market={c.market} maxTranches={c.maxTranches} />
              </StrategyProgress>
            </div>}
            {tab === "settings" && <div role="tabpanel" id={`${id}-settings-panel`} aria-labelledby={`${id}-settings-tab`} className="mt-4 space-y-4">
              <h3 className="font-semibold">모의 전략 설정</h3>
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-surface-muted p-4 text-sm ">
                {[["초기 자금", money(c.initialCash)], ["차수당 금액", money(c.trancheBudget)], ["최대 차수", `${c.maxTranches}차`], ["매수 하락률", `${c.buyDropPct}%`], ["익절률", `${c.takeProfitPct}%`], ["수수료 / 매도세", `${c.feePct}% / ${c.sellTaxPct}%`]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
              </dl>
              <p className="text-xs text-muted">모의 전략의 생성 시 조건입니다. 다른 조건은 새 모의 전략으로 비교하세요.</p>
              <h3 className="font-semibold">모의 실행</h3>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              {c.source === "manual" ? (
                <>
                  <label className="min-w-0 flex-1 text-xs">
                    가격 경로 (시간 순서, 최대 200개)
                    <textarea
                      aria-label={`${c.symbol} 가격 경로`}
                      className={`${inputClass} mt-1 min-h-16`}
                      value={paths[id] ?? "10000, 9000, 8100, 8910, 8100"}
                      onChange={(event) =>
                        setPaths({ ...paths, [id]: event.target.value })
                      }
                    />
                  </label>
                  <button
                    className={buttonClass}
                    disabled={pending || state.status !== "active"}
                    onClick={() => runPath(simulation)}
                  >
                    가격 경로 반영
                  </button>
                </>
              ) : (
                <button
                  className={buttonClass}
                  disabled={pending || state.status !== "active"}
                  onClick={() => execute(() => runSplitQuote(id))}
                >
                  토스 시세로 모의 1회
                </button>
              )}
              {state.status !== "completed" && (
                <button
                  className={buttonClass}
                  disabled={pending}
                  onClick={() =>
                    execute(() =>
                      setSplitStatus(
                        id,
                        state.status === "paused" ? "active" : "paused",
                      ),
                    )
                  }
                >
                  {state.status === "paused" ? "재개" : "일시정지"}
                </button>
              )}
            </div>
            {c.source === "toss" && (
              <p className="mt-2 text-xs text-muted">
                최근 5분 이내 시세만 반영합니다. 같은 시세는 한 번만 처리하며 장
                마감·거래정지 시 반영되지 않을 수 있습니다. 마지막 관측:{" "}
                {simulation.lastObservedAt ?? "—"}
              </p>
            )}
            </div>}
            {tab === "ledger" && <div role="tabpanel" id={`${id}-ledger-panel`} aria-labelledby={`${id}-ledger-tab`} className="mt-4 space-y-4">
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  ["모의 잔액", state.cash],
                  ["보유 평가액", summary.marketValue],
                  ["누적 수익금", summary.realizedPnl],
                  ["평가손익", summary.unrealizedPnl],
                  ["총손익", summary.totalPnl],
                  ["총자산", summary.equity],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd
                    className={`mt-1 break-words ${label === "누적 수익금" ? "font-semibold text-blue-ink " : "font-medium"}`}
                  >
                    {money(value)}
                  </dd>
                </div>
              ))}
            </dl>
                <p className="text-xs text-muted">
                  {held.length}개 차수 보유. 매도는 기존 보유부터 판정하고,
                  매도가 없을 때 한 차수만 매수합니다. 전량 청산 후에는 자동
                  재시작하지 않습니다.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap text-right text-xs">
                    <thead className="bg-surface-muted ">
                      <tr>
                        {[
                          "차수·회차",
                          "상태",
                          "매수가",
                          "수량·잔량",
                          "매수원가(비용 포함)",
                          "매도 감시가",
                          "매도가",
                          "실현손익",
                          "관측 번호",
                        ].map((label) => (
                          <th className="p-2" key={label}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {state.lots.map((lot) => (
                        <tr
                          className="border-b border-line "
                          key={`${lot.slot}:${lot.generation}`}
                        >
                          <td className="p-2">
                            {lot.slot}차 · {lot.generation}회
                          </td>
                          <td className="p-2">
                            {lot.remainingQty > 0 ? "보유" : "청산"}
                          </td>
                          <td className="p-2">{money(lot.buyPrice)}</td>
                          <td className="p-2">
                            {lot.quantity} / {lot.remainingQty}
                          </td>
                          <td className="p-2">{money(lot.buyCost)}</td>
                          <td className="p-2">
                            {money(lot.buyPrice * (1 + c.takeProfitPct / 100))}
                          </td>
                          <td className="p-2">
                            {lot.sellPrice === null
                              ? "—"
                              : money(lot.sellPrice)}
                          </td>
                          <td className="p-2">{money(lot.realizedPnl)}</td>
                          <td className="p-2">
                            매수 {lot.openedStep} / 매도 {lot.closedStep ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {state.lots.length === 0 && (
                    <p className="py-4 text-sm text-muted">
                      아직 모의 매수한 차수가 없습니다.
                    </p>
                  )}
                </div>
            </div>}
            {tab === "trades" && <div role="tabpanel" id={`${id}-trades-panel`} aria-labelledby={`${id}-trades-tab`} className="mt-4 space-y-4">
              <h3 className="font-semibold">최근 모의 체결 20건</h3>
              <p className="text-xs text-muted">관측 번호순으로 표시합니다. 실제 거래가 아닌 모의 체결 내역입니다.</p>
              <RecentTradeList recent={recent} />
                <div>
                  <h3 className="mb-2 text-sm font-medium">최근 실행 10건</h3>
                  <ul className="space-y-2 text-xs text-muted">
                    {simulation.runs.map((run) => (
                      <li key={run.id} className="break-words">
                        {run.createdAt} ·{" "}
                        {run.source === "manual" ? "가격 경로" : "토스 조회"} ·{" "}
                        {run.prices.length}개 가격 · 모의 체결 {run.fillCount}건
                        · {run.prices.slice(0, 8).map(number).join(" → ")}
                        {run.prices.length > 8 ? " …" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
            </div>}
          </section>
        );
      })}
    </div>
  );
}
