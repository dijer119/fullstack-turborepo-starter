"use server";

import { simulationView } from "@/lib/split/run";
import { db } from "@/lib/db";
import { koreanDate, liveProfitEntries, simulationProfitEntries } from "@/lib/split/performance";

export async function getSplitPerformance() {
  const [live, simulations] = await Promise.all([
    db.splitLiveStrategy.findMany({
      orderBy: { name: "asc" },
      include: { lots: { include: { orders: { where: { side: "SELL" }, orderBy: { sequence: "asc" } } } } },
    }),
    db.splitSimulation.findMany({
      orderBy: { name: "asc" },
      include: { lots: true, runs: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    }),
  ]);
  const strategies = [
    ...live.map(s => ({ id: s.id, name: s.name, symbol: s.symbol, market: s.market, mode: "live" as const, label: `${s.name} · ${s.symbol} · 계좌 ${s.accountSeq}` })),
    ...simulations.map(s => ({ id: s.id, name: s.name, symbol: s.symbol, market: s.market, mode: "simulation" as const, label: `${s.name} · ${s.symbol} · ${s.source === "manual" ? "가격 경로" : "토스 시세"}` })),
  ];
  return {
    today: koreanDate(new Date()),
    strategies,
    records: [
      ...liveProfitEntries(live.flatMap(strategy => strategy.lots.map(lot => ({ ...lot, strategy })))),
      ...simulationProfitEntries(simulations.map(s => ({ ...s, config: simulationView(s).config }))),
    ],
  };
}
