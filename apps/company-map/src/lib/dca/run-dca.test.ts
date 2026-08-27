// runDca 오케스트레이터 — 손으로 만든 인메모리 fake db로 "정산 → 잔액 차감" 사이클과
// LIVE 제출 경로를 검증한다. scripts/dca-smoke.ts는 두 실행이 같은 거래일이라
// settleDryOrders(tradeDate: { lt })에 구조적으로 닿지 못하므로, cashKrw가 줄어드는 유일한
// 경로는 여기서만 실행된다.
// LIVE 케이스의 dryRun: false는 이 프로세스 안의 평범한 객체 리터럴이다 — 실DB에 LIVE 계좌를
// 만들지 않고, deps는 전부 스텁이라 토스 클라이언트·createOrder에 닿지 않는다.
import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma-clients/company-map";
import { runDca, type DcaRunDeps } from "./run-dca";

type Row = Record<string, unknown>;

/** where 매칭 — runDca가 실제로 쓰는 형태(스칼라 일치, { lt }, { in }, OR)만 지원. */
function matches(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      if (!(cond as Row[]).some((w) => matches(row, w))) return false;
      continue;
    }
    if (cond !== null && typeof cond === "object") {
      const c = cond as { lt?: string; in?: unknown[] };
      if (c.lt !== undefined && !((row[key] as string) < c.lt)) return false;
      if (c.in !== undefined && !c.in.includes(row[key])) return false;
      continue;
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

/** update data 적용 — increment/decrement 연산자 객체를 반드시 해석한다(자금 쓰기가 이걸 쓴다). */
function applyData(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && typeof v === "object") {
      const op = v as { increment?: number; decrement?: number };
      if (typeof op.increment === "number") {
        row[k] = (row[k] as number) + op.increment;
        continue;
      }
      if (typeof op.decrement === "number") {
        row[k] = (row[k] as number) - op.decrement;
        continue;
      }
      throw new Error(`fake db: 지원하지 않는 update 연산 ${k}=${JSON.stringify(v)}`);
    }
    row[k] = v;
  }
}

const ORDER_DEFAULTS: Row = {
  filledQty: null,
  filledPrice: null,
  filledAt: null,
  tossOrderId: null,
  stateApplied: null,
  error: null,
};

