# 무한매수법 자동매매 (토스 연동) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 미국 3배 레버리지 ETF에 대해 라오어 무한매수법 핵심 사이클(40분할 LOC 매수 + 평단 +10% 익절 + 소진 후 손절리셋)을 토스증권 API로 완전 무인 자동 실행하고, 종목별 진행 현황을 대시보드로 본다.

**Architecture:** 4계층 분리 — ① 순수 전략 코어(`strategy.ts`, Vitest) → ② 실행기(`run.ts`, toss/db를 인터페이스로 주입, dryRun 지원) → ③ worker 무인 루프(US 정규장·거래일당 1회) → ④ 대시보드(서버액션 + Next 페이지). 평단·보유·수익률은 토스 라이브, 사이클은 설정·회차·주문이력만 SQLite에 저장.

**Tech Stack:** Next.js 16 App Router, Prisma(SQLite, `@prisma-clients/company-map`), Vitest, tsx worker, 토스 Open API(`src/lib/toss/client.ts`), Tailwind v4, lucide-react, Recharts(미사용 가능).

**Spec:** `docs/superpowers/specs/2026-06-29-infinite-buy-automation-design.html`

> 작업 디렉터리: `apps/company-map`. 모든 경로는 이 앱 기준. lint는 변경 파일만 `npx eslint <files>`로 검증(워크스페이스 lint는 기존 에러로 항상 exit 1). Prisma 스키마 변경 후 dev 서버 재시작 필수. dev 서버를 백그라운드로 띄우지 말 것.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` (수정) | `InfiniteBuyCycle`, `InfiniteBuyOrder` 모델 |
| `src/lib/infinite-buy/strategy.ts` | 순수 전략 코어 `computeDailyOrders` + 타입 |
| `src/lib/infinite-buy/strategy.test.ts` | 코어 Vitest |
| `src/lib/infinite-buy/run.ts` | 실행기 `runCycle`(주입형 deps/persistence) + 타입 |
| `src/lib/infinite-buy/run.test.ts` | 실행기 Vitest(fake deps) |
| `src/lib/infinite-buy/toss-adapter.ts` | 토스 클라이언트 → `RunDeps`, Prisma db → `RunPersistence` 어댑터 |
| `worker/infinite-buy-loop.ts` | 무인 스케줄 루프 |
| `worker/index.ts` (수정) | 루프 등록 |
| `src/actions/infinite-buy.ts` | 대시보드 서버액션 |
| `src/app/stocks/infinite-buy/page.tsx` | 대시보드 서버 컴포넌트 |
| `src/app/stocks/infinite-buy/InfiniteBuyManager.tsx` | 대시보드 클라이언트 UI |
| `src/components/layout/AppMenu.tsx` (수정) | 사이드바 메뉴 |
| `src/app/stocks/page.tsx` (수정) | 링크 |

---

## Task 1: Prisma 모델 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (Week52Price 모델 앞에 추가)

- [ ] **Step 1: 모델 추가**

`prisma/schema.prisma`에서 `model Week52Price {` 바로 앞에 추가:

```prisma
// 무한매수법 자동매매 사이클. 평단·보유·수익률은 토스 라이브 조회, 여기엔 설정·회차·주문이력만.
model InfiniteBuyCycle {
  id            String   @id @default(uuid())
  symbol        String                          // 토스 심볼(US 티커, 예: TQQQ)
  name          String                          // 표시용 종목명
  accountSeq    Int?     @map("account_seq")    // 토스 계좌(null=기본계좌)
  principal     Float                           // 원금(USD)
  splits        Int      @default(40)
  profitTarget  Float    @default(10) @map("profit_target")   // 익절 %
  bigBuyPremium Float    @default(12) @map("big_buy_premium")  // 큰수 LOC 프리미엄 %
  lossCut       Float    @default(10) @map("loss_cut")         // 소진 후 손절 기준 %
  status        String   @default("active")     // active | paused | completed | stopped
  dryRun        Boolean  @default(true) @map("dry_run")
  round         Int      @default(0)
  lastRunDate   String?  @map("last_run_date")  // 마지막 실행 US 거래일
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  orders InfiniteBuyOrder[]

  @@map("infinite_buy_cycles")
}

model InfiniteBuyOrder {
  id          String   @id @default(uuid())
  cycleId     String   @map("cycle_id")
  tradeDate   String   @map("trade_date")       // US 거래일
  round       Int
  side        String                            // BUY | SELL
  kind        String                            // first_market|loc_avg|loc_big|target_sell|reset_sell
  orderType   String   @map("order_type")       // LIMIT | MARKET
  tif         String                            // CLS | DAY
  price       Float?
  quantity    Float
  tossOrderId String?  @map("toss_order_id")
  dryRun      Boolean  @map("dry_run")
  status      String                            // submitted | failed | simulated | skipped
  error       String?
  createdAt   DateTime @default(now()) @map("created_at")

  cycle InfiniteBuyCycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)

  @@index([cycleId, tradeDate])
  @@map("infinite_buy_orders")
}
```

- [ ] **Step 2: 마이그레이션 + 클라이언트 생성**

Run: `yarn prisma migrate dev --name add_infinite_buy`
Expected: `Applying migration ... add_infinite_buy` + `Generated Prisma Client`

- [ ] **Step 3: dev 서버 재시작 안내**

사용자에게 `nps dev` 재시작 안내(globalThis PrismaClient 캐시 때문에 새 모델 인식하려면 필요). worker/스크립트는 별도 프로세스라 영향 없음.

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "feat(company-map): 무한매수법 사이클/주문 Prisma 모델 추가"
```

---

