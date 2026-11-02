"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSplitLive,
  loadSplitAccounts,
  startSplitLive,
  pauseSplitLive,
  syncSplitLive,
  recoverSplitLive,
  finishSplitLive,
  updateSplitTranches,
  type listSplitLive,
} from "@/actions/split-live";
import type { CreateLiveInput } from "@/lib/split/live-run";
import { lookupSplitStockName } from "@/actions/split-stock";
import { resolveTranches, validateTranches } from "@/lib/split/tranche-settings";
import { strategyProgress } from "@/lib/split/progress";
import { DetailTabs, type DetailTab } from "./DetailTabs";
import { StrategyProgress } from "./StrategyProgress";
import { SplitPriceChart } from "./SplitPriceChart";
import { TrancheEditor } from "./TrancheEditor";
import { MoneyInput } from "./MoneyInput";
import { RateInput } from "./RateInput";
import { ReservationEditor } from "./ReservationEditor";
import { reservationDate, reservationLabels } from "@/lib/split/reservation";
import { liveBuyDropPct, liveTakeProfitPct } from "@/lib/split/live-rules";
import { budgetModeLabels, getBudgetSchedule, type BudgetMode, type BudgetSettings, type TrancheSetting } from "@/lib/split/budget";

type Data = Omit<Awaited<ReturnType<typeof listSplitLive>>, "loadedAt">;
const inputClass =
  "w-full rounded border border-line bg-surface px-2 py-1.5  ";
const buttonClass =
  "rounded border border-line bg-surface-inset px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-50  ";
const number = (value: number) =>
  value.toLocaleString("ko-KR", { maximumFractionDigits: 4 });
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "아직 없음";
const states: Record<string, string> = {
  active: "자동 감시 중",
  reserved: "예약 가격 감시 중",
  paused: "일시정지",
  completed: "종료",
  submitting: "전송 결과 확인 필요",
  submitted: "미체결·부분 체결",
  submit_unknown: "접수 결과 미확인",
  blocked: "대조 필요",
  cost_pending: "체결 비용 미확정",
  closed: "주문 종료",
  rejected: "접수 거절",
  not_created: "미접수 확인",
};
const defaults: CreateLiveInput & Required<Pick<BudgetSettings, "budgetMode" | "budgetMultiplier">> & { firstTakeProfitPct: number } = {
  name: "",
  symbol: "005930",
  market: "KR",
  accountSeq: 0,
  initialCash: 1000000,
  trancheBudget: 100000,
  budgetMode: "fixed",
  budgetMultiplier: 1,
  maxTranches: 10,
  buyDropPct: 10,
  takeProfitPct: 10,
  firstTakeProfitPct: 10,
  feeBufferPct: 1,
};

