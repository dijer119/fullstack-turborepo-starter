import { getBudgetSchedule, type BudgetSettings, type TrancheSetting } from "./budget";

type SettingsConfig = BudgetSettings & {
  market: string;
  maxTranches: number;
  trancheBudget: number;
  buyDropPct: number;
  takeProfitPct: number;
  firstTakeProfitPct?: number;
};

export function validateTranches(value: unknown, maxTranches: number, market: string): asserts value is TrancheSetting[] {
  if (!Number.isInteger(maxTranches) || maxTranches < 1 || maxTranches > 50 ||
      !Array.isArray(value) || value.length !== maxTranches)
    throw new Error("관리 차수와 차수별 설정 개수가 일치해야 합니다. (1~50차)");
  if (market !== "KR" && market !== "US") throw new Error("시장을 확인하세요.");
  const scale = market === "KR" ? 1 : 100;
  value.forEach((row, index) => {
    if (!row || typeof row !== "object" || !Number.isFinite(row.budget) || row.budget <= 0 || row.budget > 1e10 ||
        Math.round(row.budget * scale) / scale !== row.budget)
      throw new Error(`${index + 1}차 매수금액은 ${market === "KR" ? "1원" : "0.01달러"} 단위로 100억원 이하를 입력하세요.`);
    if (index === 0 ? row.buyDropPct !== null : !validRate(row.buyDropPct, 99.99))
      throw new Error(`${index + 1}차 매수 기준을 확인하세요. 2차부터 0.01~99.99%를 입력하세요.`);
    if (!validRate(row.takeProfitPct, 999.99))
      throw new Error(`${index + 1}차 익절률은 0.01~999.99%, 소수 둘째 자리까지 입력하세요.`);
  });
}

function validRate(value: number, max: number) {
  return Number.isFinite(value) && value >= 0.01 && value <= max && Math.round(value * 100) / 100 === value;
}

export function resolveTranches(config: SettingsConfig): TrancheSetting[] {
  if (config.tranches !== undefined) return config.tranches.map((row) => ({ ...row }));
  return getBudgetSchedule(config).budgets.map((budget, index) => ({
    budget,
    buyDropPct: index === 0 ? null : config.buyDropPct,
    takeProfitPct: index === 0 ? config.firstTakeProfitPct ?? 10 : config.takeProfitPct,
  }));
}

export function parseTranches(json: string | null, maxTranches: number, market: string): TrancheSetting[] | undefined {
  if (json === null) return undefined;
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error("저장된 차수별 설정을 읽을 수 없습니다."); }
  validateTranches(value, maxTranches, market);
  return value;
}
