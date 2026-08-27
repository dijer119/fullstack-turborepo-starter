// runDca 오케스트레이터 — 손으로 만든 인메모리 fake db로 "즉시 체결 → 잔액 차감" 사이클과
// LIVE 제출 경로를 검증한다. 금액 기반 주문은 시장가라 dryRun이 같은 실행 안에서 체결되므로,
// cashKrw가 줄어드는 경로 전체가 한 번의 runDca 호출 안에 들어 있다.
// LIVE 케이스의 dryRun: false는 이 프로세스 안의 평범한 객체 리터럴이다 — 실DB에 LIVE 계좌를
// 만들지 않고, deps는 전부 스텁이라 토스 클라이언트·createOrder에 닿지 않는다.
import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma-clients/company-map";
import { makeClientOrderId, runDca, type DcaRunDeps } from "./run-dca";

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
  clientOrderId: null,
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

// 기준 시나리오: 적립 50,000원 / 환율 1379.1 / 시세 715.87 / peak 750(낙폭 −4.55% → QQQ)
const FX = 1379.1;
const PRICE = 715.87;
const DAILY = 50_000;
const DRAWDOWN = -4.55;

// D일 사이징: floor(50,000 / 1379.1 × 100) / 100 = $36.25 (= 49,992원),
//            예상 수량 round(36.25 / 715.87 × 1e6) / 1e6 = 0.050638주
const D_AMOUNT_USD = 36.25;
const D_AMOUNT_KRW = 49_992;
const D_QTY = 0.050638;
// 차감의 권위는 state.ts의 applyFills: round(50,000 − 715.87 × 0.050638 × 1379.1) = 7원
const D_CASH_AFTER = 7;

// D+1일: 잔액 7 + 적립 50,000 = 50,007 → $36.26 / 0.050652주 → 잔액 0원
const D1_AMOUNT_USD = 36.26;
const D1_QTY = 0.050652;
const D1_CASH_AFTER = 0;