export function LiveManager({ data, mode, reservationMode = false }: { data: Data; mode: "create" | "detail"; reservationMode?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const showForm = mode === "create";
  const [config, setConfig] = useState(defaults);
  const [useReservation, setUseReservation] = useState(reservationMode);
  const [watchPrice, setWatchPrice] = useState(0);
  const [expiresOn, setExpiresOn] = useState("");
  const configMoney = (value: number) => `${config.market === "KR" ? "₩" : "$"}${number(value)}`;
  const budgetPreview = (() => {
    try {
      if (config.tranches !== undefined) validateTranches(config.tranches, config.maxTranches, config.market);
      const schedule = getBudgetSchedule(config);
      const shortfall = Math.max(0, Math.round((schedule.total - config.initialCash) * 10000) / 10000);
      const error = !Number.isFinite(config.initialCash) || config.initialCash < 0.01 || config.initialCash > 1e10
        ? "배정 자금은 0.01 이상, 100억원 이하로 입력하세요."
        : shortfall > 0 ? `배정 자금이 ${configMoney(shortfall)} 부족합니다.` : "";
      return { ...schedule, error };
    } catch (error) {
      return { budgets: [], total: null, error: error instanceof Error ? error.message : "예산 설정을 확인하세요." };
    }
  })();
  const [manualName, setManualName] = useState<string | null>(null);
  const [stockName, setStockName] = useState({ key: "", name: "", message: "" });
  const symbol = config.symbol.trim().toUpperCase();
  const stockKey = `${config.market}:${symbol}`;
  const validSymbol = config.market === "KR"
    ? /^[A-Z0-9]{6}$/.test(symbol)
    : /^[A-Z][A-Z0-9.]{0,11}$/.test(symbol);
  const displayName = manualName ?? (stockName.key === stockKey ? stockName.name : "");
  useEffect(() => {
    if (!showForm || !data.configured || !validSymbol) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await lookupSplitStockName(symbol, config.market);
        if (!cancelled) setStockName({
          key: stockKey,
          name: result.ok ? result.name : "",
          message: result.ok ? "종목명이 자동으로 입력됐습니다. 직접 수정할 수 있습니다." : result.message,
        });
      } catch {
        if (!cancelled) setStockName({ key: stockKey, name: "", message: "종목명 조회 실패. 이름을 직접 입력하세요." });
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [showForm, data.configured, validSymbol, symbol, config.market, stockKey]);
  const [accounts, setAccounts] = useState<
    Array<{ accountSeq: number; label: string }>
  >([]);
  const [arming, setArming] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [tab, setTab] = useState<DetailTab>("progress");
  const [trancheEdits, setTrancheEdits] = useState<Record<string, TrancheSetting[]>>({});
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(id);
  }, [router]);
  const execute = (task: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      try {
        const result = await task();
        setMessage(result.message);
        if (result.ok) {
          setArming(null);
          setConfirmed(false);
        }
        router.refresh();
      } catch {
        setMessage(
          "요청 결과를 확인하지 못했습니다. 새로고침 후 장부를 확인하세요.",
        );
      }
    });
  return (
    <div className="space-y-4">
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
        실제 토스 계좌로 주문하는 자동매매입니다. 새 전략은 정지 상태로
        생성됩니다. 예약 매수는 감시 가격 이하에 도달하면, 일반 전략은 거래 가능 시간의 첫 유효 시세에서 1차 매수를 주문합니다.
        전량 익절 정산 후에는 다음 감시에서 같은 설정으로 1차 매수를 다시 시작합니다.
        일시정지는 신규 주문만 멈추며, 이미 제출한 주문의 취소·정정은 토스
        앱에서 처리하세요.
      </div>
      <p className="text-xs text-muted">
        정규장 + 국내 NXT 애프터마켓(지원·거래 가능 종목) · 30초 감시 · 정수주 지정가 DAY · 실제 체결 정산 · 자동 환전
        없음. 워커가 실행 중이어야 동작합니다. 마지막 감시가 90초 이상 갱신되지
        않으면 워커 상태를 확인하세요. 이 화면은 30초마다 새로고침됩니다.
      </p>
      {(!data.configured || data.disabled) && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {!data.configured
            ? "기존 토스 API 설정이 필요합니다."
            : "SPLIT_LIVE_DISABLED=1: 신규 실거래 주문이 중지되어 있습니다. 기존 주문 동기화는 계속합니다."}
        </p>
      )}
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
            if (budgetPreview.error) return setMessage(budgetPreview.error);
            execute(async () => {
              const result = await createSplitLive({
              ...config,
              reservation: useReservation ? { watchPrice, expiresOn } : undefined,
              tranches: resolveTranches(config),
              name: displayName,
              initialCash: config.market === "KR" ? Math.round(config.initialCash) : config.initialCash,
              trancheBudget: config.market === "KR" ? Math.round(config.trancheBudget) : config.trancheBudget,
              budgetMultiplier: Math.round(config.budgetMultiplier * 100) / 100,
              buyDropPct: Math.round(config.buyDropPct * 100) / 100,
              takeProfitPct: Math.round(config.takeProfitPct * 100) / 100,
              firstTakeProfitPct: Math.round(config.firstTakeProfitPct * 100) / 100,
              feeBufferPct: Math.round(config.feeBufferPct * 100) / 100,
              });
              if (result.ok && result.id) router.push(`/stocks/split/live/${result.id}`);
              return result;
            });
          }}
        >
          <h3 className="mb-3 font-semibold">
            새 실거래 전략 · 정지 상태로 생성
          </h3>
          <fieldset className="mb-4 space-y-3 rounded-lg bg-surface-muted p-4">
            <legend className="font-medium">1차 진입 방식</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label><input type="radio" name="entry-mode" checked={!useReservation} onChange={() => setUseReservation(false)} /> 시작 후 바로 진입</label>
              <label><input type="radio" name="entry-mode" checked={useReservation} onChange={() => setUseReservation(true)} /> 예약 가격 도달 시 진입</label>
            </div>
            {useReservation && <><div className="grid gap-3 sm:grid-cols-2">
              <MoneyInput label="감시 가격 이하에서 1차 매수" market={config.market} value={watchPrice} onChange={setWatchPrice} className={inputClass} />
              <label className="text-sm">감시 유효일 (한국시간)<input type="date" required className={inputClass} value={expiresOn} onChange={e => setExpiresOn(e.target.value)} /></label>
            </div><p className="text-xs text-muted">선택한 날짜 23:59:59까지 감시합니다. 1차 체결 후에는 아래 차수별 설정으로 계속 매매하며, 최초 감시 가격과 만료일은 재적용하지 않습니다.</p></>}
          </fieldset>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <button
              className={buttonClass}
              type="button"
              disabled={pending || !data.configured}
              onClick={() =>
                start(async () => {
                  try {
                    const result = await loadSplitAccounts();
                    if (result.ok) setAccounts(result.accounts);
                    else setMessage(result.message);
                  } catch {
                    setMessage("계좌 조회 실패");
                  }
                })
              }
            >
              토스 계좌 불러오기
            </button>
            <label className="min-w-0 flex-1 text-sm">
              실거래 계좌
              <select
                className={inputClass}
                aria-label="실거래 계좌"
                required
                value={config.accountSeq || ""}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    accountSeq: Number(event.target.value),
                  })
                }
              >
                <option value="" disabled>
                  조회 후 계좌 선택
                </option>
                {accounts.map((a) => (
                  <option key={a.accountSeq} value={a.accountSeq}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              실거래 시장
              <select
                className={inputClass}
                value={config.market}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    market: event.target.value,
                    symbol: event.target.value === "KR" ? "005930" : "AAPL",
                    initialCash: event.target.value === "KR" ? 1000000 : 10000,
                    trancheBudget: event.target.value === "KR" ? 100000 : 1000,
                    tranches: undefined,
                  })
                }
              >
                <option value="KR">국내 · KRW</option>
                <option value="US">미국 · USD</option>
              </select>
            </label>
            <label className="text-sm">
              실거래 종목코드
              <input
                className={inputClass}
                required
                value={config.symbol}
                onChange={(event) =>
                  setConfig({ ...config, symbol: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              실거래 표시 이름
              <input
                className={inputClass}
                maxLength={100}
                value={displayName}
                onChange={(event) =>
                  setManualName(event.target.value || null)
                }
              />
              <span className="mt-1 block text-xs text-muted" role="status">
                {manualName !== null
                  ? "직접 입력한 이름을 사용합니다. 비우면 종목명을 자동으로 채웁니다."
                  : !data.configured ? "토스 연동 후 종목명이 자동 입력됩니다."
                  : !validSymbol ? "종목코드를 입력하면 이름을 자동으로 채웁니다."
                  : stockName.key === stockKey ? stockName.message : "종목명 조회 중…"}
              </span>
            </label>
            <MoneyInput label="배정 자금" value={config.initialCash} market={config.market} className={inputClass}
              onChange={(initialCash) => setConfig((current) => ({ ...current, initialCash }))} />
            <RateInput label="매수 비용 여유율 (%)" value={config.feeBufferPct} increment={0.1} min={0} max={5}
              className={inputClass} onChange={(feeBufferPct) => setConfig((current) => ({ ...current, feeBufferPct }))} />
          </div>
          <div className="mt-6">
            <TrancheEditor key={config.market} rows={resolveTranches(config)} market={config.market} initialCash={config.initialCash}
              allowCountChange disabled={pending}
              onChange={(tranches) => setConfig((current) => ({ ...current, tranches, maxTranches: tranches.length,
                trancheBudget: tranches[0].budget, firstTakeProfitPct: tranches[0].takeProfitPct }))} />
            {budgetPreview.error && <p role="alert" className="mt-2 text-sm text-red-ink ">{budgetPreview.error}</p>}
          </div>
          <p className="my-3 text-xs text-muted">
            기존 보유가 없는 종목을 선택하세요. 배정 자금은 이 전략의 운용
            한도이며 계좌에서 별도로 예약되지는 않습니다. 비용 여유율은 수량
            계산에만 사용하고 손익은 실제 비용으로 정산합니다. 같은 계좌·종목을
            다른 자동매매와 함께 운용할 수 없습니다.
          </p>
          <button
            type="submit"
            className={buttonClass}
            disabled={pending || !config.accountSeq || Boolean(budgetPreview.error)}
          >
            실거래 전략 저장 · 주문 없음
          </button>
        </form>
      )}
      {mode === "detail" && data.strategies.length === 0 && (
        <p className="text-sm text-muted">
          실거래 전략이 없습니다. 모의 장부를 LIVE로 바꾸지 않고 새 장부로
          시작합니다.
        </p>
      )}
      {data.strategies.map((s) => {
        const money = (value: number | null) =>
          value === null
            ? "—"
            : `${s.market === "KR" ? "₩" : "$"}${number(value)}`;
        const progress = strategyProgress(s.maxTranches, s.lots);
        const recent = s.orders.map(o => {
          const lot = s.lots.find(l => l.id === o.lotId);
          return { id: o.id, side: o.side === "BUY" ? "BUY" as const : "SELL" as const,
            label: `${lot ? `${lot.slot}차 · ${lot.generation}회차` : "차수 확인 필요"} · ${states[o.status] ?? o.status}`,
            detail: `체결 ${o.filledQty}/${o.quantity}주 · ${o.filledQty ? `평균 체결가 ${money(o.filledAmount / o.filledQty)}` : `주문가 ${money(o.price)}`} · 주문 ${date(o.createdAt)}` };
        });
        return (
          <article
            key={s.id}
            className="min-w-0 rounded-lg border border-line bg-surface p-4 "
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold">{s.name}</h3>
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
                LIVE
              </span>
              <span className="text-xs text-muted">
                {s.symbol} · 계좌 {s.accountSeq} ·{" "}
                {states[s.status] ?? s.status}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">
              최대 {s.maxTranches}차 · 1차 예산 {money(s.tranches?.[0].budget ?? s.trancheBudget)} · {s.tranches ? "차수별 개별 설정" : budgetModeLabels[s.budgetMode as BudgetMode] ?? s.budgetMode}
              {!s.tranches && s.budgetMode !== "fixed" && ` ${number(s.budgetMultiplier)}배`} · 하락{" "}
              {s.tranches ? "차수별 설정 참조" : `${s.buyDropPct}% / 1차 익절 ${s.firstTakeProfitPct}% · 2차 이후 익절 ${s.takeProfitPct}%`} · 비용 여유{" "}
              {s.feeBufferPct}%
            </p>
            {s.reservation && <div className="mt-3 rounded-lg border border-line bg-surface-muted p-3 text-sm">
              <strong>예약 매수 · {reservationLabels[s.reservation.status] ?? s.reservation.status}</strong>
              <p className="mt-1 text-muted">감시 가격 {money(s.reservation.watchPrice)} 이하 · 유효일 {reservationDate(s.reservation.expiresAt)} 23:59:59 (한국시간)</p>
            </div>}
            <DetailTabs id={s.id} value={tab} onChange={setTab} />
            <p className="mt-3 text-xs text-muted">
              보유 {s.holdingQty}주 · 마지막 판단가 {money(s.lastPrice)} · 최근
              감시 {date(s.lastCheckedAt)} (한국 시간)
            </p>
            <p className="mt-2 break-words text-sm">
              {s.note ?? "시작 전 설정 확인"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {s.status === "paused" && (
                <button
                  className={buttonClass}
                  disabled={pending || data.disabled || !data.configured}
                  onClick={() => {
                    setArming(s.id);
                    setConfirmed(false);
                  }}
                >
                  자동매매 시작·재개
                </button>
              )}
              {["active", "reserved"].includes(s.status) && (
                <button
                  className={buttonClass}
                  disabled={pending}
                  onClick={() => execute(() => pauseSplitLive(s.id))}
                >
                  신규 주문 일시정지
                </button>
              )}
              <button
                className={buttonClass}
                disabled={pending || !data.configured}
                onClick={() => execute(() => syncSplitLive(s.id))}
              >
                주문 상태만 동기화
              </button>
              {s.status === "paused" && s.holdingQty === 0 && (
                <button
                  className={buttonClass}
                  disabled={pending}
                  onClick={() => execute(() => finishSplitLive(s.id))}
                >
                  보유 없는 전략 종료
                </button>
              )}
            </div>
            {arming === s.id && (
              <div className="mt-4 rounded border border-red-300 p-3 text-sm dark:border-red-900">
                <p>
                  <strong>
                    계좌 {s.accountSeq} / {s.symbol}
                  </strong>{" "}
                  · 배정 {money(s.initialCash)}, 1차 {money(s.tranches?.[0].budget ?? s.trancheBudget)}, 최대 {s.maxTranches}차,
                  {" "}{s.tranches ? "차수별 개별 설정" : budgetModeLabels[s.budgetMode as BudgetMode] ?? s.budgetMode}
                  {!s.tranches && s.budgetMode !== "fixed" && ` ${number(s.budgetMultiplier)}배`}
                   · {s.tranches ? "차수별 설정대로 매매" : `1차 익절 ${s.firstTakeProfitPct}%, 2차 이후 ${s.takeProfitPct}%`}. 시작 후 워커가 자동으로 실제 매수·매도 주문을 제출합니다. 첫
                  진입은 {s.reservation && s.reservation.status !== "executed" ? `${reservationDate(s.reservation.expiresAt)}까지 감시 가격 ${money(s.reservation.watchPrice)} 이하에 도달한 거래 가능 시간의 유효 시세입니다.` : "정규장 또는 국내 NXT 애프터마켓의 첫 유효 시세입니다."}
                  전량 익절 후에도 같은 설정으로 반복하며, 멈추려면 일시정지하세요.
                </p>
                <label className="my-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  계좌·종목·예산과 자동 실주문 실행을 확인했습니다.
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={buttonClass}
                    disabled={!confirmed || pending}
                    onClick={() =>
                      execute(() => startSplitLive(s.id, s.symbol))
                    }
                  >
                    확인한 계좌로 자동매매 시작
                  </button>
                  <button
                    className={buttonClass}
                    onClick={() => setArming(null)}
                  >
                    닫기
                  </button>
                </div>
              </div>
            )}
            {tab === "progress" && <div role="tabpanel" id={`${s.id}-progress-panel`} aria-labelledby={`${s.id}-progress-tab`}>
              <StrategyProgress progress={progress} money={money} recent={recent} recentNote="최근 주문 5건 · 시각은 주문 시각이며 수량·평균 체결가는 현재까지 반영된 누적 체결 기준입니다." onTrades={() => setTab("trades")}>
                <SplitPriceChart id={s.id} mode="live" version={s.orders.map(o => `${o.id}:${o.updatedAt}`).join(",")} market={s.market} maxTranches={s.maxTranches} />
              </StrategyProgress>
            </div>}
            <div hidden={tab !== "settings"} role="tabpanel" id={`${s.id}-settings-panel`} aria-labelledby={`${s.id}-settings-tab`}>
            {s.reservation && <ReservationEditor id={s.id} market={s.market} strategyStatus={s.status} reservation={s.reservation} />}
            <details open className="mt-3 rounded-xl border border-line p-3 ">
              <summary className="cursor-pointer text-sm font-medium">차수별 설정 {["active", "reserved", "paused"].includes(s.status) ? "수정" : "보기"}</summary>
              {["active", "reserved", "paused"].includes(s.status) ? <form className="mt-4 space-y-3" onSubmit={(event) => {
                event.preventDefault();
                const draft = trancheEdits[s.id] ?? resolveTranches(s);
                execute(async () => {
                  const result = await updateSplitTranches(s.id, draft);
                  if (result.ok) setTrancheEdits((current) => {
                    const next = { ...current }; delete next[s.id]; return next;
                  });
                  return result;
                });
              }}>
                <TrancheEditor rows={trancheEdits[s.id] ?? resolveTranches(s)} market={s.market} initialCash={s.initialCash} disabled={pending}
                  onChange={(rows) => setTrancheEdits((current) => ({ ...current, [s.id]: rows }))} />
                <button className={buttonClass} disabled={pending} type="submit">차수별 설정 저장</button>
                <p className="text-xs text-muted">실행 중에도 저장할 수 있습니다. 익절률은 보유 차수의 다음 매도 판단부터, 매수금액·하락률은 다음 매수 판단부터 적용합니다. 이미 제출한 주문의 가격·수량은 유지하며 미체결·미확정 주문이 정리된 뒤 새 조건으로 판단합니다. 일시정지 상태는 저장 후에도 유지됩니다.</p>
              </form> : <div className="mt-3 overflow-x-auto"><table className="w-full text-right text-sm tabular-nums">
                <thead><tr className="bg-surface-muted "><th className="p-2 text-left">차수</th><th className="p-2">매수 기준</th><th className="p-2">매수금액</th><th className="p-2">매도 기준</th></tr></thead>
                <tbody>{resolveTranches(s).map((row, index) => <tr key={index} className="border-b border-line ">
                  <td className="p-2 text-left">{index + 1}차</td><td className="p-2 text-blue-ink">{row.buyDropPct === null ? "최초 진입" : `−${row.buyDropPct}%`}</td><td className="p-2">{money(row.budget)}</td><td className="p-2 text-red-ink">+{row.takeProfitPct}%</td>
                </tr>)}</tbody>
              </table><p className="mt-2 text-xs text-muted">종료된 전략의 설정입니다.</p></div>}
            </details>
            </div>
            {tab === "ledger" && <div role="tabpanel" id={`${s.id}-ledger-panel`} aria-labelledby={`${s.id}-ledger-tab`} className="mt-4 space-y-4">
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  ["배정 잔액", s.cash],
                  ["누적 수익금", s.realizedPnl],
                  ["보유 평가액", s.marketValue],
                  ["총자산", s.equity],
                  ["총손익", s.totalPnl],
                  ["최초 배정", s.initialCash],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd
                    className={`mt-1 break-words ${label === "누적 수익금" ? "font-semibold text-blue-ink " : ""}`}
                  >
                    {money(value)}
                  </dd>
                </div>
              ))}
            </dl>
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap text-right text-xs">
                    <thead className="bg-surface-muted ">
                      <tr>
                        {[
                          "차수·회차",
                          "매수 수량",
                          "잔량",
                          "실제 평균 매수가",
                          "남은 원가(비용 포함)",
                          "익절 감시가",
                          "다음 차수 매수 기준",
                          "실현손익",
                        ].map((v) => (
                          <th key={v} className="p-2">
                            {v}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.lots.map((l) => (
                        <tr
                          key={l.id}
                          className="border-b border-line "
                        >
                          <td className="p-2">
                            {l.slot}차 · {l.generation}회
                          </td>
                          <td className="p-2">{l.boughtQty}</td>
                          <td className="p-2">{l.remainingQty}</td>
                          <td className="p-2">{money(l.buyPrice)}</td>
                          <td className="p-2">{money(l.remainingCost)}</td>
                          <td className="p-2">
                            {l.boughtQty
                              ? money(l.buyPrice * (1 + liveTakeProfitPct(s, l.slot) / 100))
                              : "대기"}
                          </td>
                          <td className="p-2">
                            {l.remainingQty && l.slot < s.maxTranches
                              ? money(l.buyPrice * (1 - liveBuyDropPct(s, l.slot + 1) / 100))
                              : "—"}
                          </td>
                          <td className="p-2">{money(l.realizedPnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </div>}
            {tab === "trades" && <div role="tabpanel" id={`${s.id}-trades-panel`} aria-labelledby={`${s.id}-trades-tab`} className="mt-4 space-y-4">
              <p className="text-xs text-muted">시각은 주문 시각입니다. 부분 체결은 주문별 누적 체결량으로 표시합니다.</p>
              {!s.orders.length && <p className="text-sm text-muted">아직 주문 기록이 없습니다.</p>}
                <h4 className="text-sm font-medium">최근 주문 20건</h4>
                {s.orders.map((o) => (
                  <div
                    className="min-w-0 rounded border border-line p-3 text-xs "
                    key={o.id}
                  >
                    <p>
                      {(() => { const lot = s.lots.find(l => l.id === o.lotId); return lot ? `${lot.slot}차 · ${lot.generation}회차 · ` : ""; })()}#{o.sequence} · {o.side === "BUY" ? "매수" : "매도"}{" "}
                      {o.quantity}주 · 지정가 {money(o.price)} ·{" "}
                      {states[o.status] ?? o.status}
                      {o.brokerStatus ? ` (${o.brokerStatus})` : ""}
                    </p>
                    <p className="mt-1">
                      실체결 {o.filledQty}주 / {money(o.filledAmount)} · 수수료{" "}
                      {money(o.commission)} · 세금 {money(o.tax)} · 주문 시각{" "}
                      {date(o.createdAt)}
                    </p>
                    <p className="mt-1 break-all">
                      주문번호 {o.tossOrderId ?? "미확인"}
                    </p>
                    {o.error && (
                      <p className="mt-2 break-words text-amber-700 dark:text-amber-300">
                        {o.error}
                      </p>
                    )}
                    {s.status === "paused" &&
                      ["submitting", "submit_unknown", "blocked"].includes(
                        o.status,
                      ) && (
                        <Recovery
                          orderId={o.id}
                          canMarkAbsent={!o.tossOrderId}
                          pending={pending}
                          execute={execute}
                        />
                      )}
                  </div>
                ))}
            </div>}
          </article>
        );
      })}
    </div>
  );
}

function Recovery({
  orderId,
  canMarkAbsent,
  pending,
  execute,
}: {
  orderId: string;
  canMarkAbsent: boolean;
  pending: boolean;
  execute: (task: () => Promise<{ ok: boolean; message: string }>) => void;
}) {
  const [brokerId, setBrokerId] = useState("");
  const [absent, setAbsent] = useState(false);
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3 ">
      <p>
        토스에서 주문을 대조한 뒤 복구하세요. 이 기능은 주문을 다시 보내지
        않습니다.
      </p>
      <label className="block">
        확인한 토스 주문번호
        <input
          className={`${inputClass} mt-1`}
          maxLength={256}
          value={brokerId}
          onChange={(event) => setBrokerId(event.target.value)}
        />
      </label>
      <button
        className={buttonClass}
        disabled={pending || !brokerId.trim()}
        onClick={() =>
          execute(() =>
            recoverSplitLive(orderId, { brokerId: brokerId.trim() }),
          )
        }
      >
        주문번호 검증·연결
      </button>
      {canMarkAbsent && (
        <>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={absent}
              onChange={(event) => setAbsent(event.target.checked)}
            />
            토스 주문·체결 이력에서 이 주문이 접수되지 않았음을 확인했습니다.
          </label>
          <button
            className={buttonClass}
            disabled={pending || !absent}
            onClick={() =>
              execute(() =>
                recoverSplitLive(orderId, { confirmNotCreated: true }),
              )
            }
          >
            미접수 확인 기록
          </button>
        </>
      )}
    </div>
  );
}