## Task 2: 전략 코어 (순수 함수) — TDD

**Files:**
- Create: `src/lib/infinite-buy/strategy.ts`
- Test: `src/lib/infinite-buy/strategy.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/infinite-buy/strategy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDailyOrders, type CycleState } from "./strategy";

const base: CycleState = {
  round: 0, splits: 40, principalUsd: 4000,
  profitTarget: 10, bigBuyPremium: 12, lossCut: 10,
  avgPrice: null, currentPrice: 50, holdingQty: 0, pnlPct: null,
};

describe("computeDailyOrders", () => {
  it("1회차: 장중 MARKET 매수로 시작", () => {
    const p = computeDailyOrders(base);
    expect(p.orders).toEqual([
      { side: "BUY", kind: "first_market", orderType: "MARKET", tif: "DAY", price: null, quantity: 2 },
    ]); // dailyAmount=4000/40=100, floor(100/50)=2
    expect(p.nextRound).toBe(1);
    expect(p.resetAfter).toBe(false);
  });

  it("2회차+: LOC 평단 + LOC 큰수 매수 + 목표 매도", () => {
    const p = computeDailyOrders({
      ...base, round: 1, avgPrice: 50, currentPrice: 50, holdingQty: 2,
    });
    // half=50. loc_avg: floor(50/50)=1 @50. loc_big: 50*1.12=56 → floor(50/56)=0 → skip
    expect(p.orders).toEqual([
      { side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 1 },
      { side: "SELL", kind: "target_sell", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 2 },
    ]);
    expect(p.nextRound).toBe(2);
  });

  it("2회차+: 큰수 매수도 수량 확보되면 포함", () => {
    const p = computeDailyOrders({
      ...base, round: 1, principalUsd: 8000, avgPrice: 50, currentPrice: 50, holdingQty: 2,
    });
    // dailyAmount=200, half=100. loc_avg floor(100/50)=2 @50. big 56 → floor(100/56)=1 @56
    const kinds = p.orders.map((o) => o.kind);
    expect(kinds).toEqual(["loc_avg", "loc_big", "target_sell"]);
    expect(p.orders[1]).toMatchObject({ kind: "loc_big", price: 56, quantity: 1, tif: "CLS" });
  });

  it("소진 후 보유 0: 익절 완료로 리셋", () => {
    const p = computeDailyOrders({ ...base, round: 40, holdingQty: 0, avgPrice: null });
    expect(p.orders).toEqual([]);
    expect(p.resetAfter).toBe(true);
  });

  it("소진 후 -10% 이하: MARKET 전량 손절 + 리셋", () => {
    const p = computeDailyOrders({
      ...base, round: 40, avgPrice: 50, currentPrice: 44, holdingQty: 80, pnlPct: -12,
    });
    expect(p.orders).toEqual([
      { side: "SELL", kind: "reset_sell", orderType: "MARKET", tif: "DAY", price: null, quantity: 80 },
    ]);
    expect(p.resetAfter).toBe(true);
  });

  it("소진 후 -10~+10%: 목표 매도만 유지", () => {
    const p = computeDailyOrders({
      ...base, round: 40, avgPrice: 50, currentPrice: 51, holdingQty: 80, pnlPct: 2,
    });
    expect(p.orders).toEqual([
      { side: "SELL", kind: "target_sell", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 80 },
    ]);
    expect(p.resetAfter).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `yarn vitest run src/lib/infinite-buy/strategy.test.ts`
Expected: FAIL (`computeDailyOrders` not found)

- [ ] **Step 3: 구현**

`src/lib/infinite-buy/strategy.ts`:

```ts
// 라오어 무한매수법 핵심 사이클(상황1) 순수 계산. 토스 의존 없음.
export interface CycleState {
  round: number;
  splits: number;
  principalUsd: number;
  profitTarget: number;  // %
  bigBuyPremium: number; // %
  lossCut: number;       // % (양수; pnlPct <= -lossCut이면 손절)
  avgPrice: number | null;
  currentPrice: number;
  holdingQty: number;
  pnlPct: number | null; // %
}

export type OrderKind =
  | "first_market" | "loc_avg" | "loc_big" | "target_sell" | "reset_sell";

export interface IntendedOrder {
  side: "BUY" | "SELL";
  kind: OrderKind;
  orderType: "LIMIT" | "MARKET";
  tif: "CLS" | "DAY";
  price: number | null;
  quantity: number;
}

export interface DailyPlan {
  orders: IntendedOrder[];
  nextRound: number;
  resetAfter: boolean;
}

// 미국 주식 가격은 소수 2자리.
const px = (v: number): number => Math.round(v * 100) / 100;