function makeAccount(over: Row = {}): Row {
  return {
    id: "acc1",
    name: "테스트 계좌",
    baseSymbol: "QQQ",
    leverSymbol: "QLD",
    accountSeq: null,
    thresholdPct: 10,
    dailyAmountKrw: DAILY,
    cashKrw: 0,
    peakPrice: 750,
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

function makeDeps(over: Partial<DcaRunDeps> = {}): DcaRunDeps {
  const notCalled = (name: string) => async () => {
    throw new Error(`deps.${name}가 호출되면 안 된다`);
  };
  return {
    getDefaultAccountSeq: notCalled("getDefaultAccountSeq"),
    getBuyingPowerUsd: notCalled("getBuyingPowerUsd"),
    getClosedOrders: notCalled("getClosedOrders"),
    submitOrder: notCalled("submitOrder"),
    isAmountOrderWindowOpen: async () => true,
    getPrevTradeClose: async () => ({ date: "2026-08-25", close: PRICE }),
    getCurrentPrice: async () => PRICE,
    getUsdKrw: async () => FX,
    ...over,
  } as DcaRunDeps;
}

describe("runDca — dryRun 즉시 체결·차감 사이클", () => {
  let fake: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    fake = makeFakeDb(makeAccount());
  });

  it("D일: 시장가 주문 1건이 그 자리에서 simulated_filled로 기록되고 잔액이 차감된다", async () => {
    const r = await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    expect(r).toEqual({
      placed: 0,
      simulated: 1,
      symbol: "QQQ",
      drawdownPct: DRAWDOWN,
      accrued: true,
      blocked: null,
      noOrderReason: null, // 주문이 났으므로 사유 없음
    });
    expect(fake.orders).toHaveLength(1);
    expect(fake.orders[0]).toMatchObject({
      tradeDate: DAY_D,
      symbol: "QQQ",
      status: "simulated_filled",
      dryRun: true,
      orderType: "MARKET",
      tif: null,
      clientOrderId: null,
      amountUsd: D_AMOUNT_USD,
      amountKrw: D_AMOUNT_KRW,
      fxRate: FX,
      price: PRICE,
      quantity: D_QTY,
      filledQty: D_QTY,
      filledPrice: PRICE,
      filledAt: DAY_D,
      stateApplied: true, // 같은 실행 안에서 차감까지 끝났다
    });
    // 적립 50,000 − round(715.87 × 0.050638 × 1379.1) = 7
    expect(fake.account.cashKrw).toBe(D_CASH_AFTER);
    expect(fake.account.lastAccrualDate).toBe(DAY_D);
    expect(fake.account.lastRunDate).toBe(DAY_D);
    expect(fake.account.note).toBeNull();
  });

  it("같은 거래일 재실행(lastRunDate만 초기화)은 적립·주문·차감을 반복하지 않는다", async () => {
    await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    fake.account.lastRunDate = null; // "지금 실행"이 lastRunDate 가드를 우회하는 상황
    const r2 = await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    expect(r2).toMatchObject({
      accrued: false,
      simulated: 0,
      placed: 0,
      blocked: null,
      noOrderReason: "already_ordered",
    });
    expect(fake.orders).toHaveLength(1);
    expect(fake.account.cashKrw).toBe(D_CASH_AFTER);
    expect(fake.account.lastRunDate).toBe(DAY_D);
    expect(fake.orders.filter((o) => o.stateApplied === true)).toHaveLength(1);
  });

  it("연속 2거래일: 각 날 체결되고 적립·차감이 두 번씩 일어난다", async () => {
    await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);
    expect(fake.account.cashKrw).toBe(D_CASH_AFTER);

    const r = await runDca(fake.db, makeDeps(), "acc1", DAY_D1, false);

    expect(r).toMatchObject({ simulated: 1, placed: 0, accrued: true, blocked: null });
    expect(fake.orders).toHaveLength(2);
    expect(fake.orders[1]).toMatchObject({
      tradeDate: DAY_D1,
      status: "simulated_filled",
      amountUsd: D1_AMOUNT_USD,
      filledQty: D1_QTY,
      filledPrice: PRICE,
      filledAt: DAY_D1,
      stateApplied: true,
    });
    // 7 + 50,000 − round(715.87 × 0.050652 × 1379.1) = 0
    expect(fake.account.cashKrw).toBe(D1_CASH_AFTER);
    expect(fake.account.lastAccrualDate).toBe(DAY_D1);
    expect(fake.account.lastRunDate).toBe(DAY_D1);
  });

  it("낙폭이 임계 이상이면 레버리지 종목으로 체결된다", async () => {
    const lev = makeFakeDb(makeAccount({ peakPrice: 800 })); // 715.87/800 − 1 = −10.52%
    const r = await runDca(lev.db, makeDeps(), "acc1", DAY_D, false);

    expect(r).toMatchObject({ symbol: "QLD", drawdownPct: -10.52, simulated: 1 });
    expect(lev.orders[0]).toMatchObject({ symbol: "QLD", status: "simulated_filled" });
  });
});

