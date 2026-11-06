import type { TrancheCell } from "./strategy-tranches";

interface SearchableStrategy {
  name: string;
  symbol: string;
  market: string;
  status: string;
  accountLabel: string;
}

export interface StrategyListRow extends SearchableStrategy {
  id: string;
  holdingQty: number;
  sellCount: number;
  realizedPnl: number;
  totalPnl: number | null;
  lastPrice: number | null;
  lastCheckedAt: string | null;
  note: string | null;
  cells: TrancheCell[];
  profitPct: number | null;
  pendingCount: number;
}

export function monitoringWarning(row: Pick<StrategyListRow, "status" | "lastCheckedAt">, asOf: number): string | null {
  if (!["active", "reserved"].includes(row.status)) return null;
  const checkedAt = row.lastCheckedAt ? Date.parse(row.lastCheckedAt) : NaN;
  if (!Number.isFinite(checkedAt)) return "감시 실행 기록 없음";
  return asOf - checkedAt >= 90_000 ? "감시 지연 · 90초 이상" : null;
}

export function filterStrategyRows<T extends SearchableStrategy>(rows: T[], query: string, market: string, status: string): T[] {
  const term = query.trim().toLocaleLowerCase();
  return rows.filter(row => (market === "ALL" || row.market === market) &&
    (status === "ALL" || row.status === status) &&
    (!term || `${row.name} ${row.symbol} ${row.accountLabel}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" }) ||
      a.symbol.localeCompare(b.symbol) || a.accountLabel.localeCompare(b.accountLabel, "ko", { numeric: true }));
}