function makeFakeDb(account: Row, seedOrders: Row[] = []) {
  const accounts: Row[] = [account];
  const orders: Row[] = seedOrders.map((o, i) => ({ ...ORDER_DEFAULTS, ...o, id: o.id ?? `s${i}` }));
  let seq = 0;

  const find = (id: unknown) => {
    const row = accounts.find((a) => a.id === id);
    if (!row) throw new Error(`fake db: 계좌 없음 ${String(id)}`);
    return row;
  };

  const db = {
    dcaAccount: {
      findUniqueOrThrow: async ({ where }: { where: Row }) => ({ ...find(where.id) }),
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = find(where.id);
        applyData(row, data);
        return { ...row };
      },
    },
    dcaOrder: {
      findMany: async ({ where, orderBy }: { where: Row; orderBy?: Row }) => {
        const rows = orders.filter((o) => matches(o, where)).map((o) => ({ ...o }));
        if (orderBy && (orderBy as { tradeDate?: string }).tradeDate === "asc") {
          rows.sort((a, b) => String(a.tradeDate).localeCompare(String(b.tradeDate)));
        }
        return rows;
      },
      count: async ({ where }: { where: Row }) => orders.filter((o) => matches(o, where)).length,
      create: async ({ data }: { data: Row }) => {
        const row: Row = { ...ORDER_DEFAULTS, ...data, id: `o${++seq}` };
        orders.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = orders.find((o) => o.id === where.id);
        if (!row) throw new Error(`fake db: 주문 없음 ${String(where.id)}`);
        applyData(row, data);
        return { ...row };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  return {
    db: db as unknown as PrismaClient,
    account: accounts[0],
    orders,
  };
}

const DAY_D = "2026-08-26";
const DAY_D1 = "2026-08-27";

function makeAccount(over: Row = {}): Row {
  return {
    id: "acc1",
    name: "테스트 계좌",
    baseSymbol: "QQQ",
    leverSymbol: "QLD",
    accountSeq: null,
    thresholdPct: 10,
    dailyAmountKrw: 50_000,
    premiumPct: 5,
    cashKrw: 800_000,
    peakPrice: 600,
    peakDate: "2026-06-01",
    startDate: DAY_D,
    status: "active",
    dryRun: true,
    note: null,
    lastRunDate: null,
    lastAccrualDate: null,
    ...over,
  };
}

/** 기본 시세: peak 600, D 전일종가 570(−5% → QQQ), 현재가 500, 환율 1400. */
function makeDeps(over: Partial<DcaRunDeps> = {}): DcaRunDeps {
  const notCalled = (name: string) => async () => {
    throw new Error(`deps.${name}가 호출되면 안 된다`);
  };
  return {
    getDefaultAccountSeq: notCalled("getDefaultAccountSeq"),
    getBuyingPowerUsd: notCalled("getBuyingPowerUsd"),
    getClosedOrders: notCalled("getClosedOrders"),
    submitOrder: notCalled("submitOrder"),
    getDailyCandle: async () => null,
    getPrevTradeClose: async () => ({ date: "2026-08-25", close: 570 }),
    getCurrentPrice: async () => 500,
    getUsdKrw: async () => 1400,
    ...over,
  } as DcaRunDeps;
}

// 1주 사이징: limit = round2(500 × 1.05) = 525, cashKrw 850,000 / 1400 / 525 = 1.15주 → 1주
const LIMIT = 525;
const FX = 1400;

describe("runDca — dryRun 정산·차감 사이클", () => {
  let fake: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    fake = makeFakeDb(makeAccount());
  });

  it("D일: 1주 살 잔액이면 LOC 지정가로 simulated 주문 1건", async () => {
    const r = await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    expect(r).toEqual({
      placed: 0,
      simulated: 1,
      symbol: "QQQ",
      drawdownPct: -5,
      accrued: true,
      blocked: null,
    });
    expect(fake.account.cashKrw).toBe(850_000); // 800,000 + 50,000 적립
    expect(fake.account.lastAccrualDate).toBe(DAY_D);
    expect(fake.account.lastRunDate).toBe(DAY_D);
    expect(fake.orders).toHaveLength(1);
    expect(fake.orders[0]).toMatchObject({
      tradeDate: DAY_D,
      symbol: "QQQ",
      status: "simulated",
      dryRun: true,
      price: LIMIT,
      quantity: 1,
      fxRate: FX,
      amountKrw: 735_000, // 525 × 1 × 1400
      stateApplied: null,
    });
  });

  it("D+1일: 종가가 지정가 이하면 체결 확정 → 체결가 × 수량 × 주문환율만큼 차감", async () => {
    await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    // D일 종가 510 (≤ 525) → 체결. D+1의 전일종가도 510이라 낙폭 −15% → QLD.
    const deps = makeDeps({
      getDailyCandle: async (symbol, date) =>
        symbol === "QQQ" && date === DAY_D ? { close: 510, high: 515 } : null,
      getPrevTradeClose: async () => ({ date: DAY_D, close: 510 }),
      getCurrentPrice: async (symbol) => (symbol === "QLD" ? 100 : 510),
    });
    const r = await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(fake.orders[0]).toMatchObject({
      status: "simulated_filled",
      filledQty: 1,
      filledPrice: 510,
      filledAt: DAY_D,
      stateApplied: true,
    });
    // 850,000 − (510 × 1 × 1400) + 50,000 = 186,000
    expect(fake.account.cashKrw).toBe(186_000);
    expect(fake.account.lastAccrualDate).toBe(DAY_D1);
    expect(r).toMatchObject({ symbol: "QLD", drawdownPct: -15, accrued: true, simulated: 1 });
    // 186,000 / 1400 / round2(100 × 1.05) = 1.26주 → 1주
    expect(fake.orders).toHaveLength(2);
    expect(fake.orders[1]).toMatchObject({
      tradeDate: DAY_D1,
      symbol: "QLD",
      status: "simulated",
      price: 105,
      quantity: 1,
    });
  });

  it("D+1일 재실행(lastRunDate만 초기화)은 적립·차감·주문을 반복하지 않는다", async () => {
    await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);
    const deps = makeDeps({
      getDailyCandle: async (symbol, date) =>
        symbol === "QQQ" && date === DAY_D ? { close: 510, high: 515 } : null,
      getPrevTradeClose: async () => ({ date: DAY_D, close: 510 }),
      getCurrentPrice: async (symbol) => (symbol === "QLD" ? 100 : 510),
    });
    await runDca(fake.db, deps, "acc1", DAY_D1, false);

    const cashBefore = fake.account.cashKrw;
    const ordersBefore = fake.orders.length;
    fake.account.lastRunDate = null; // 스모크 스크립트가 재현하는 "지금 실행" 재호출

    const r2 = await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(r2).toMatchObject({ accrued: false, simulated: 0, placed: 0, blocked: null });
    expect(fake.account.cashKrw).toBe(cashBefore);
    expect(fake.account.cashKrw).toBe(186_000);
    expect(fake.orders).toHaveLength(ordersBefore);
    expect(fake.orders.filter((o) => o.stateApplied === true)).toHaveLength(1);
  });

  it("D+1일: 종가가 지정가보다 높으면 expired — 잔액은 적립분만 늘어난다", async () => {
    await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    const deps = makeDeps({
      getDailyCandle: async () => ({ close: 530, high: 540 }), // 530 > 525 → 미체결
      getPrevTradeClose: async () => ({ date: DAY_D, close: 530 }),
      getCurrentPrice: async () => 530,
    });
    await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(fake.orders[0]).toMatchObject({
      status: "expired",
      filledQty: null,
      filledPrice: null,
      stateApplied: null,
    });
    expect(fake.account.cashKrw).toBe(900_000); // 850,000 + 50,000, 차감 없음
    // 900,000 / 1400 / round2(530 × 1.05) = 1.15주 → 1주 주문
    expect(fake.orders).toHaveLength(2);
    expect(fake.orders[1]).toMatchObject({
      tradeDate: DAY_D1,
      symbol: "QLD", // 530/600−1 = −11.7% → 임계 초과
      price: 556.5,
      quantity: 1,
    });
  });

  it("일봉을 못 받으면 판정을 미루고 다음 폴에 재시도한다 (차감·상태 변경 없음)", async () => {
    await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    const deps = makeDeps({
      getDailyCandle: async () => null,
      getPrevTradeClose: async () => ({ date: DAY_D, close: 520 }),
      getCurrentPrice: async () => 520,
    });
    await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(fake.orders[0]).toMatchObject({ status: "simulated", stateApplied: null });
    expect(fake.account.cashKrw).toBe(900_000); // 적립만
  });
});

