"use client";

import { useState } from "react";
import { budgetModeLabels, getBudgetSchedule, type BudgetMode, type TrancheSetting } from "@/lib/split/budget";
import { validateTranches } from "@/lib/split/tranche-settings";
import { MoneyInput } from "./MoneyInput";
import { RateInput } from "./RateInput";

const inputClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100   dark:focus:ring-blue-900";
const buttonClass = "rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-surface-inset disabled:opacity-40   ";

export function TrancheEditor({ rows, market, initialCash, onChange, allowCountChange = false, disabled = false }: {
  rows: TrancheSetting[];
  market: string;
  initialCash: number;
  onChange: (rows: TrancheSetting[]) => void;
  allowCountChange?: boolean;
  disabled?: boolean;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState({ budget: rows[0]?.budget ?? 100000, buyDropPct: rows[1]?.buyDropPct ?? 10, takeProfitPct: rows[1]?.takeProfitPct ?? 10, mode: "fixed" as BudgetMode, multiplier: 2 });
  const [bulkError, setBulkError] = useState("");
  const money = (n: number) => `${Number.isFinite(n) ? n.toLocaleString("ko-KR", { maximumFractionDigits: market === "KR" ? 0 : 2 }) : "—"}${market === "KR" ? "원" : "달러"}`;
  const total = rows.reduce((sum, row) => sum + Math.round(row.budget * 100), 0) / 100;
  const error = (() => {
    try { validateTranches(rows, rows.length, market); }
    catch (error) { return error instanceof Error ? error.message : "차수별 설정을 확인하세요."; }
    return total > initialCash ? `배정 자금이 ${money(Math.round((total - initialCash) * 100) / 100)} 부족합니다.` : "";
  })();
  const patch = (index: number, update: Partial<TrancheSetting>) => onChange(rows.map((row, i) => i === index ? { ...row, ...update } : row));
  const resize = (count: number) => {
    if (!Number.isInteger(count) || count < 1 || count > 50) return;
    onChange(Array.from({ length: count }, (_, i) => rows[i] ?? { ...rows.at(-1)!, buyDropPct: bulk.buyDropPct }));
  };
  const applyBulk = () => {
    try {
      const budgets = getBudgetSchedule({ market, maxTranches: rows.length, trancheBudget: bulk.budget, budgetMode: bulk.mode, budgetMultiplier: bulk.mode === "fixed" ? 1 : bulk.multiplier }).budgets;
      const next = budgets.map((budget, i) => ({ budget, buyDropPct: i === 0 ? null : bulk.buyDropPct, takeProfitPct: i === 0 ? rows[0].takeProfitPct : bulk.takeProfitPct }));
      validateTranches(next, next.length, market);
      onChange(next);
      setBulkError("");
      setBulkOpen(false);
    } catch (error) { setBulkError(error instanceof Error ? error.message : "일괄 설정을 확인하세요."); }
  };
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 disabled:opacity-60">
      <legend className="mb-3 text-base font-semibold">자동매매 차수별 전략</legend>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-inset px-4 py-3 ">
        <span className="text-sm font-medium">관리 차수</span>
        <div className="flex items-center gap-3">
          {allowCountChange && <button type="button" aria-label="관리 차수 줄이기" className={buttonClass} disabled={rows.length <= 1} onClick={() => resize(rows.length - 1)}>−</button>}
          {allowCountChange ? <label className="flex items-center gap-1 font-semibold"><input aria-label="관리 차수" className="w-16 rounded border border-line bg-surface py-1 text-center text-lg tabular-nums  " type="number" min={1} max={50} step={1} value={rows.length} onChange={e => resize(Number(e.target.value))} onWheel={e => e.currentTarget.blur()} />차</label> : <span className="text-lg font-semibold tabular-nums">{rows.length}차</span>}
          {allowCountChange && <button type="button" aria-label="관리 차수 늘리기" className={buttonClass} disabled={rows.length >= 50} onClick={() => resize(rows.length + 1)}>+</button>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">매수 기준은 바로 앞 차수의 매수가 대비 하락률입니다.</p>
        <button type="button" className={buttonClass} aria-expanded={bulkOpen} onClick={() => setBulkOpen(!bulkOpen)}>일괄 적용 {bulkOpen ? "닫기" : "설정"}</button>
      </div>
      {bulkOpen && <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MoneyInput label="일괄 1차 매수금액" value={bulk.budget} market={market} className={inputClass} onChange={budget => setBulk({ ...bulk, budget })} />
          <label className="text-sm">금액 적용 방식<select className={inputClass} value={bulk.mode} onChange={e => setBulk({ ...bulk, mode: e.target.value as BudgetMode })}>{Object.entries(budgetModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {bulk.mode !== "fixed" && <RateInput label="예산 배수 (2차 ÷ 1차)" value={bulk.multiplier} increment={0.1} min={1} max={100} unit="배" className={inputClass} onChange={multiplier => setBulk({ ...bulk, multiplier })} />}
          <RateInput label="2차 이후 매수 하락률 (%)" value={bulk.buyDropPct} increment={0.5} min={0.01} max={99.99} className={inputClass} onChange={buyDropPct => setBulk({ ...bulk, buyDropPct })} />
          <RateInput label="2차 이후 익절률 (%)" value={bulk.takeProfitPct} increment={0.5} min={0.01} max={999.99} className={inputClass} onChange={takeProfitPct => setBulk({ ...bulk, takeProfitPct })} />
        </div>
        <p className="text-xs text-muted">적용하면 모든 차수의 매수금액과 2차 이후 비율을 덮어씁니다. 1차 익절률은 유지합니다. 적용 후 각 행에서 다시 수정할 수 있습니다.</p>
        {bulkError && <p role="alert" className="text-sm text-red-ink ">{bulkError}</p>}
        <button type="button" className={buttonClass} onClick={applyBulk}>입력한 값으로 일괄 적용</button>
      </div>}
      <div className="space-y-2">
        {rows.map((row, index) => <div key={index} className="grid min-w-0 grid-cols-2 items-start gap-3 rounded-xl bg-surface-muted p-4 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] " aria-label={`${index + 1}차 설정`}>
          <div className="col-span-2 font-semibold text-muted sm:col-span-1 sm:pt-7 ">{index + 1}차</div>
          <div className="min-w-0 text-blue-ink ">
            {index === 0 ? <div className="pt-1 text-sm"><span className="block text-xs text-muted">매수 기준</span><span className="mt-3 block font-medium">최초 진입</span></div> : <RateInput label={`${index + 1}차 매수 하락률 (%)`} value={row.buyDropPct ?? 0} increment={0.5} min={0.01} max={99.99} className={inputClass} onChange={buyDropPct => patch(index, { buyDropPct })} />}
          </div>
          <div className="col-span-2 min-w-0 sm:col-span-1 max-sm:order-last"><MoneyInput label={`${index + 1}차 매수금액`} market={market} value={row.budget} className={inputClass} onChange={budget => patch(index, { budget })} /></div>
          <div className="min-w-0 text-red-ink "><RateInput label={`${index + 1}차 익절률 (%)`} value={row.takeProfitPct} increment={0.5} min={0.01} max={999.99} className={inputClass} onChange={takeProfitPct => patch(index, { takeProfitPct })} /></div>
        </div>)}
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-sm "><span>총 필요 자금 <strong>{money(total)}</strong></span><span className="text-muted">배정 자금 {money(initialCash)}</span></div>
      <p className="text-xs text-muted">매수금액에는 비용 여유액이 포함됩니다. 실제 수량은 정수주로 계산하며 사용 가능한 잔액 내에서 주문합니다. 전량 익절 후에도 같은 차수 설정으로 반복합니다.</p>
      {error && <p role="alert" className="text-sm text-red-ink ">{error}</p>}
    </fieldset>
  );
}