export function computeDailyOrders(s: CycleState): DailyPlan {
  const dailyAmount = s.principalUsd / s.splits;
  const orders: IntendedOrder[] = [];
  let nextRound = s.round;
  let resetAfter = false;

  if (s.round < s.splits) {
    // 매수 단계
    if (s.round === 0) {
      const qty = Math.floor(dailyAmount / s.currentPrice);
      if (qty >= 1) {
        orders.push({ side: "BUY", kind: "first_market", orderType: "MARKET", tif: "DAY", price: null, quantity: qty });
      }
    } else {
      const half = dailyAmount / 2;
      if (s.avgPrice && s.avgPrice > 0) {
        const qtyAvg = Math.floor(half / s.avgPrice);
        if (qtyAvg >= 1) {
          orders.push({ side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: px(s.avgPrice), quantity: qtyAvg });
        }
      }
      const bigPrice = s.currentPrice * (1 + s.bigBuyPremium / 100);
      const qtyBig = Math.floor(half / bigPrice);
      if (qtyBig >= 1) {
        orders.push({ side: "BUY", kind: "loc_big", orderType: "LIMIT", tif: "CLS", price: px(bigPrice), quantity: qtyBig });
      }
    }
    nextRound = s.round + 1;

    if (s.holdingQty > 0 && s.avgPrice && s.avgPrice > 0) {
      orders.push({
        side: "SELL", kind: "target_sell", orderType: "LIMIT", tif: "DAY",
        price: px(s.avgPrice * (1 + s.profitTarget / 100)), quantity: s.holdingQty,
      });
    }
  } else {
    // 소진 후(상황1)
    if (s.holdingQty <= 0) {
      resetAfter = true; // 익절 완료
    } else if (s.pnlPct != null && s.pnlPct <= -s.lossCut) {
      orders.push({ side: "SELL", kind: "reset_sell", orderType: "MARKET", tif: "DAY", price: null, quantity: s.holdingQty });
      resetAfter = true; // 손절
    } else if (s.avgPrice && s.avgPrice > 0) {
      orders.push({
        side: "SELL", kind: "target_sell", orderType: "LIMIT", tif: "DAY",
        price: px(s.avgPrice * (1 + s.profitTarget / 100)), quantity: s.holdingQty,
      });
    }
  }

  return { orders, nextRound, resetAfter };
}
```

- [ ] **Step 4: 통과 확인**

Run: `yarn vitest run src/lib/infinite-buy/strategy.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/lib/infinite-buy/strategy.ts apps/company-map/src/lib/infinite-buy/strategy.test.ts
git commit -m "feat(company-map): 무한매수법 전략 코어 + 테스트"
```

---

## Task 3: 실행기 run.ts (주입형 deps) — TDD

**Files:**
- Create: `src/lib/infinite-buy/run.ts`
- Test: `src/lib/infinite-buy/run.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/infinite-buy/run.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runCycle, type RunDeps, type RunPersistence, type CycleConfig } from "./run";

const cycle: CycleConfig = {
  id: "c1", symbol: "TQQQ", accountSeq: 7,
  principalUsd: 4000, splits: 40, profitTarget: 10, bigBuyPremium: 12, lossCut: 10,
  round: 0, dryRun: true,
};

function fakeDeps(over: Partial<RunDeps> = {}): RunDeps {
  return {
    getDefaultAccountSeq: vi.fn(async () => 7),
    getHoldingForSymbol: vi.fn(async () => null), // 보유 없음
    getCurrentPrice: vi.fn(async () => 50),
    getBuyingPowerUsd: vi.fn(async () => 100000),
    submitOrder: vi.fn(async () => ({ tossOrderId: "ord-1" })),
    ...over,
  };
}

function fakePersist() {
  const logged: unknown[] = [];
  const updated: unknown[] = [];
  const persist: RunPersistence = {
    logOrder: vi.fn(async (o) => { logged.push(o); }),
    updateCycle: vi.fn(async (id, data) => { updated.push({ id, data }); }),
  };
  return { persist, logged, updated };
}