describe("runDca — 가드", () => {
  it("1주 미만이면 주문 없이 적립만 하고 lastRunDate를 넘긴다", async () => {
    const fake = makeFakeDb(makeAccount({ cashKrw: 0, dailyAmountKrw: 10_000 }));
    const r = await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    expect(r).toMatchObject({ simulated: 0, placed: 0, accrued: true, blocked: null });
    expect(fake.account.cashKrw).toBe(10_000);
    expect(fake.account.lastRunDate).toBe(DAY_D);
    expect(fake.orders).toHaveLength(0);
  });

  it("killed면 적립·정산·주문 어느 것도 하지 않고 lastRunDate도 그대로", async () => {
    const fake = makeFakeDb(makeAccount());
    const r = await runDca(fake.db, makeDeps(), "acc1", DAY_D, true);

    expect(r.blocked).toBe("disabled");
    expect(fake.account.cashKrw).toBe(800_000);
    expect(fake.account.lastAccrualDate).toBeNull();
    expect(fake.account.lastRunDate).toBeNull();
    expect(fake.orders).toHaveLength(0);
  });

  it("전일 종가를 못 구하면 blocked + note, lastRunDate 미갱신 (적립은 유지)", async () => {
    const fake = makeFakeDb(makeAccount());
    const deps = makeDeps({ getPrevTradeClose: async () => null });
    const r = await runDca(fake.db, deps, "acc1", DAY_D, false);

    expect(r).toMatchObject({ blocked: "전일 종가 미확보 — 재시도 대기", accrued: true });
    expect(fake.account.note).toBe("전일 종가 미확보 — 재시도 대기");
    expect(fake.account.lastRunDate).toBeNull();
    expect(fake.account.cashKrw).toBe(850_000);
    expect(fake.orders).toHaveLength(0);
  });

  it("당일 주문이 이미 있으면 중복 주문을 만들지 않고 기존 note도 지우지 않는다", async () => {
    const fake = makeFakeDb(makeAccount());
    await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);
    // 직전 실행이 남긴 경고를 재현 — 이 경로가 이걸 지워버리면 화면에 신호가 남지 않는다.
    fake.account.note = "주문 제출 결과 미확인 — 토스 앱에서 확인";
    fake.account.lastRunDate = null;

    const r = await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    expect(r).toMatchObject({ simulated: 0, blocked: null });
    expect(fake.orders).toHaveLength(1);
    expect(fake.account.lastRunDate).toBe(DAY_D);
    expect(fake.account.note).toBe("주문 제출 결과 미확인 — 토스 앱에서 확인");
  });

  it("active가 아니면 아무것도 하지 않는다", async () => {
    const fake = makeFakeDb(makeAccount({ status: "paused" }));
    const r = await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    expect(r.blocked).toBe("not_active");
    expect(fake.account.cashKrw).toBe(800_000);
    expect(fake.orders).toHaveLength(0);
  });
});