describe("runDca — 가드", () => {
  it("주문 접수 창이 닫혔으면 주문 없이 적립만 하고 거래일을 소진한다", async () => {
    const fake = makeFakeDb(makeAccount());
    const deps = makeDeps({ isAmountOrderWindowOpen: async () => false });

    const r = await runDca(fake.db, deps, "acc1", DAY_D, false);

    expect(r).toMatchObject({
      simulated: 0,
      placed: 0,
      symbol: "QQQ",
      accrued: true,
      blocked: null,
      // 잔액 1센트 미만과 API 표면에서 구분된다
      noOrderReason: "window_closed",
    });
    expect(fake.orders).toHaveLength(0);
    expect(fake.account.cashKrw).toBe(DAILY); // 적립은 반영, 차감은 없음
    expect(fake.account.lastAccrualDate).toBe(DAY_D);
    // 그날은 창이 다시 열리지 않으므로 재시도가 무의미하다
    expect(fake.account.lastRunDate).toBe(DAY_D);
    expect(fake.account.note).toBe(
      "금액 기반 주문 접수 시간(정규장 종료 1시간 전) 경과 — 적립만 반영",
    );
  });

  it("주문 창 '확인 실패'는 '닫힘'과 달리 거래일을 소진하지 않는다", async () => {
    const fake = makeFakeDb(makeAccount());
    const deps = makeDeps({
      isAmountOrderWindowOpen: async () => {
        throw new Error("The operation was aborted due to timeout");
      },
    });

    const r = await runDca(fake.db, deps, "acc1", DAY_D, false);

    expect(r).toMatchObject({
      blocked: "주문 접수 창 확인 실패 — 재시도 대기: The operation was aborted due to timeout",
      accrued: true,
      simulated: 0,
      placed: 0,
      noOrderReason: null, // 정상 종료가 아니라 보류다
    });
    expect(fake.orders).toHaveLength(0); // 모르면 주문하지 않는다(fail-closed)
    expect(fake.account.cashKrw).toBe(DAILY); // 적립은 유지
    // 핵심 — 소진시키면 조회 실패 한 번이 그날 매수를 통째로 날린다
    expect(fake.account.lastRunDate).toBeNull();
    expect(fake.account.note).toBe(r.blocked);
  });

  it("환산액이 1센트 미만이면 주문 없이 적립만 하고 lastRunDate를 넘긴다", async () => {
    // 10원 / 1379.1 = $0.0072 → 절삭하면 $0.00
    const fake = makeFakeDb(makeAccount({ dailyAmountKrw: 10 }));
    const r = await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    expect(r).toMatchObject({
      simulated: 0,
      placed: 0,
      accrued: true,
      blocked: null,
      noOrderReason: "below_min_amount",
    });
    expect(fake.account.cashKrw).toBe(10);
    expect(fake.account.lastRunDate).toBe(DAY_D);
    expect(fake.account.note).toBeNull();
    expect(fake.orders).toHaveLength(0);
  });

  it("killed면 적립·정산·주문 어느 것도 하지 않고 lastRunDate도 그대로", async () => {
    const fake = makeFakeDb(makeAccount({ cashKrw: 800_000 }));
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
    expect(fake.account.cashKrw).toBe(DAILY);
    expect(fake.orders).toHaveLength(0);
  });

  it("당일 주문이 이미 있으면 중복 주문을 만들지 않고 기존 note도 지우지 않는다", async () => {
    const fake = makeFakeDb(makeAccount());
    await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);
    // 직전 실행이 남긴 경고를 재현 — 이 경로가 이걸 지워버리면 화면에 신호가 남지 않는다.
    fake.account.note = "주문 제출 결과 미확인 — 토스 앱에서 확인";
    fake.account.lastRunDate = null;

    const r = await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    expect(r).toMatchObject({ simulated: 0, blocked: null, noOrderReason: "already_ordered" });
    expect(fake.orders).toHaveLength(1);
    expect(fake.account.lastRunDate).toBe(DAY_D);
    expect(fake.account.note).toBe("주문 제출 결과 미확인 — 토스 앱에서 확인");
  });

  it("active가 아니면 아무것도 하지 않는다", async () => {
    const fake = makeFakeDb(makeAccount({ status: "paused", cashKrw: 800_000 }));
    const r = await runDca(fake.db, makeDeps(), "acc1", DAY_D, false);

    expect(r.blocked).toBe("not_active");
    expect(fake.account.cashKrw).toBe(800_000);
    expect(fake.orders).toHaveLength(0);
  });
});