describe("runCycle", () => {
  it("dryRun: submitOrder 호출 안 함, simulated 로깅", async () => {
    const deps = fakeDeps();
    const { persist, logged } = fakePersist();
    await runCycle(persist, deps, cycle, "2026-06-29", false);
    expect(deps.submitOrder).not.toHaveBeenCalled();
    expect(logged).toHaveLength(1); // first_market
    expect((logged[0] as { status: string }).status).toBe("simulated");
  });

  it("live: submitOrder 호출, submitted 로깅 + 회차 갱신", async () => {
    const deps = fakeDeps();
    const { persist, logged, updated } = fakePersist();
    await runCycle(persist, deps, { ...cycle, dryRun: false }, "2026-06-29", false);
    expect(deps.submitOrder).toHaveBeenCalledTimes(1);
    expect((logged[0] as { status: string; tossOrderId: string | null }).status).toBe("submitted");
    expect(updated[0]).toEqual({ id: "c1", data: { round: 1, lastRunDate: "2026-06-29" } });
  });

  it("킬스위치: live여도 제출 안 하고 simulated", async () => {
    const deps = fakeDeps();
    const { persist, logged } = fakePersist();
    await runCycle(persist, deps, { ...cycle, dryRun: false }, "2026-06-29", true);
    expect(deps.submitOrder).not.toHaveBeenCalled();
    expect((logged[0] as { status: string }).status).toBe("simulated");
  });

  it("매수가능금액 부족: 해당 BUY는 skipped 로깅", async () => {
    const deps = fakeDeps({ getBuyingPowerUsd: vi.fn(async () => 10) }); // 2*50=100 > 10
    const { persist, logged } = fakePersist();
    await runCycle(persist, deps, { ...cycle, dryRun: false }, "2026-06-29", false);
    expect(deps.submitOrder).not.toHaveBeenCalled();
    expect((logged[0] as { status: string }).status).toBe("skipped");
  });

  it("리셋: resetAfter면 round 0으로", async () => {
    const deps = fakeDeps({
      getHoldingForSymbol: vi.fn(async () => ({ avgPrice: 50, quantity: 0, currentPrice: 50, pnlPct: 0 })),
    });
    const { persist, updated } = fakePersist();
    await runCycle(persist, deps, { ...cycle, dryRun: false, round: 40 }, "2026-06-29", false);
    expect(updated[0]).toEqual({ id: "c1", data: { round: 0, lastRunDate: "2026-06-29" } });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `yarn vitest run src/lib/infinite-buy/run.test.ts`
Expected: FAIL (`runCycle` not found)

- [ ] **Step 3: 구현**

`src/lib/infinite-buy/run.ts`:

```ts
import { computeDailyOrders, type CycleState, type IntendedOrder } from "./strategy";

export interface CycleConfig {
  id: string;
  symbol: string;
  accountSeq: number | null;
  principalUsd: number;
  splits: number;
  profitTarget: number;
  bigBuyPremium: number;
  lossCut: number;
  round: number;
  dryRun: boolean;
}

export interface HoldingSnapshot {
  avgPrice: number;
  quantity: number;
  currentPrice: number;
  pnlPct: number; // %
}

export interface RunDeps {
  getDefaultAccountSeq(): Promise<number>;
  getHoldingForSymbol(accountSeq: number, symbol: string): Promise<HoldingSnapshot | null>;
  getCurrentPrice(symbol: string): Promise<number>;
  getBuyingPowerUsd(accountSeq: number): Promise<number>;
  submitOrder(accountSeq: number, o: IntendedOrder, symbol: string): Promise<{ tossOrderId: string }>;
}

export interface OrderLog {
  cycleId: string;
  tradeDate: string;
  round: number;
  side: string;
  kind: string;
  orderType: string;
  tif: string;
  price: number | null;
  quantity: number;
  tossOrderId: string | null;
  dryRun: boolean;
  status: "submitted" | "failed" | "simulated" | "skipped";
  error: string | null;
}

export interface RunPersistence {
  logOrder(o: OrderLog): Promise<void>;
  updateCycle(id: string, data: { round?: number; lastRunDate?: string; status?: string }): Promise<void>;
}

export interface RunResult {
  placed: number;
  simulated: number;
  skipped: number;
  failed: number;
}

export async function runCycle(
  persist: RunPersistence,
  deps: RunDeps,
  cycle: CycleConfig,
  tradeDate: string,
  killed: boolean,
): Promise<RunResult> {
  const accountSeq = cycle.accountSeq ?? (await deps.getDefaultAccountSeq());
  const holding = await deps.getHoldingForSymbol(accountSeq, cycle.symbol);
  const currentPrice = holding?.currentPrice ?? (await deps.getCurrentPrice(cycle.symbol));

  const state: CycleState = {
    round: cycle.round,
    splits: cycle.splits,
    principalUsd: cycle.principalUsd,
    profitTarget: cycle.profitTarget,
    bigBuyPremium: cycle.bigBuyPremium,
    lossCut: cycle.lossCut,
    avgPrice: holding?.avgPrice ?? null,
    currentPrice,
    holdingQty: holding?.quantity ?? 0,
    pnlPct: holding?.pnlPct ?? null,
  };

  const plan = computeDailyOrders(state);
  const result: RunResult = { placed: 0, simulated: 0, skipped: 0, failed: 0 };
  const simulate = cycle.dryRun || killed;

  let buyingPower = plan.orders.some((o) => o.side === "BUY")
    ? await deps.getBuyingPowerUsd(accountSeq)
    : 0;

  for (const o of plan.orders) {
    const base: OrderLog = {
      cycleId: cycle.id, tradeDate, round: cycle.round, side: o.side, kind: o.kind,
      orderType: o.orderType, tif: o.tif, price: o.price, quantity: o.quantity,
      tossOrderId: null, dryRun: cycle.dryRun, status: "simulated", error: null,
    };

    // 매수 가용금액 체크 (LIMIT은 price*qty, MARKET은 현재가*qty 근사)
    if (o.side === "BUY") {
      const est = (o.price ?? currentPrice) * o.quantity;
      if (est > buyingPower) {
        await persist.logOrder({ ...base, status: "skipped", error: "insufficient buying power" });
        result.skipped++;
        continue;
      }
      buyingPower -= est;
    }

    if (simulate) {
      await persist.logOrder({ ...base, status: "simulated" });
      result.simulated++;
      continue;
    }

    try {
      const { tossOrderId } = await deps.submitOrder(accountSeq, o, cycle.symbol);
      await persist.logOrder({ ...base, status: "submitted", tossOrderId });
      result.placed++;
    } catch (e) {
      await persist.logOrder({ ...base, status: "failed", error: e instanceof Error ? e.message : String(e) });
      result.failed++;
    }
  }

  // 회차/리셋/거래일 갱신
  const data: { round: number; lastRunDate: string } = {
    round: plan.resetAfter ? 0 : plan.nextRound,
    lastRunDate: tradeDate,
  };
  await persist.updateCycle(cycle.id, data);

  return result;
}
```

> 참고: 테스트의 `updated[0]`는 `{ round, lastRunDate }`만 기대하므로 위 `data` 형태와 일치한다. dryRun에서도 round를 진행시켜 시뮬레이션 진척을 보여준다(라이브 보유와는 별개의 진척 카운터).

- [ ] **Step 4: 통과 확인**

Run: `yarn vitest run src/lib/infinite-buy/run.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/lib/infinite-buy/run.ts apps/company-map/src/lib/infinite-buy/run.test.ts
git commit -m "feat(company-map): 무한매수법 실행기(주입형) + 테스트"
```

---

## Task 4: 토스/Prisma 어댑터

**Files:**
- Create: `src/lib/infinite-buy/toss-adapter.ts`

- [ ] **Step 1: 구현**

`src/lib/infinite-buy/toss-adapter.ts`:

```ts
import {
  getDefaultAccountSeq, getHoldings, getPrices, getBuyingPower, createOrder,
} from "@/lib/toss/client";
import type { PrismaClient } from "@prisma-clients/company-map";
import type { RunDeps, RunPersistence, HoldingSnapshot, OrderLog } from "./run";
import type { IntendedOrder } from "./strategy";

// 토스 클라이언트 → RunDeps. profitLoss.rate는 소수(0.05=5%)라 *100 하여 %로 변환.
export function tossRunDeps(): RunDeps {
  return {
    getDefaultAccountSeq,
    async getHoldingForSymbol(accountSeq, symbol): Promise<HoldingSnapshot | null> {
      const overview = await getHoldings(accountSeq);
      const item = overview.items.find((i) => i.symbol === symbol);
      if (!item) return null;
      return {
        avgPrice: Number(item.averagePurchasePrice),
        quantity: Number(item.quantity),
        currentPrice: Number(item.lastPrice),
        pnlPct: Number(item.profitLoss.rate) * 100,
      };
    },
    async getCurrentPrice(symbol): Promise<number> {
      const [p] = await getPrices([symbol]);
      return Number(p?.lastPrice ?? 0);
    },
    getBuyingPowerUsd(accountSeq): Promise<number> {
      return getBuyingPower(accountSeq, "USD");
    },
    async submitOrder(accountSeq, o: IntendedOrder, symbol) {
      const r = await createOrder(accountSeq, {
        symbol,
        side: o.side,
        orderType: o.orderType,
        quantity: String(o.quantity),
        price: o.orderType === "LIMIT" ? String(o.price) : undefined,
        timeInForce: o.tif,
      });
      return { tossOrderId: r.orderId };
    },
  };
}

// Prisma db → RunPersistence.
export function prismaPersistence(db: PrismaClient): RunPersistence {
  return {
    async logOrder(o: OrderLog) {
      await db.infiniteBuyOrder.create({
        data: {
          cycleId: o.cycleId, tradeDate: o.tradeDate, round: o.round, side: o.side,
          kind: o.kind, orderType: o.orderType, tif: o.tif, price: o.price,
          quantity: o.quantity, tossOrderId: o.tossOrderId, dryRun: o.dryRun,
          status: o.status, error: o.error,
        },
      });
    },
    async updateCycle(id, data) {
      await db.infiniteBuyCycle.update({ where: { id }, data });
    },
  };
}

export const isKilled = (): boolean => process.env.INFINITE_BUY_DISABLED === "1";
```

- [ ] **Step 2: 타입 검증**

Run: `npx tsc --noEmit`
Expected: 0 errors (어댑터가 toss/Prisma 타입과 정합)

> `getPrices` 응답 필드명이 `lastPrice`가 아니면 tsc가 잡는다. 잡히면 `TossPrice` 타입을 열어 실제 현재가 필드로 교체.

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/src/lib/infinite-buy/toss-adapter.ts
git commit -m "feat(company-map): 무한매수법 토스/Prisma 어댑터"
```

---

## Task 5: Worker 무인 루프

**Files:**
- Create: `worker/infinite-buy-loop.ts`
- Modify: `worker/index.ts`

- [ ] **Step 1: 루프 구현**

`worker/infinite-buy-loop.ts`:

```ts
import { db } from "./db";
import { getMarketCalendarUS } from "@/lib/toss/client";
import { runCycle, type CycleConfig } from "@/lib/infinite-buy/run";
import { tossRunDeps, prismaPersistence, isKilled } from "@/lib/infinite-buy/toss-adapter";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15분 폴

// US 정규장 진행 중이면 오늘 거래일 문자열 반환, 아니면 null.
async function usRegularTradeDate(): Promise<string | null> {
  try {
    const cal = await getMarketCalendarUS();
    const day = cal.today;
    const reg = day.regularMarket as { startTime?: string; endTime?: string };
    if (!reg?.startTime || !reg?.endTime) return null; // 휴장
    const now = Date.now();
    const open = new Date(reg.startTime).getTime();
    const close = new Date(reg.endTime).getTime();
    return now >= open && now < close ? day.date : null;
  } catch (e) {
    console.error("[infinite-buy] calendar fetch failed:", e);
    return null;
  }
}

export async function infiniteBuyLoop(): Promise<void> {
  console.log("[infinite-buy-loop] starting (15min poll, US 정규장 거래일당 1회)");
  const deps = tossRunDeps();
  const persist = prismaPersistence(db);
  while (true) {
    try {
      const tradeDate = await usRegularTradeDate();
      if (tradeDate) {
        const cycles = await db.infiniteBuyCycle.findMany({ where: { status: "active" } });
        for (const c of cycles) {
          if (c.lastRunDate === tradeDate) continue; // 거래일당 1회
          const config: CycleConfig = {
            id: c.id, symbol: c.symbol, accountSeq: c.accountSeq,
            principalUsd: c.principal, splits: c.splits, profitTarget: c.profitTarget,
            bigBuyPremium: c.bigBuyPremium, lossCut: c.lossCut, round: c.round, dryRun: c.dryRun,
          };
          try {
            const r = await runCycle(persist, deps, config, tradeDate, isKilled());
            console.log(`[infinite-buy] ${c.symbol} (${tradeDate}):`, r, c.dryRun ? "[dryRun]" : "[LIVE]");
          } catch (e) {
            console.error(`[infinite-buy] ${c.symbol} run failed:`, e);
          }
        }
      }
    } catch (e) {
      console.error("[infinite-buy-loop] iteration failed:", e);
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  }
}
```

- [ ] **Step 2: index.ts 등록**

`worker/index.ts`에서 import 추가(다른 import 옆):

```ts
import { infiniteBuyLoop } from "./infinite-buy-loop";
```

그리고 `etfPdfLoop().catch(...)` 블록 바로 아래에 추가:

```ts
  infiniteBuyLoop().catch((err) =>
    console.error("[worker] infinite-buy loop crashed:", err),
  );
```

- [ ] **Step 3: 타입 검증**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/worker/infinite-buy-loop.ts apps/company-map/worker/index.ts
git commit -m "feat(company-map): 무한매수법 무인 worker 루프"
```

---

## Task 6: 서버 액션

**Files:**
- Create: `src/actions/infinite-buy.ts`

- [ ] **Step 1: 구현**

`src/actions/infinite-buy.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getHoldings, getDefaultAccountSeq, isTossConfigured } from "@/lib/toss/client";
import { runCycle, type CycleConfig } from "@/lib/infinite-buy/run";
import { tossRunDeps, prismaPersistence, isKilled } from "@/lib/infinite-buy/toss-adapter";

export interface CycleView {
  id: string;
  symbol: string;
  name: string;
  status: string;
  dryRun: boolean;
  principal: number;
  splits: number;
  round: number;
  profitTarget: number;
  bigBuyPremium: number;
  lossCut: number;
  lastRunDate: string | null;
  // 라이브(토스) — 조회 실패 시 null
  avgPrice: number | null;
  holdingQty: number | null;
  pnlPct: number | null;
  targetSellPrice: number | null;
}

async function liveHoldingMap(): Promise<Map<string, { avg: number; qty: number; pnl: number }>> {
  const map = new Map<string, { avg: number; qty: number; pnl: number }>();
  if (!isTossConfigured()) return map;
  try {
    const accountSeq = await getDefaultAccountSeq();
    const overview = await getHoldings(accountSeq);
    for (const i of overview.items) {
      map.set(i.symbol, {
        avg: Number(i.averagePurchasePrice),
        qty: Number(i.quantity),
        pnl: Number(i.profitLoss.rate) * 100,
      });
    }
  } catch {
    /* 토스 조회 실패는 무시(라이브 필드 null) */
  }
  return map;
}

export async function listCycles(): Promise<CycleView[]> {
  const rows = await db.infiniteBuyCycle.findMany({ orderBy: { createdAt: "asc" } });
  const live = await liveHoldingMap();
  return rows.map((c) => {
    const h = live.get(c.symbol) ?? null;
    return {
      id: c.id, symbol: c.symbol, name: c.name, status: c.status, dryRun: c.dryRun,
      principal: c.principal, splits: c.splits, round: c.round, profitTarget: c.profitTarget,
      bigBuyPremium: c.bigBuyPremium, lossCut: c.lossCut, lastRunDate: c.lastRunDate,
      avgPrice: h?.avg ?? null, holdingQty: h?.qty ?? null, pnlPct: h?.pnl ?? null,
      targetSellPrice: h && h.avg > 0 ? Math.round(h.avg * (1 + c.profitTarget / 100) * 100) / 100 : null,
    };
  });
}

export async function createCycle(input: {
  symbol: string; name: string; principal: number;
  splits?: number; profitTarget?: number; bigBuyPremium?: number; lossCut?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false, reason: "심볼 필요" };
  if (!(input.principal > 0)) return { ok: false, reason: "원금은 0보다 커야 함" };
  const exists = await db.infiniteBuyCycle.findFirst({ where: { symbol, status: "active" } });
  if (exists) return { ok: false, reason: "이미 active 사이클이 있는 종목" };
  await db.infiniteBuyCycle.create({
    data: {
      symbol, name: input.name.trim() || symbol, principal: input.principal,
      splits: input.splits ?? 40, profitTarget: input.profitTarget ?? 10,
      bigBuyPremium: input.bigBuyPremium ?? 12, lossCut: input.lossCut ?? 10,
      dryRun: true, // 항상 dryRun으로 시작
    },
  });
  revalidatePath("/stocks/infinite-buy");
  return { ok: true };
}

export async function updateCycle(
  id: string,
  data: Partial<{ dryRun: boolean; status: string; principal: number; profitTarget: number; bigBuyPremium: number; lossCut: number }>,
): Promise<{ ok: boolean }> {
  await db.infiniteBuyCycle.update({ where: { id }, data });
  revalidatePath("/stocks/infinite-buy");
  return { ok: true };
}

export async function deleteCycle(id: string): Promise<{ ok: boolean }> {
  await db.infiniteBuyCycle.delete({ where: { id } }).catch(() => {});
  revalidatePath("/stocks/infinite-buy");
  return { ok: true };
}

export interface OrderView {
  id: string; tradeDate: string; round: number; side: string; kind: string;
  price: number | null; quantity: number; status: string; dryRun: boolean; error: string | null;
  createdAt: string;
}

export async function getCycleOrders(id: string, limit = 100): Promise<OrderView[]> {
  const rows = await db.infiniteBuyOrder.findMany({
    where: { cycleId: id }, orderBy: { createdAt: "desc" }, take: limit,
  });
  return rows.map((o) => ({
    id: o.id, tradeDate: o.tradeDate, round: o.round, side: o.side, kind: o.kind,
    price: o.price, quantity: o.quantity, status: o.status, dryRun: o.dryRun,
    error: o.error, createdAt: o.createdAt.toISOString(),
  }));
}

// 수동 트리거(검증용). lastRunDate 무시하고 1회 실행.
export async function runCycleNow(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isTossConfigured()) return { ok: false, reason: "토스 미설정" };
  const c = await db.infiniteBuyCycle.findUnique({ where: { id } });
  if (!c) return { ok: false, reason: "사이클 없음" };
  const config: CycleConfig = {
    id: c.id, symbol: c.symbol, accountSeq: c.accountSeq, principalUsd: c.principal,
    splits: c.splits, profitTarget: c.profitTarget, bigBuyPremium: c.bigBuyPremium,
    lossCut: c.lossCut, round: c.round, dryRun: c.dryRun,
  };
  const tradeDate = new Date().toISOString().slice(0, 10);
  await runCycle(prismaPersistence(db), tossRunDeps(), config, tradeDate, isKilled());
  revalidatePath("/stocks/infinite-buy");
  return { ok: true };
}
```

- [ ] **Step 2: 타입 검증**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/src/actions/infinite-buy.ts
git commit -m "feat(company-map): 무한매수법 서버 액션"
```

---

## Task 7: 대시보드 UI

**Files:**
- Create: `src/app/stocks/infinite-buy/page.tsx`
- Create: `src/app/stocks/infinite-buy/InfiniteBuyManager.tsx`

- [ ] **Step 1: 페이지(서버 컴포넌트)**

`src/app/stocks/infinite-buy/page.tsx`:

```tsx
import Link from "next/link";
import { listCycles } from "@/actions/infinite-buy";
import { InfiniteBuyManager } from "./InfiniteBuyManager";

export const dynamic = "force-dynamic";

export default async function InfiniteBuyPage() {
  const cycles = await listCycles();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/stocks" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← 전종목 조회
      </Link>
      <h1 className="mt-4 mb-2 text-xl font-bold">무한매수법 자동매매</h1>
      <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
        ⚠ 실제 토스 계좌에서 체결됩니다. 사이클은 dryRun(모의)으로 시작하며, 검증 후 LIVE로 전환하세요.
      </p>
      <InfiniteBuyManager cycles={cycles} />
    </main>
  );
}
```

- [ ] **Step 2: 클라이언트 컴포넌트**

`src/app/stocks/infinite-buy/InfiniteBuyManager.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCycle, updateCycle, deleteCycle, runCycleNow, getCycleOrders,
  type CycleView, type OrderView,
} from "@/actions/infinite-buy";

function usd(v: number | null): string {
  return v == null ? "—" : `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function pct(v: number | null): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function InfiniteBuyManager({ cycles }: { cycles: CycleView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<Record<string, OrderView[]>>({});

  const refresh = () => start(() => router.refresh());

  const onCreate = () =>
    start(async () => {
      setMsg(null);
      const r = await createCycle({ symbol, name, principal: Number(principal) });
      if (!r.ok) { setMsg(r.reason ?? "실패"); return; }
      setSymbol(""); setName(""); setPrincipal("");
      router.refresh();
    });

  const toggleDryRun = (c: CycleView) =>
    start(async () => {
      // dryRun → LIVE 전환 시 확인
      if (c.dryRun && !confirm(`${c.symbol}를 LIVE로 전환합니다. 실제 주문이 체결됩니다. 계속할까요?`)) return;
      await updateCycle(c.id, { dryRun: !c.dryRun });
      router.refresh();
    });

  const setStatus = (c: CycleView, status: string) =>
    start(async () => { await updateCycle(c.id, { status }); router.refresh(); });

  const remove = (c: CycleView) =>
    start(async () => {
      if (!confirm(`${c.symbol} 사이클을 삭제할까요? (주문 이력도 삭제)`)) return;
      await deleteCycle(c.id); router.refresh();
    });

  const runNow = (c: CycleView) =>
    start(async () => {
      if (!c.dryRun && !confirm(`${c.symbol} LIVE 즉시 실행 — 실제 주문이 들어갑니다. 계속할까요?`)) return;
      const r = await runCycleNow(c.id);
      setMsg(r.ok ? `${c.symbol} 실행됨` : (r.reason ?? "실패"));
      router.refresh();
    });

  const loadOrders = (c: CycleView) =>
    start(async () => {
      if (openOrders[c.id]) { setOpenOrders((p) => { const n = { ...p }; delete n[c.id]; return n; }); return; }
      const orders = await getCycleOrders(c.id);
      setOpenOrders((p) => ({ ...p, [c.id]: orders }));
    });

  return (
    <div className="space-y-6">
      {/* 등록 폼 */}
      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-2 text-sm font-semibold">새 사이클</h2>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">심볼(US)</span>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="TQQQ"
              className="w-28 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">종목명</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="(선택)"
              className="w-40 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">원금(USD)</span>
            <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="4000"
              className="w-28 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
          </label>
          <button onClick={onCreate} disabled={pending}
            className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50">
            추가 (dryRun)
          </button>
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
        </div>
        <p className="mt-1 text-xs text-gray-400">기본: 40분할 · 익절 +10% · 큰수 +12% · 손절 -10%. 모든 사이클은 dryRun으로 시작.</p>
      </section>

      {/* 사이클 목록 */}
      {cycles.length === 0 ? (
        <p className="text-sm text-gray-500">등록된 사이클이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {cycles.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <span className="font-mono text-xs text-gray-500">{c.symbol}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${c.dryRun
                    ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                    {c.dryRun ? "dryRun" : "LIVE"}
                  </span>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    {c.status}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <button onClick={() => toggleDryRun(c)} disabled={pending} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                    {c.dryRun ? "LIVE 전환" : "dryRun 전환"}
                  </button>
                  <button onClick={() => runNow(c)} disabled={pending} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">지금 실행</button>
                  {c.status === "active"
                    ? <button onClick={() => setStatus(c, "paused")} disabled={pending} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">일시정지</button>
                    : <button onClick={() => setStatus(c, "active")} disabled={pending} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">재개</button>}
                  <button onClick={() => remove(c)} disabled={pending} className="rounded border border-gray-300 px-2 py-1 text-red-600 hover:bg-red-50 dark:border-gray-700 dark:hover:bg-gray-800">삭제</button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <div><span className="text-gray-500">진행</span> {c.round}/{c.splits}</div>
                <div><span className="text-gray-500">원금</span> {usd(c.principal)}</div>
                <div><span className="text-gray-500">평단</span> {usd(c.avgPrice)}</div>
                <div><span className="text-gray-500">보유</span> {c.holdingQty ?? "—"}</div>
                <div><span className="text-gray-500">수익률</span> <span className={c.pnlPct == null ? "" : c.pnlPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>{pct(c.pnlPct)}</span></div>
                <div><span className="text-gray-500">목표매도</span> {usd(c.targetSellPrice)}</div>
                <div><span className="text-gray-500">마지막실행</span> {c.lastRunDate ?? "—"}</div>
              </div>

              <button onClick={() => loadOrders(c)} disabled={pending} className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400">
                {openOrders[c.id] ? "주문 이력 닫기" : "주문 이력 보기"}
              </button>
              {openOrders[c.id] && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-gray-500">
                      <th className="p-1">거래일</th><th className="p-1">회차</th><th className="p-1">종류</th>
                      <th className="p-1 text-right">가격</th><th className="p-1 text-right">수량</th><th className="p-1">상태</th>
                    </tr></thead>
                    <tbody>
                      {openOrders[c.id].length === 0 ? (
                        <tr><td colSpan={6} className="p-2 text-gray-500">주문 이력 없음</td></tr>
                      ) : openOrders[c.id].map((o) => (
                        <tr key={o.id} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="p-1">{o.tradeDate}</td>
                          <td className="p-1">{o.round}</td>
                          <td className="p-1">{o.side}/{o.kind}</td>
                          <td className="p-1 text-right">{o.price == null ? "MKT" : usd(o.price)}</td>
                          <td className="p-1 text-right">{o.quantity}</td>
                          <td className="p-1">{o.status}{o.error ? ` (${o.error})` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 타입 검증 + lint**

Run: `npx tsc --noEmit && npx eslint src/app/stocks/infinite-buy/page.tsx src/app/stocks/infinite-buy/InfiniteBuyManager.tsx`
Expected: tsc 0 errors. eslint: 신규 파일 에러 없음(기존 AppMenu set-state-in-effect 에러만 무시).

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/src/app/stocks/infinite-buy
git commit -m "feat(company-map): 무한매수법 대시보드 UI"
```

---

## Task 8: 메뉴 · 링크 · 최종 검증

**Files:**
- Modify: `src/components/layout/AppMenu.tsx`
- Modify: `src/app/stocks/page.tsx`

- [ ] **Step 1: 사이드바 메뉴 추가**

`src/components/layout/AppMenu.tsx`의 lucide import에 `Repeat` 추가:

```ts
  Star,
  Landmark,
  Repeat,
} from "lucide-react";
```

`{ key: "funds", ... }` 항목 바로 뒤(배열 닫기 `];` 앞)에 추가:

```ts
  {
    key: "infinite-buy",
    name: "무한매수법",
    description: "미국 3배 레버리지 무한매수 자동매매",
    path: "/stocks/infinite-buy",
    icon: Repeat,
  },
```

- [ ] **Step 2: /stocks 링크 추가**

`src/app/stocks/page.tsx`의 링크 묶음에서 VIP 펀드 링크 바로 뒤에 추가:

```tsx
            <Link href="/stocks/infinite-buy" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              무한매수법 →
            </Link>
```

- [ ] **Step 3: 전체 검증**

Run: `yarn vitest run src/lib/infinite-buy && npx tsc --noEmit`
Expected: 모든 무한매수 테스트 PASS, tsc 0 errors.

Run: `npx eslint src/components/layout/AppMenu.tsx src/app/stocks/page.tsx src/actions/infinite-buy.ts src/lib/infinite-buy/*.ts worker/infinite-buy-loop.ts`
Expected: 신규 파일 에러 없음(AppMenu의 기존 `react-hooks/set-state-in-effect`만 잔존).

- [ ] **Step 4: 수동 확인 (dev 서버 재시작 후)**

사용자에게 `nps dev` 재시작 요청 → `http://localhost:3004/stocks/infinite-buy` 접속:
- 사이클 등록(TQQQ, 원금 4000) → dryRun 배지로 생성 확인
- "지금 실행" → 주문 이력에 `simulated` 행 생성 확인(실제 주문 없음)
- 라이브 평단/수익률 표시(토스 보유 있으면)

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/components/layout/AppMenu.tsx apps/company-map/src/app/stocks/page.tsx
git commit -m "feat(company-map): 무한매수법 메뉴·링크 추가"
```

---

## 최종 검증 체크리스트

- [ ] `yarn vitest run src/lib/infinite-buy` — 전략·실행기 테스트 모두 통과
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] 변경 파일 eslint — 신규 에러 없음
- [ ] dryRun 사이클 "지금 실행" → `simulated` 주문만 로깅, 실제 주문 0
- [ ] 대시보드 렌더·등록·토글·삭제 동작
- [ ] (LIVE 전환 전) CLS(LOC) 소액 1회 실거래로 `timeInForce:"CLS"` 동작 검증 — **사용자 직접 수행**

## 안전 메모

- 모든 사이클 **dryRun 기본 ON**. LIVE 전환은 UI 2단계 confirm.
- 전역 킬스위치: `INFINITE_BUY_DISABLED=1` → live여도 전부 simulated.
- worker는 US 정규장 + 거래일당 1회만 실행(lastRunDate 멱등).
- `runCycleNow`(지금 실행)는 lastRunDate를 무시하므로 검증 외 LIVE에서 반복 호출 주의.