/** 이전 거래일에 남아 있던 주문 행 시드용 (필드는 스키마와 같은 이름). */
function makeOrderRow(over: Row = {}): Row {
  return {
    accountId: "acc1",
    tradeDate: DAY_D,
    symbol: "QQQ",
    side: "BUY",
    kind: "loc_buy",
    orderType: "LIMIT",
    tif: "CLS",
    price: LIMIT,
    quantity: 1,
    amountKrw: 735_000,
    fxRate: FX,
    drawdownPct: -5,
    ...over,
  };
}

// LIVE 경로. 계좌의 dryRun: false는 이 프로세스 안의 객체 리터럴일 뿐이고, submitOrder를
// 포함한 모든 deps가 스텁이라 실제 브로커로 나가는 호출은 없다.
describe("runDca — LIVE 제출 경로", () => {
  it("주문 행을 제출 '전에' 만들고(뮤텍스), 같은 행을 submitted + tossOrderId로 갱신한다", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: false }));
    let atSubmit: Row[] | null = null;
    let submitArgs: unknown[] | null = null;
    const deps = makeDeps({
      getDefaultAccountSeq: async () => 42,
      getBuyingPowerUsd: async () => 1_000,
      submitOrder: async (accountSeq, o, symbol) => {
        // Fix 6(a)의 핵심 — 이 시점에 행이 이미 있어야 한다.
        atSubmit = fake.orders.map((r) => ({ ...r }));
        submitArgs = [accountSeq, o, symbol];
        return { tossOrderId: "T-1" };
      },
    });

    const r = await runDca(fake.db, deps, "acc1", DAY_D, false);

    // 제출 시점 스냅샷: 행 1개, submitting, tossOrderId 없음
    expect(atSubmit).toHaveLength(1);
    expect(atSubmit![0]).toMatchObject({
      status: "submitting",
      dryRun: false,
      tossOrderId: null,
      tradeDate: DAY_D,
      price: LIMIT,
      quantity: 1,
    });
    expect(submitArgs).toEqual([42, { price: LIMIT, quantity: 1 }, "QQQ"]);

    // 제출 후: 같은 행이 갱신되고 두 번째 행은 생기지 않는다
    expect(fake.orders).toHaveLength(1);
    expect(fake.orders[0].id).toBe(atSubmit![0].id);
    expect(fake.orders[0]).toMatchObject({
      status: "submitted",
      tossOrderId: "T-1",
      dryRun: false,
    });
    expect(r).toMatchObject({ placed: 1, simulated: 0, symbol: "QQQ", blocked: null });
    expect(fake.account.lastRunDate).toBe(DAY_D);
    expect(fake.account.note).toBeNull();
    expect(fake.account.cashKrw).toBe(850_000); // 적립만 — 체결 전이라 차감 없음
  });

  it("submitOrder가 throw하면 failed가 아니라 submit_unknown + 확인 요청 note", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: false }));
    const deps = makeDeps({
      getDefaultAccountSeq: async () => 42,
      getBuyingPowerUsd: async () => 1_000,
      submitOrder: async () => {
        throw new Error("The operation was aborted due to timeout");
      },
    });

    const r = await runDca(fake.db, deps, "acc1", DAY_D, false);

    expect(fake.orders).toHaveLength(1);
    expect(fake.orders[0]).toMatchObject({
      status: "submit_unknown",
      error: "The operation was aborted due to timeout",
      tossOrderId: null,
      dryRun: false,
    });
    expect(fake.account.note).toBe(
      "주문 제출 결과 미확인 — 토스 앱에서 체결 여부를 직접 확인하세요: The operation was aborted due to timeout",
    );
    // 재시도가 진짜 이중 매수를 만들므로 거래일은 소진시킨다
    expect(fake.account.lastRunDate).toBe(DAY_D);
    // 정산된 게 없으므로 잔액은 적립분만 (차감 없음)
    expect(fake.account.cashKrw).toBe(850_000);
    expect(r).toMatchObject({ placed: 0, simulated: 0, blocked: null });
  });

  it("예수금이 부족하면 주문 행조차 만들지 않고 보류 — 같은 거래일 재시도 가능", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: false }));
    // submitOrder는 makeDeps 기본값(호출되면 throw) 그대로 둔다.
    const deps = makeDeps({
      getDefaultAccountSeq: async () => 42,
      getBuyingPowerUsd: async () => 100, // 필요 $525
    });

    const r = await runDca(fake.db, deps, "acc1", DAY_D, false);

    expect(r.blocked).toBe("USD 예수금 부족: 필요 $525.00 / 보유 $100.00");
    expect(fake.orders).toHaveLength(0);
    expect(fake.account.lastRunDate).toBeNull(); // 다음 폴에서 재시도
    expect(fake.account.note).toBe(r.blocked);
    expect(fake.account.cashKrw).toBe(850_000); // 적립은 유지(lastAccrualDate 멱등)
  });

  it("예수금이 NaN이면 fail-closed — 제출하지 않고 '확인 불가'로 막는다", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: false }));
    const deps = makeDeps({
      getDefaultAccountSeq: async () => 42,
      getBuyingPowerUsd: async () => Number.NaN, // 응답 필드 누락·개편 상황
    });

    const r = await runDca(fake.db, deps, "acc1", DAY_D, false);

    expect(r.blocked).toBe("USD 예수금 부족: 필요 $525.00 / 보유 확인 불가");
    expect(fake.orders).toHaveLength(0);
    expect(fake.account.lastRunDate).toBeNull();
  });
});

