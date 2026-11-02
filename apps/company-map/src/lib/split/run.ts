import type {
  PrismaClient,
  SplitLot,
  SplitSimulation,
} from "@prisma-clients/company-map";
import {
  advanceSimulation,
  initialState,
  summarize,
  validateConfig,
  validatePrice,
  type SplitConfig,
  type SplitState,
} from "./engine";

export interface SimulationInput {
  requestKey: string;
  source: "manual" | "toss";
  prices: number[];
  observedAt?: string;
}

export function simulationView(row: SplitSimulation & { lots: SplitLot[] }) {
  const config: SplitConfig = {
    symbol: row.symbol,
    name: row.name,
    market: row.market as SplitConfig["market"],
    source: row.source as SplitConfig["source"],
    initialCash: row.initialCash,
    trancheBudget: row.trancheBudget,
    maxTranches: row.maxTranches,
    buyDropPct: row.buyDropPct,
    takeProfitPct: row.takeProfitPct,
    feePct: row.feePct,
    sellTaxPct: row.sellTaxPct,
  };
  const state: SplitState = {
    cash: row.cash,
    status: row.status as SplitState["status"],
    stepCount: row.stepCount,
    lastPrice: row.lastPrice,
    note: row.note,
    lots: row.lots.map(
      ({
        slot,
        generation,
        anchorPrice,
        buyPrice,
        quantity,
        remainingQty,
        buyCost,
        buyFee,
        sellPrice,
        sellFee,
        sellTax,
        realizedPnl,
        openedStep,
        closedStep,
      }) => ({
        slot,
        generation,
        anchorPrice,
        buyPrice,
        quantity,
        remainingQty,
        buyCost,
        buyFee,
        sellPrice,
        sellFee,
        sellTax,
        realizedPnl,
        openedStep,
        closedStep,
      }),
    ),
  };
  return {
    id: row.id,
    config,
    state,
    summary: summarize(config, state),
    dryRun: row.dryRun,
    lastObservedAt: row.lastObservedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function loadSimulation(db: PrismaClient, id: string) {
  return simulationView(
    await db.splitSimulation.findUniqueOrThrow({
      where: { id },
      include: { lots: { orderBy: [{ openedStep: "asc" }, { slot: "asc" }] } },
    }),
  );
}

export async function createSimulation(db: PrismaClient, config: SplitConfig) {
  const state = initialState(config);
  return db.splitSimulation.create({
    data: { ...config, cash: state.cash, dryRun: true },
  });
}

/** DB의 모의 체결만 저장한다. 이 실행기는 증권사 주문 기능을 갖지 않는다. */
export async function runSimulation(
  db: PrismaClient,
  id: string,
  input: SimulationInput,
) {
  if (
    typeof input.requestKey !== "string" ||
    !/^[A-Za-z0-9:._-]{1,120}$/.test(input.requestKey)
  )
    throw new Error("실행 요청 키가 올바르지 않습니다.");
  if (
    !Array.isArray(input.prices) ||
    input.prices.length < 1 ||
    input.prices.length > 200
  ) {
    throw new Error("가격 경로는 1~200개로 입력하세요.");
  }
  if (
    input.source === "toss" &&
    (input.prices.length !== 1 || !input.observedAt)
  )
    throw new Error("토스 시세 관측이 올바르지 않습니다.");
  const observedAt = input.observedAt ? new Date(input.observedAt) : new Date();
  if (!Number.isFinite(observedAt.getTime()))
    throw new Error("관측 시각이 올바르지 않습니다.");
  const inputJson = JSON.stringify({
    source: input.source,
    prices: input.prices,
    observedAt: input.observedAt ?? null,
  });

  return db.$transaction(
    async (tx) => {
      const existing = await tx.splitRun.findUnique({
        where: {
          simulationId_requestKey: {
            simulationId: id,
            requestKey: input.requestKey,
          },
        },
      });
      if (existing) {
        if (existing.inputJson !== inputJson)
          throw new Error(
            "같은 실행 요청 키에 다른 입력을 사용할 수 없습니다.",
          );
        return { duplicate: true, fillCount: existing.fillCount };
      }
      const row = await tx.splitSimulation.findUniqueOrThrow({
        where: { id },
        include: {
          lots: { orderBy: [{ openedStep: "asc" }, { slot: "asc" }] },
        },
      });
      if (!row.dryRun)
        throw new Error("모의 실행 전용입니다. 실거래는 지원하지 않습니다.");
      if (row.source !== input.source)
        throw new Error("전략의 가격 원천을 혼합할 수 없습니다.");
      if (row.status !== "active")
        throw new Error("실행 중인 모의 전략만 가격을 반영할 수 있습니다.");
      if (
        input.source === "toss" &&
        row.lastObservedAt &&
        observedAt <= row.lastObservedAt
      ) {
        throw new Error("이미 반영한 시세와 같거나 이전 관측입니다.");
      }
      const view = simulationView(row);
      validateConfig(view.config);
      for (const price of input.prices)
        validatePrice(price, view.config.market);
      let state = view.state;
      for (const price of input.prices)
        state = advanceSimulation(view.config, state, price);
      const fillsBefore =
        row.lots.length +
        row.lots.filter((lot) => lot.closedStep !== null).length;
      const fillsAfter =
        state.lots.length +
        state.lots.filter((lot) => lot.closedStep !== null).length;
      const fillCount = fillsAfter - fillsBefore;
      const claimed = await tx.splitSimulation.updateMany({
        where: { id, revision: row.revision, status: "active", dryRun: true },
        data: {
          cash: state.cash,
          status: state.status,
          stepCount: state.stepCount,
          lastPrice: state.lastPrice,
          note: state.note,
          lastObservedAt: observedAt,
          revision: { increment: 1 },
        },
      });
      if (claimed.count !== 1)
        throw new Error("동시 실행으로 장부가 변경됐습니다. 다시 시도하세요.");
      for (const lot of state.lots) {
        const old = view.state.lots.find(
          (item) =>
            item.slot === lot.slot && item.generation === lot.generation,
        );
        if (old && JSON.stringify(old) === JSON.stringify(lot)) continue;
        await tx.splitLot.upsert({
          where: {
            simulationId_slot_generation: {
              simulationId: id,
              slot: lot.slot,
              generation: lot.generation,
            },
          },
          create: { simulationId: id, ...lot },
          update: lot,
        });
      }
      await tx.splitRun.create({
        data: {
          simulationId: id,
          requestKey: input.requestKey,
          source: input.source,
          inputJson,
          fillCount,
          observedAt,
        },
      });
      return { duplicate: false, fillCount };
    },
    { timeout: 10000 },
  );
}