describe("makeClientOrderId", () => {
  it("하이픈 걷어낸 계좌 앞 16자 + 하이픈 없는 거래일로 만든다", () => {
    expect(makeClientOrderId("a1b2c3d4-e5f6-7890-abcd-ef1234567890", "2026-08-28")).toBe(
      "dca-a1b2c3d4e5f67890-20260828",
    );
  });

  it("앞 8자가 같은 두 계좌도 서로 다른 키를 받는다 (충돌 시 남의 주문이 돌아온다)", () => {
    const a = makeClientOrderId("a1b2c3d4-0000-0000-0000-000000000001", "2026-08-28");
    const b = makeClientOrderId("a1b2c3d4-9999-9999-9999-999999999999", "2026-08-28");
    expect(a).not.toBe(b);
  });

  it("같은 계좌·같은 거래일이면 항상 같은 값 (토스 10분 멱등성 창의 전제)", () => {
    const a = makeClientOrderId("acc1", DAY_D);
    const b = makeClientOrderId("acc1", DAY_D);
    expect(a).toBe(b);
    expect(makeClientOrderId("acc1", DAY_D1)).not.toBe(a);
    expect(makeClientOrderId("acc2", DAY_D)).not.toBe(a);
  });

  it("토스 제약(36자 이하, 영숫자·하이픈·언더스코어)을 만족한다", () => {
    const id = makeClientOrderId("a1b2c3d4-e5f6-7890-abcd-ef1234567890", "2026-08-28");
    expect(id).toHaveLength(29);
    expect(id.length).toBeLessThanOrEqual(36);
    expect(id).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});

// LIVE 경로. 계좌의 dryRun: false는 이 프로세스 안의 객체 리터럴일 뿐이고, submitOrder를
// 포함한 모든 deps가 스텁이라 실제 브로커로 나가는 호출은 없다.
describe("runDca — LIVE 제출 경로", () => {
  it("주문 행을 제출 '전에' 만들고(뮤텍스), 같은 행을 submitted + tossOrderId로 갱신한다", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: false }));
    let atSubmit: Row[] | null = null;
    let submitArgs: unknown[] | null = null;
    const sent: { clientOrderId?: string } = {};
    const deps = makeDeps({
      getDefaultAccountSeq: async () => 42,
      getBuyingPowerUsd: async () => 1_000,
      submitOrder: async (accountSeq, o, symbol) => {
        // 뮤텍스 순서의 핵심 — 이 시점에 행이 이미 있어야 한다.
        atSubmit = fake.orders.map((r) => ({ ...r }));
        submitArgs = [accountSeq, o, symbol];
        sent.clientOrderId = o.clientOrderId;
        return { tossOrderId: "T-1" };
      },
    });

    const r = await runDca(fake.db, deps, "acc1", DAY_D, false);

    // 제출 시점 스냅샷: 행 1개, submitting, tossOrderId 없음, 멱등성 키는 이미 저장돼 있음
    expect(atSubmit).toHaveLength(1);
    expect(atSubmit![0]).toMatchObject({
      status: "submitting",
      dryRun: false,
      tossOrderId: null,
      tradeDate: DAY_D,
      orderType: "MARKET",
      tif: null,
      amountUsd: D_AMOUNT_USD,
      amountKrw: D_AMOUNT_KRW,
      price: PRICE,
      quantity: D_QTY,
      clientOrderId: "dca-acc1-20260826",
    });
    // 금액 기반 계약 — quantity·price·timeInForce는 제출 인자에 없다
    expect(submitArgs).toEqual([
      42,
      { amountUsd: D_AMOUNT_USD, clientOrderId: "dca-acc1-20260826" },
      "QQQ",
    ]);
    expect(sent.clientOrderId).toBe(makeClientOrderId("acc1", DAY_D));
    expect(sent.clientOrderId!.length).toBeLessThanOrEqual(36);
    expect(sent.clientOrderId!).toMatch(/^[A-Za-z0-9\-_]+$/);

    // 제출 후: 같은 행이 갱신되고 두 번째 행은 생기지 않는다
    expect(fake.orders).toHaveLength(1);
    expect(fake.orders[0].id).toBe(atSubmit![0].id);
    expect(fake.orders[0]).toMatchObject({
      status: "submitted",
      tossOrderId: "T-1",
      dryRun: false,
      stateApplied: null, // LIVE는 정산 뒤에 차감한다
    });
    expect(r).toMatchObject({
      placed: 1,
      simulated: 0,
      symbol: "QQQ",
      blocked: null,
      noOrderReason: null,
    });
    expect(fake.account.lastRunDate).toBe(DAY_D);
    expect(fake.account.note).toBeNull();
    expect(fake.account.cashKrw).toBe(DAILY); // 적립만 — 체결 확인 전이라 차감 없음
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
      clientOrderId: "dca-acc1-20260826",
      dryRun: false,
      stateApplied: null,
    });
    expect(fake.account.note).toBe(
      "주문 제출 결과 미확인 — 토스 앱에서 체결 여부를 직접 확인하세요: The operation was aborted due to timeout",
    );
    // 재시도가 진짜 이중 매수를 만들므로 거래일은 소진시킨다
    expect(fake.account.lastRunDate).toBe(DAY_D);
    // 정산된 게 없으므로 잔액은 적립분만 (차감 없음)
    expect(fake.account.cashKrw).toBe(DAILY);
    expect(r).toMatchObject({
      placed: 0,
      simulated: 0,
      blocked: null,
      noOrderReason: "submit_unknown",
    });
  });

  it("예수금이 부족하면 주문 행조차 만들지 않고 보류 — 같은 거래일 재시도 가능", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: false }));
    // submitOrder는 makeDeps 기본값(호출되면 throw) 그대로 둔다.
    const deps = makeDeps({
      getDefaultAccountSeq: async () => 42,
      getBuyingPowerUsd: async () => 10, // 필요 $36.25
    });

    const r = await runDca(fake.db, deps, "acc1", DAY_D, false);

    expect(r.blocked).toBe("USD 예수금 부족: 필요 $36.25 / 보유 $10.00");
    expect(fake.orders).toHaveLength(0);
    expect(fake.account.lastRunDate).toBeNull(); // 다음 폴에서 재시도
    expect(fake.account.note).toBe(r.blocked);
    expect(fake.account.cashKrw).toBe(DAILY); // 적립은 유지(lastAccrualDate 멱등)
  });

  it("예수금이 NaN이면 fail-closed — 제출하지 않고 '확인 불가'로 막는다", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: false }));
    const deps = makeDeps({
      getDefaultAccountSeq: async () => 42,
      getBuyingPowerUsd: async () => Number.NaN, // 응답 필드 누락·개편 상황
    });

    const r = await runDca(fake.db, deps, "acc1", DAY_D, false);

    expect(r.blocked).toBe("USD 예수금 부족: 필요 $36.25 / 보유 확인 불가");
    expect(fake.orders).toHaveLength(0);
    expect(fake.account.lastRunDate).toBeNull();
  });
});