// Fix 4 — 정산 대상은 계좌 모드가 아니라 주문 행의 dryRun으로 갈린다. 두 정산을 항상 돌리지
// 않으면 모드를 토글한 계좌의 기존 행이 어느 정산도 받지 못해 영구히 얼어붙는다.
describe("runDca — 모드 토글 후에도 남은 행이 정산된다", () => {
  it("LIVE 계좌에 남은 dryRun 시뮬레이션 행도 일봉으로 정산·차감된다", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: false }), [
      makeOrderRow({ id: "leftover", dryRun: true, status: "simulated" }),
    ]);
    // submitOrder·getBuyingPowerUsd는 기본 스텁(호출되면 throw) 그대로 — 차감 후 잔액이
    // 1주 미만이라 주문 단계에 가지 않는다는 것까지 같이 증명된다.
    const deps = makeDeps({
      getDailyCandle: async (symbol, date) =>
        symbol === "QQQ" && date === DAY_D ? { close: 510, high: 515 } : null,
      getPrevTradeClose: async () => ({ date: DAY_D, close: 510 }),
      getCurrentPrice: async () => 510,
    });

    const r = await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(fake.orders[0]).toMatchObject({
      status: "simulated_filled",
      filledQty: 1,
      filledPrice: 510,
      stateApplied: true,
    });
    // 800,000 − 510×1×1400 + 50,000 = 136,000 → 1주(≈ $535.5) 미만이라 주문 없음
    expect(fake.account.cashKrw).toBe(136_000);
    expect(fake.orders).toHaveLength(1);
    expect(r).toMatchObject({ placed: 0, simulated: 0, accrued: true, blocked: null });
    expect(fake.account.lastRunDate).toBe(DAY_D1);
  });

  it("dryRun 계좌에 남은 LIVE submitted 행도 토스 CLOSED 대조로 정산·차감된다", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: true }), [
      makeOrderRow({ id: "leftover", dryRun: false, status: "submitted", tossOrderId: "T-9" }),
    ]);
    const deps = makeDeps({
      getDefaultAccountSeq: async () => 42,
      getClosedOrders: async () => [
        { orderId: "T-9", filledQuantity: 1, averageFilledPrice: 500 },
      ],
      getDailyCandle: async () => null,
      getPrevTradeClose: async () => ({ date: DAY_D, close: 510 }),
      getCurrentPrice: async () => 510,
    });

    const r = await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(fake.orders[0]).toMatchObject({
      status: "filled",
      filledQty: 1,
      filledPrice: 500,
      stateApplied: true,
    });
    // 800,000 − 500×1×1400 + 50,000 = 150,000 → 1주 미만이라 주문 없음
    expect(fake.account.cashKrw).toBe(150_000);
    expect(fake.orders).toHaveLength(1);
    expect(r).toMatchObject({ simulated: 0, accrued: true, blocked: null });
  });
});
