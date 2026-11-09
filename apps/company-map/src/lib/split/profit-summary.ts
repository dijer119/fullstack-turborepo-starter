import { roundMoney } from "./engine";

export interface ProfitEntry {
  market: string;
  realizedPnl: number;
}

export interface LiveHolding extends ProfitEntry {
  lots: readonly { remainingCost: number }[];
}

export function summarizeHoldings(entries: readonly LiveHolding[], market: "KR" | "US") {
  let cost = 0;
  for (const entry of entries) {
    if (entry.market !== market) continue;
    for (const lot of entry.lots) cost += lot.remainingCost;
  }
  cost = roundMoney(cost);
  const realizedPnl = sumRealizedProfits(entries)[market];
  const returnPct = cost > 0 ? (realizedPnl / cost) * 100 : null;
  return { cost, returnPct };
}

export function sumRealizedProfits(entries: readonly ProfitEntry[]) {
  const totals = { KR: 0, US: 0 };
  for (const entry of entries) {
    if (entry.market === "KR") totals.KR += entry.realizedPnl;
    if (entry.market === "US") totals.US += entry.realizedPnl;
  }
  return { KR: roundMoney(totals.KR), US: roundMoney(totals.US) };
}
