import { roundMoney } from "./engine";

export interface ProfitEntry {
  market: string;
  realizedPnl: number;
}

export function sumRealizedProfits(entries: readonly ProfitEntry[]) {
  const totals = { KR: 0, US: 0 };
  for (const entry of entries) {
    if (entry.market === "KR") totals.KR += entry.realizedPnl;
    if (entry.market === "US") totals.US += entry.realizedPnl;
  }
  return { KR: roundMoney(totals.KR), US: roundMoney(totals.US) };
}
