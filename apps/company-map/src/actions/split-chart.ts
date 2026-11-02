"use server";

import { db } from "@/lib/db";
import { liveChart, simulationChart } from "@/lib/split/chart";

export async function getSplitChart(id: string, mode: "live" | "simulation") {
  if (mode === "simulation") {
    const row = await db.splitSimulation.findUniqueOrThrow({ where: { id }, include: { lots: true } });
    return simulationChart(row.lots);
  }
  if (mode !== "live") throw new Error("장부 구분을 확인하세요.");
  const row = await db.splitLiveStrategy.findUniqueOrThrow({ where: { id }, include: { orders: { where: { filledQty: { gt: 0 } }, orderBy: { sequence: "asc" }, include: { lot: { select: { slot: true, generation: true } } } } } });
  return liveChart(row.orders);
}
