"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  createSimulation,
  loadSimulation,
  runSimulation,
  simulationView,
} from "@/lib/split/run";
import { getTossObservation } from "@/lib/split/toss-source";
import type { SplitConfig } from "@/lib/split/engine";

const PAGE = "/stocks/split";
const reason = (error: unknown) =>
  error instanceof Error ? error.message : "모의 장부 처리에 실패했습니다.";

export async function listSplitSimulations(id?: string, includeRuns = true) {
  const rows = await db.splitSimulation.findMany({
    where: id === undefined ? undefined : { id },
    orderBy: { createdAt: "desc" },
    include: {
      lots: { orderBy: [{ openedStep: "asc" }, { slot: "asc" }] },
      runs: { orderBy: { createdAt: "desc" }, take: includeRuns ? 10 : 0 },
    },
  });
  return rows.map((row) => ({
    ...simulationView(row),
    runs: row.runs.map((run) => ({
      id: run.id,
      source: run.source,
      fillCount: run.fillCount,
      observedAt: run.observedAt.toISOString(),
      createdAt: run.createdAt.toISOString(),
      prices: (JSON.parse(run.inputJson) as { prices: number[] }).prices,
    })),
  }));
}

export async function createSplitSimulation(input: SplitConfig) {
  try {
    // 입력의 추가 필드(dryRun 등)를 DB로 전파하지 않는다.
    const config: SplitConfig = {
      symbol:
        typeof input.symbol === "string"
          ? input.symbol.trim().toUpperCase()
          : "",
      name:
        typeof input.name === "string" ? input.name.trim() || input.symbol : "",
      market: input.market,
      source: input.source,
      initialCash: input.initialCash,
      trancheBudget: input.trancheBudget,
      maxTranches: input.maxTranches,
      buyDropPct: input.buyDropPct,
      takeProfitPct: input.takeProfitPct,
      feePct: input.feePct,
      sellTaxPct: input.sellTaxPct,
    };
    const created = await createSimulation(db, config);
    revalidatePath(PAGE, "layout");
    return { ok: true as const, id: created.id };
  } catch (error) {
    return { ok: false as const, message: reason(error) };
  }
}

export async function runSplitManual(
  id: string,
  prices: number[],
  requestKey: string,
) {
  try {
    const result = await runSimulation(db, id, {
      source: "manual",
      prices,
      requestKey,
    });
    revalidatePath(PAGE, "layout");
    return {
      ok: true,
      message: result.duplicate
        ? "이미 반영한 실행입니다."
        : `모의 체결 ${result.fillCount}건 반영`,
    };
  } catch (error) {
    return { ok: false, message: reason(error) };
  }
}

export async function runSplitQuote(id: string) {
  try {
    const view = await loadSimulation(db, id);
    if (
      !view.dryRun ||
      view.config.source !== "toss" ||
      view.state.status !== "active"
    ) {
      throw new Error("실행 중인 토스 시세 모의 전략만 사용할 수 있습니다.");
    }
    const observation = await getTossObservation(view.config);
    const result = await runSimulation(db, id, observation);
    revalidatePath(PAGE, "layout");
    return {
      ok: true,
      message: result.duplicate
        ? "이미 반영한 토스 시세입니다."
        : `토스 시세로 모의 체결 ${result.fillCount}건 반영`,
    };
  } catch (error) {
    return { ok: false, message: reason(error) };
  }
}

export async function setSplitStatus(id: string, status: "active" | "paused") {
  try {
    if (status !== "active" && status !== "paused")
      throw new Error("실행 상태가 올바르지 않습니다.");
    const result = await db.splitSimulation.updateMany({
      where: { id, dryRun: true, status: { in: ["active", "paused"] } },
      data: { status, revision: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new Error(
        "종료된 모의 전략은 재개할 수 없습니다. 새 전략을 만드세요.",
      );
    revalidatePath(PAGE, "layout");
    return {
      ok: true,
      message:
        status === "paused"
          ? "모의 실행을 일시정지했습니다."
          : "모의 실행을 재개했습니다.",
    };
  } catch (error) {
    return { ok: false, message: reason(error) };
  }
}