/** 이전 거래일에 남아 있던 LIVE 주문 행 시드용 (필드는 스키마와 같은 이름). */
function makeOrderRow(over: Row = {}): Row {
  return {
    accountId: "acc1",
    tradeDate: DAY_D,
    symbol: "QQQ",
    side: "BUY",
    kind: "loc_buy",
    orderType: "MARKET",
    tif: null,
    price: PRICE,
    quantity: D_QTY,
    amountUsd: D_AMOUNT_USD,
    amountKrw: D_AMOUNT_KRW,
    clientOrderId: "dca-acc1-20260826",
    fxRate: FX,
    drawdownPct: DRAWDOWN,
    ...over,
  };
}

// 정산 대상은 계좌 모드가 아니라 주문 행의 dryRun으로 갈린다. LIVE 정산을 계좌 모드로 분기하면
// dryRun으로 되돌린 계좌의 submitted 행이 영구히 얼어붙는다.
describe("runDca — 정산은 계좌 모드·주문 창과 무관하게 돈다", () => {
  it("dryRun 계좌에 남은 LIVE submitted 행도 토스 CLOSED 대조로 정산·차감된다", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: true, cashKrw: 100_000 }), [
      makeOrderRow({ id: "leftover", dryRun: false, status: "submitted", tossOrderId: "T-9" }),
    ]);
    // 주문 창은 닫아 둔다 — 정산·적립이 주문 단계와 독립적으로 끝나는지 같이 본다.
    const deps = makeDeps({
      isAmountOrderWindowOpen: async () => false,
      getDefaultAccountSeq: async () => 42,
      getClosedOrders: async () => [
        { orderId: "T-9", filledQuantity: 0.05, averageFilledPrice: 700 },
      ],
    });

    const r = await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(fake.orders[0]).toMatchObject({
      status: "filled",
      filledQty: 0.05,
      filledPrice: 700,
      filledAt: DAY_D,
      stateApplied: true,
    });
    // round(100,000 − 700 × 0.05 × 1379.1) = 51,732, 그 뒤 적립 50,000
    expect(fake.account.cashKrw).toBe(101_732);
    expect(fake.orders).toHaveLength(1); // 창이 닫혀 새 주문은 없다
    expect(r).toMatchObject({ placed: 0, simulated: 0, accrued: true, blocked: null });
    expect(fake.account.lastRunDate).toBe(DAY_D1);
  });

  it("같은 tossOrderId를 문 두 행은 한 번만 차감된다 (clientOrderId 멱등이 합친 중복 제출)", async () => {
    // 뮤텍스를 놓친 동시 제출: 두 행이 같은 clientOrderId로 나가 토스가 같은 주문(T-1)을 돌려줬다.
    const fake = makeFakeDb(makeAccount({ dryRun: false, cashKrw: 100_000 }), [
      makeOrderRow({ id: "dup-a", dryRun: false, status: "submitted", tossOrderId: "T-1" }),
      makeOrderRow({ id: "dup-b", dryRun: false, status: "submitted", tossOrderId: "T-1" }),
    ]);
    const deps = makeDeps({
      isAmountOrderWindowOpen: async () => false,
      getDefaultAccountSeq: async () => 42,
      getClosedOrders: async () => [
        { orderId: "T-1", filledQuantity: 0.05, averageFilledPrice: 700 },
      ],
    });

    await runDca(fake.db, deps, "acc1", DAY_D1, false);

    // 먼저 온 행이 체결을 가져가고
    expect(fake.orders[0]).toMatchObject({
      id: "dup-a",
      status: "filled",
      filledQty: 0.05,
      filledPrice: 700,
      stateApplied: true,
    });
    // 두 번째 행은 차감 없이 닫힌다 — filled로 두면 같은 매수가 두 번 차감된다
    expect(fake.orders[1]).toMatchObject({
      id: "dup-b",
      status: "expired",
      filledQty: null,
      filledPrice: null,
      stateApplied: null,
    });
    expect(fake.orders[1].error).toContain("중복 제출");
    // 차감은 정확히 1회분: round(100,000 − 700 × 0.05 × 1379.1) = 51,732, 그 뒤 적립 50,000
    expect(fake.account.cashKrw).toBe(101_732);
  });

  it("앞선 폴에서 이미 정산된 주문번호는 다음 폴의 다른 행에 내주지 않는다", async () => {
    // 두 행이 서로 다른 폴에 걸쳐 정산되는 경우 — in-pass 집합만으로는 못 막는다.
    const fake = makeFakeDb(makeAccount({ dryRun: false, cashKrw: 100_000 }), [
      makeOrderRow({
        id: "settled",
        dryRun: false,
        status: "filled",
        tossOrderId: "T-1",
        filledQty: 0.05,
        filledPrice: 700,
        filledAt: DAY_D,
        stateApplied: true,
      }),
      makeOrderRow({ id: "late", dryRun: false, status: "submitted", tossOrderId: "T-1" }),
    ]);
    const deps = makeDeps({
      isAmountOrderWindowOpen: async () => false,
      getDefaultAccountSeq: async () => 42,
      getClosedOrders: async () => [
        { orderId: "T-1", filledQuantity: 0.05, averageFilledPrice: 700 },
      ],
    });

    await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(fake.orders[1]).toMatchObject({ id: "late", status: "expired", stateApplied: null });
    expect(fake.account.cashKrw).toBe(150_000); // 적립만 — 재차감 없음
  });

  it("체결가가 없는 행은 stateApplied를 세우지 않고 보류로 남긴다", async () => {
    // applyFills가 건너뛰는 행에 마커만 찍히면 차감 없이 '반영 완료'로 굳어 영구히 어긋난다.
    const fake = makeFakeDb(makeAccount({ dryRun: false, cashKrw: 100_000 }), [
      makeOrderRow({
        id: "no-price",
        dryRun: false,
        status: "filled",
        tossOrderId: "T-7",
        filledQty: 0.05,
        filledPrice: null,
        stateApplied: null,
      }),
    ]);
    const deps = makeDeps({
      isAmountOrderWindowOpen: async () => false,
      getDefaultAccountSeq: async () => 42,
    });

    await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(fake.orders[0]).toMatchObject({ status: "filled", stateApplied: null });
    expect(fake.account.cashKrw).toBe(150_000); // 적립만, 차감 없음
  });

  it("정상 행과 섞여 있어도 건너뛴 행만 보류로 남는다 (마커가 함께 찍히면 안 된다)", async () => {
    // 단일 행이면 applicable이 비어 조기 반환에 가려진다 — 섞인 경우가 진짜 회귀 지점이다.
    const fake = makeFakeDb(makeAccount({ dryRun: false, cashKrw: 100_000 }), [
      makeOrderRow({
        id: "good",
        dryRun: false,
        status: "filled",
        tossOrderId: "T-10",
        filledQty: 0.05,
        filledPrice: 700,
        stateApplied: null,
      }),
      makeOrderRow({
        id: "no-price",
        dryRun: false,
        status: "filled",
        tossOrderId: "T-11",
        filledQty: 0.05,
        filledPrice: null,
        stateApplied: null,
      }),
    ]);
    const deps = makeDeps({
      isAmountOrderWindowOpen: async () => false,
      getDefaultAccountSeq: async () => 42,
    });

    await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(fake.orders[0]).toMatchObject({ id: "good", stateApplied: true });
    expect(fake.orders[1]).toMatchObject({ id: "no-price", stateApplied: null });
    // 차감은 정상 행 1건분만: round(100,000 − 700 × 0.05 × 1379.1) = 51,732, 그 뒤 적립
    expect(fake.account.cashKrw).toBe(101_732);
  });

  it("환율이 비정상인 행도 보류로 남긴다", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: false, cashKrw: 100_000 }), [
      makeOrderRow({
        id: "bad-fx",
        dryRun: false,
        status: "filled",
        tossOrderId: "T-8",
        filledQty: 0.05,
        filledPrice: 700,
        fxRate: 0,
        stateApplied: null,
      }),
    ]);
    const deps = makeDeps({
      isAmountOrderWindowOpen: async () => false,
      getDefaultAccountSeq: async () => 42,
    });

    await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(fake.orders[0]).toMatchObject({ stateApplied: null });
    expect(fake.account.cashKrw).toBe(150_000);
  });

  it("CLOSED에 체결이 없으면 expired로 닫고 차감하지 않는다", async () => {
    const fake = makeFakeDb(makeAccount({ dryRun: false, cashKrw: 100_000 }), [
      makeOrderRow({ id: "leftover", dryRun: false, status: "submitted", tossOrderId: "T-9" }),
    ]);
    const deps = makeDeps({
      isAmountOrderWindowOpen: async () => false,
      getDefaultAccountSeq: async () => 42,
      getClosedOrders: async () => [
        { orderId: "T-9", filledQuantity: 0, averageFilledPrice: null },
      ],
    });

    await runDca(fake.db, deps, "acc1", DAY_D1, false);

    expect(fake.orders[0]).toMatchObject({ status: "expired", filledQty: null, stateApplied: null });
    expect(fake.account.cashKrw).toBe(150_000); // 적립만
  });
});
