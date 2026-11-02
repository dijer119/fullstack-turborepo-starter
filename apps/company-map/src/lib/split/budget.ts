export const budgetModeLabels = {
  fixed: "동일 금액",
  geometric: "누적 배수",
  linear: "일정 금액 증가",
} as const;

export type BudgetMode = keyof typeof budgetModeLabels;
export interface TrancheSetting {
  budget: number;
  buyDropPct: number | null;
  takeProfitPct: number;
}
export interface BudgetSettings {
  budgetMode?: string;
  budgetMultiplier?: number;
  tranches?: TrancheSetting[];
}
interface BudgetConfig extends BudgetSettings {
  market: string;
  trancheBudget: number;
}

const MAX_MONEY = 1e10;

export function getTrancheBudget(config: BudgetConfig, slot: number): number {
  if (config.tranches !== undefined) {
    const value = config.tranches[slot - 1]?.budget;
    if (!Number.isInteger(slot) || slot < 1 || slot > 50 || !Number.isFinite(value) || value < 0.01 || value > MAX_MONEY)
      throw new Error("차수별 매수금액을 확인하세요.");
    return value;
  }
  const mode = config.budgetMode === undefined ? "fixed" : config.budgetMode;
  const multiplier = config.budgetMultiplier === undefined ? 1 : config.budgetMultiplier;
  if (!["fixed", "geometric", "linear"].includes(mode))
    throw new Error("예산 방식을 선택하세요.");
  if (!Number.isFinite(multiplier) || multiplier < 1 ||
    !Number.isSafeInteger(Math.round(multiplier * 100)) ||
    Math.round(multiplier * 100) / 100 !== multiplier)
    throw new Error("예산 배수는 1 이상, 소수 둘째 자리까지 입력하세요.");
  if (!["KR", "US"].includes(config.market))
    throw new Error("시장을 확인하세요.");
  if (!Number.isInteger(slot) || slot < 1 || slot > 50)
    throw new Error("최대 차수는 1~50 사이의 정수로 입력하세요.");
  const base = config.trancheBudget;
  if (!Number.isFinite(base) || base < 0.01 || base > MAX_MONEY ||
    Math.round(base * 10000) / 10000 !== base)
    throw new Error("1차 예산은 0.01 이상, 100억원 이하의 소수 넷째 자리 금액이어야 합니다.");
  // Preserve existing fixed budgets, including legacy amounts with four decimals.
  if (mode === "fixed" || multiplier === 1) return base;

  // Integer ratios avoid losing a won/cent at floating-point floor boundaries.
  const baseUnits = BigInt(Math.round(base * 10000));
  const ratio = BigInt(Math.round(multiplier * 100));
  const exponent = BigInt(slot - 1);
  const numerator = mode === "geometric"
    ? baseUnits * ratio ** exponent
    : baseUnits * (100n + exponent * (ratio - 100n));
  const denominator = mode === "geometric" ? 100n ** exponent : 100n;
  const scale = config.market === "KR" ? 1 : 100;
  const units = numerator / (denominator * BigInt(10000 / scale));
  if (units <= 0n || units > BigInt(MAX_MONEY * scale))
    throw new Error("차수별 예산은 통화 최소 단위 이상, 100억원 이하여야 합니다.");
  return Number(units) / scale;
}

export function getBudgetSchedule(config: BudgetConfig & { maxTranches: number }) {
  if (!Number.isInteger(config.maxTranches) || config.maxTranches < 1 || config.maxTranches > 50)
    throw new Error("최대 차수는 1~50 사이의 정수로 입력하세요.");
  if (config.tranches !== undefined && (!Array.isArray(config.tranches) || config.tranches.length !== config.maxTranches))
    throw new Error("관리 차수와 차수별 설정 개수가 일치해야 합니다.");
  const budgets = Array.from({ length: config.maxTranches }, (_, i) => getTrancheBudget(config, i + 1));
  const units = budgets.reduce((sum, budget) => sum + BigInt(Math.round(budget * 10000)), 0n);
  if (units > BigInt(MAX_MONEY * 10000))
    throw new Error("전체 차수의 필요 자금이 100억원을 초과합니다.");
  return { budgets, total: Number(units) / 10000 };
}
