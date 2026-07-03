# 무한매수법 V2.1 도입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 무한매수 자동매매(v1)를 그대로 유지하면서, 라오어 V2.1 매수·매도 로직을 사이클별로 선택 가능한 별도 전략 버전으로 추가한다.

**Architecture:** 신규 순수 코어 `computeDailyOrdersV21`를 추가하고(기존 `strategy.ts`는 불변), `CycleConfig.version`으로 실행기가 분기한다. 가용금액 체크·dryRun/killed·제출·로깅·round/리셋·avgCost·체결동기화 등 모든 안전장치와 UI/이력은 공유·재사용. 스키마는 `version` 컬럼 1개만 추가.

**Tech Stack:** Next.js 16 App Router, Prisma(SQLite `@prisma-clients/company-map`), Vitest, tsx worker, 토스 Open API. LOC=`LIMIT+CLS`, 지정가=`LIMIT+DAY`.

**Spec:** `docs/superpowers/specs/2026-07-04-infinite-buy-v2.1-design.html` · **규칙:** `...-v2.1-reference.html`

> 작업 디렉터리: `apps/company-map`. lint는 변경 파일만 `npx eslint <files>`. Prisma 스키마 변경 후 dev 서버·worker 재시작 필요(사용자). worker는 정확히 1개만. 실주문 유발 동작(worker 시작)은 하지 말 것.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/infinite-buy/strategy-v21.ts` (신규) | V2.1 순수 코어 `computeDailyOrdersV21` |
| `src/lib/infinite-buy/strategy-v21.test.ts` (신규) | V2.1 코어 Vitest |
| `src/lib/infinite-buy/run.ts` (수정) | `CycleConfig.version` + 버전 분기 |
| `prisma/schema.prisma` (수정) | `InfiniteBuyCycle.version` 컬럼 |
| `worker/infinite-buy-loop.ts` (수정) | config에 version 전달 |
| `src/actions/infinite-buy.ts` (수정) | createCycle version 파라미터, CycleView.version, runCycleNow config |
| `src/app/stocks/infinite-buy/InfiniteBuyManager.tsx` (수정) | 버전 선택 UI + 배지 |

---

## Task 1: V2.1 전략 코어 (순수 함수) — TDD

**Files:**
- Create: `src/lib/infinite-buy/strategy-v21.ts`
- Test: `src/lib/infinite-buy/strategy-v21.test.ts`

> `strategy.ts`(v1)의 타입을 재사용: `CycleState`, `IntendedOrder`, `DailyPlan`. `OrderKind`는 v1이 유니온이라 신규 매도 kind를 위해 v21 코어는 `IntendedOrder`의 `kind`를 `string`으로 넓혀 반환한다(아래 로컬 타입 사용).

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/infinite-buy/strategy-v21.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDailyOrdersV21, type V21Order } from "./strategy-v21";
import type { CycleState } from "./strategy";

const base: CycleState = {
  round: 0, splits: 40, principalUsd: 4000,
  profitTarget: 10, bigBuyPremium: 12, lossCut: 10,
  avgPrice: null, currentPrice: 50, holdingQty: 0, pnlPct: null,
};
const kinds = (os: V21Order[]) => os.map((o) => o.kind);

describe("computeDailyOrdersV21 매수", () => {
  it("1회차: 시장가 매수로 시작", () => {
    const p = computeDailyOrdersV21(base);
    expect(p.orders).toEqual([
      { side: "BUY", kind: "first_market", orderType: "MARKET", tif: "DAY", price: null, quantity: 2 },
    ]); // daily=100, floor(100/50)=2
    expect(p.nextRound).toBe(1);
  });

  it("전반전 매수: 평단 LOC + 큰수(평단×1.05) LOC", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 1, principalUsd: 8000, avgPrice: 50, currentPrice: 50, holdingQty: 4,
    });
    // daily=200, half=100. loc_avg floor(100/50)=2 @50. capBig=52.5 → floor(100/52.5)=1 @52.5
    const buys = p.orders.filter((o) => o.side === "BUY");
    expect(buys).toEqual([
      { side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 2 },
      { side: "BUY", kind: "loc_big", orderType: "LIMIT", tif: "CLS", price: 52.5, quantity: 1 },
    ]);
  });

  it("큰수매수 상한: 현재가가 평단보다 높아도 주문가는 평단×1.05 고정", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 1, principalUsd: 8000, avgPrice: 50, currentPrice: 80, holdingQty: 4,
    });
    const big = p.orders.find((o) => o.kind === "loc_big");
    expect(big?.price).toBe(52.5); // 현재가 80과 무관
  });

  it("후반전 매수: 1회치 전액 평단 LOC (큰수 없음)", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 20, principalUsd: 8000, avgPrice: 50, currentPrice: 50, holdingQty: 100,
    });
    const buys = p.orders.filter((o) => o.side === "BUY");
    // daily=200, floor(200/50)=4 @50
    expect(buys).toEqual([
      { side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 4 },
    ]);
  });
});

describe("computeDailyOrdersV21 매도", () => {
  it("전반전 매도: 25% LOC@+5% + 75% 지정가@+10%", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 1, avgPrice: 50, currentPrice: 50, holdingQty: 100,
    });
    const sells = p.orders.filter((o) => o.side === "SELL");
    expect(sells).toEqual([
      { side: "SELL", kind: "sell_loc_5", orderType: "LIMIT", tif: "CLS", price: 52.5, quantity: 25 },
      { side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 75 },
    ]);
  });

  it("후반전 매도: 25% LOC@평단 + 25% 지정가@+5% + 50% 지정가@+10%", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 20, avgPrice: 50, currentPrice: 50, holdingQty: 200,
    });
    const sells = p.orders.filter((o) => o.side === "SELL");
    expect(sells).toEqual([
      { side: "SELL", kind: "sell_loc_0", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 50 },
      { side: "SELL", kind: "sell_lim_5", orderType: "LIMIT", tif: "DAY", price: 52.5, quantity: 50 },
      { side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: 55, quantity: 100 },
    ]);
  });

  it("정수 반올림: 합계는 항상 보유수량", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 20, avgPrice: 50, currentPrice: 50, holdingQty: 7,
    });
    const sells = p.orders.filter((o) => o.side === "SELL");
    // q0=floor(7*.25)=1, q5=floor(7*.25)=1, q10=7-1-1=5
    expect(sells.reduce((a, o) => a + o.quantity, 0)).toBe(7);
    expect(sells.find((o) => o.kind === "sell_lim_10")?.quantity).toBe(5);
  });

  it("소진 후 -10% 이하: 시장가 전량 손절 + 리셋 (v1과 동일)", () => {
    const p = computeDailyOrdersV21({
      ...base, round: 40, avgPrice: 50, currentPrice: 44, holdingQty: 80, pnlPct: -12,
    });
    expect(p.orders).toEqual([
      { side: "SELL", kind: "reset_sell", orderType: "MARKET", tif: "DAY", price: null, quantity: 80 },
    ]);
    expect(p.resetAfter).toBe(true);
  });

  it("소진 후 보유 0: 익절 완료로 리셋", () => {
    const p = computeDailyOrdersV21({ ...base, round: 40, holdingQty: 0, avgPrice: null });
    expect(p.orders).toEqual([]);
    expect(p.resetAfter).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map && yarn vitest run src/lib/infinite-buy/strategy-v21.test.ts`
Expected: FAIL (`computeDailyOrdersV21` not found)

- [ ] **Step 3: 구현**

`src/lib/infinite-buy/strategy-v21.ts`:

```ts
// 라오어 무한매수법 V2.1 일일 주문 계산. 순수 함수(토스 의존 없음).
// v1(strategy.ts)과 별개 코어. 전반/후반 = round < splits/2 / >= splits/2.
import type { CycleState } from "./strategy";

// v21 전용 kind (매도 세분화). v1 IntendedOrder.kind는 유니온이라 여기선 string으로 넓힘.
export interface V21Order {
  side: "BUY" | "SELL";
  kind:
    | "first_market" | "loc_avg" | "loc_big"
    | "sell_loc_5" | "sell_lim_10" | "sell_loc_0" | "sell_lim_5"
    | "reset_sell";
  orderType: "LIMIT" | "MARKET";
  tif: "CLS" | "DAY";
  price: number | null;
  quantity: number;
}

export interface V21Plan {
  orders: V21Order[];
  nextRound: number;
  resetAfter: boolean;
}

const px = (v: number): number => Math.round(v * 100) / 100;

export function computeDailyOrdersV21(s: CycleState): V21Plan {
  const daily = s.principalUsd / s.splits;
  const secondHalf = s.round >= s.splits / 2;
  const orders: V21Order[] = [];
  let nextRound = s.round;
  let resetAfter = false;

  if (s.round < s.splits) {
    // ── 매수 ──
    if (s.round === 0) {
      const qty = Math.floor(daily / s.currentPrice);
      if (qty >= 1) {
        orders.push({ side: "BUY", kind: "first_market", orderType: "MARKET", tif: "DAY", price: null, quantity: qty });
      }
    } else if (s.avgPrice && s.avgPrice > 0) {
      if (!secondHalf) {
        // 전반: 0.5회치 평단 LOC + 0.5회치 평단×1.05 LOC
        const half = daily / 2;
        const qAvg = Math.floor(half / s.avgPrice);
        if (qAvg >= 1) orders.push({ side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: px(s.avgPrice), quantity: qAvg });
        const capBig = s.avgPrice * 1.05; // 큰수 상한 = 평단+5% (현재가 무관, 고정)
        const qBig = Math.floor(half / capBig);
        if (qBig >= 1) orders.push({ side: "BUY", kind: "loc_big", orderType: "LIMIT", tif: "CLS", price: px(capBig), quantity: qBig });
      } else {
        // 후반: 1회치 전액 평단 LOC
        const qAvg = Math.floor(daily / s.avgPrice);
        if (qAvg >= 1) orders.push({ side: "BUY", kind: "loc_avg", orderType: "LIMIT", tif: "CLS", price: px(s.avgPrice), quantity: qAvg });
      }
    }
    nextRound = s.round + 1;

    // ── 매도 (보유 > 0) ──
    if (s.holdingQty > 0 && s.avgPrice && s.avgPrice > 0) {
      orders.push(...sellTranches(s, secondHalf));
    }
  } else {
    // ── 원금소진 후 (v1과 동일) ──
    if (s.holdingQty <= 0) {
      resetAfter = true;
    } else if (s.pnlPct != null && s.pnlPct <= -s.lossCut) {
      orders.push({ side: "SELL", kind: "reset_sell", orderType: "MARKET", tif: "DAY", price: null, quantity: s.holdingQty });
      resetAfter = true;
    } else if (s.avgPrice && s.avgPrice > 0) {
      orders.push(...sellTranches(s, secondHalf));
    }
  }

  return { orders, nextRound, resetAfter };
}

// 전체 보유수량을 분할. 정수 반올림: 작은 구간 floor, 나머지를 +10%에. qty 0은 생략.
function sellTranches(s: CycleState, secondHalf: boolean): V21Order[] {
  const N = s.holdingQty;
  const avg = s.avgPrice as number;
  const out: V21Order[] = [];
  if (!secondHalf) {
    const q5 = Math.floor(N * 0.25);
    const q10 = N - q5;
    if (q5 >= 1) out.push({ side: "SELL", kind: "sell_loc_5", orderType: "LIMIT", tif: "CLS", price: px(avg * 1.05), quantity: q5 });
    if (q10 >= 1) out.push({ side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: px(avg * 1.10), quantity: q10 });
  } else {
    const q0 = Math.floor(N * 0.25);
    const q5 = Math.floor(N * 0.25);
    const q10 = N - q0 - q5;
    if (q0 >= 1) out.push({ side: "SELL", kind: "sell_loc_0", orderType: "LIMIT", tif: "CLS", price: px(avg), quantity: q0 });
    if (q5 >= 1) out.push({ side: "SELL", kind: "sell_lim_5", orderType: "LIMIT", tif: "DAY", price: px(avg * 1.05), quantity: q5 });
    if (q10 >= 1) out.push({ side: "SELL", kind: "sell_lim_10", orderType: "LIMIT", tif: "DAY", price: px(avg * 1.10), quantity: q10 });
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd .../apps/company-map && yarn vitest run src/lib/infinite-buy/strategy-v21.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/lib/infinite-buy/strategy-v21.ts apps/company-map/src/lib/infinite-buy/strategy-v21.test.ts
git commit -m "feat(company-map): 무한매수법 V2.1 전략 코어 + 테스트"
```

---

## Task 2: 실행기 버전 분기 (run.ts)

**Files:**
- Modify: `src/lib/infinite-buy/run.ts`

- [ ] **Step 1: import에 v21 코어 추가**

`src/lib/infinite-buy/run.ts` 최상단 import 교체:

```ts
import { computeDailyOrders, type CycleState, type IntendedOrder } from "./strategy";
import { computeDailyOrdersV21 } from "./strategy-v21";
```

- [ ] **Step 2: CycleConfig에 version 추가**

`CycleConfig` 인터페이스의 `dryRun: boolean;` 아래에 필드 추가:

```ts
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
  version: "v1" | "v2.1";
}
```

- [ ] **Step 3: computeDailyOrders 호출을 버전 분기로 교체**

`run.ts`에서 다음 줄을 찾는다:

```ts
  const plan = computeDailyOrders(state);
```

다음으로 교체:

```ts
  const plan =
    cycle.version === "v2.1"
      ? computeDailyOrdersV21(state)
      : computeDailyOrders(state);
```

> `computeDailyOrdersV21`의 반환 `V21Order[]`는 `IntendedOrder`와 구조가 동일하고 `kind`만 더 넓다. 이후 코드는 `o.side`, `o.kind`(string으로 사용), `o.orderType`, `o.price`, `o.quantity`, `o.tif`만 참조하므로 그대로 호환된다. tsc가 `kind` 타입 불일치를 지적하면, `OrderLog.kind`가 이미 `string`이므로 문제 없다. 만약 `plan.orders` 배열 타입 불일치 에러가 나면 분기 결과를 `const plan: { orders: IntendedOrder[]; nextRound: number; resetAfter: boolean } = ...`로 캐스팅하지 말고, `computeDailyOrdersV21` 반환을 `as unknown as DailyPlan`으로 좁히기보다 — 아래 Step 4의 타입 확인에서 실제 에러 메시지를 보고 최소 수정한다.

- [ ] **Step 4: 타입 확인 + v1 회귀 테스트**

Run: `cd .../apps/company-map && npx tsc --noEmit`
Expected: 0 errors. (에러 시: `run.test.ts`의 fake CycleConfig에 `version` 누락일 수 있음 → Step 5에서 해결. `plan.orders`의 kind 유니온 불일치면, `run.ts`가 kind를 string으로만 쓰므로 `IntendedOrder`/`V21Order`를 공용화하기 위해 `strategy-v21.ts`의 `V21Order`를 `run.ts`가 받도록 `computeDailyOrders` 반환도 호환됨 — 실제 에러 메시지 기준 최소 수정.)

- [ ] **Step 5: run.test.ts의 CycleConfig에 version 추가**

`src/lib/infinite-buy/run.test.ts`에서 `const cycle: CycleConfig = {` 객체에 `version: "v1",`를 추가한다(기존 필드 뒤, `dryRun: true,` 다음 줄):

```ts
const cycle: CycleConfig = {
  id: "c1", symbol: "TQQQ", accountSeq: 7,
  principalUsd: 4000, splits: 40, profitTarget: 10, bigBuyPremium: 12, lossCut: 10,
  round: 0, dryRun: true, version: "v1",
};
```

- [ ] **Step 6: 전체 무한매수 테스트 통과 확인**

Run: `cd .../apps/company-map && yarn vitest run src/lib/infinite-buy && npx tsc --noEmit`
Expected: 모든 테스트 PASS(기존 15 + v21 10 = 25), tsc 0 errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/lib/infinite-buy/run.ts apps/company-map/src/lib/infinite-buy/run.test.ts
git commit -m "feat(company-map): 무한매수 실행기 버전 분기(v1/v2.1)"
```

---

## Task 3: Prisma version 컬럼 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: version 필드 추가**

`prisma/schema.prisma`의 `model InfiniteBuyCycle {` 안에서 `dryRun Boolean @default(true) @map("dry_run")` 줄 바로 아래에 추가:

```prisma
  version       String   @default("v1")          // "v1" | "v2.1"
```

- [ ] **Step 2: 마이그레이션 + 생성**

Run: `cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map && yarn prisma migrate dev --name add_cycle_version`
Expected: `Applying migration ... add_cycle_version` + `Generated Prisma Client`

- [ ] **Step 3: 컬럼 확인**

Run: `cd .../apps/company-map && sqlite3 data/company-map.db "PRAGMA table_info(infinite_buy_cycles);" | grep version`
Expected: `version` 컬럼 존재(default 'v1')

- [ ] **Step 4: dev 서버 재시작 안내**

사용자에게 `nps dev` + worker 재시작 안내(globalThis PrismaClient 캐시). 이 태스크에선 재시작하지 말 것.

- [ ] **Step 5: Commit**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "feat(company-map): InfiniteBuyCycle.version 컬럼 추가"
```

---

## Task 4: worker · 서버액션에 version 배선

**Files:**
- Modify: `worker/infinite-buy-loop.ts`
- Modify: `src/actions/infinite-buy.ts`

- [ ] **Step 1: worker config에 version 전달**

`worker/infinite-buy-loop.ts`에서 `const config: CycleConfig = {` 블록을 찾는다. 현재:

```ts
          const config: CycleConfig = {
            id: c.id, symbol: c.symbol, accountSeq: c.accountSeq,
            principalUsd: c.principal, splits: c.splits, profitTarget: c.profitTarget,
            bigBuyPremium: c.bigBuyPremium, lossCut: c.lossCut, round: c.round, dryRun: c.dryRun,
          };
```

`dryRun: c.dryRun,` 뒤에 `version: c.version as "v1" | "v2.1",`를 추가:

```ts
          const config: CycleConfig = {
            id: c.id, symbol: c.symbol, accountSeq: c.accountSeq,
            principalUsd: c.principal, splits: c.splits, profitTarget: c.profitTarget,
            bigBuyPremium: c.bigBuyPremium, lossCut: c.lossCut, round: c.round, dryRun: c.dryRun,
            version: c.version as "v1" | "v2.1",
          };
```

- [ ] **Step 2: runCycleNow config에 version 전달**

`src/actions/infinite-buy.ts`의 `runCycleNow`에서 `const config: CycleConfig = {` 블록을 찾는다:

```ts
  const config: CycleConfig = {
    id: c.id, symbol: c.symbol, accountSeq: c.accountSeq, principalUsd: c.principal,
    splits: c.splits, profitTarget: c.profitTarget, bigBuyPremium: c.bigBuyPremium,
    lossCut: c.lossCut, round: c.round, dryRun: c.dryRun,
  };
```

`dryRun: c.dryRun,` 뒤에 `version: c.version as "v1" | "v2.1",` 추가:

```ts
  const config: CycleConfig = {
    id: c.id, symbol: c.symbol, accountSeq: c.accountSeq, principalUsd: c.principal,
    splits: c.splits, profitTarget: c.profitTarget, bigBuyPremium: c.bigBuyPremium,
    lossCut: c.lossCut, round: c.round, dryRun: c.dryRun,
    version: c.version as "v1" | "v2.1",
  };
```

- [ ] **Step 3: createCycle에 version 파라미터**

`src/actions/infinite-buy.ts`의 `createCycle` 시그니처와 create data를 수정한다. 현재:

```ts
export async function createCycle(input: {
  symbol: string; name: string; principal: number;
  splits?: number; profitTarget?: number; bigBuyPremium?: number; lossCut?: number;
}): Promise<{ ok: boolean; reason?: string }> {
```

교체:

```ts
export async function createCycle(input: {
  symbol: string; name: string; principal: number;
  splits?: number; profitTarget?: number; bigBuyPremium?: number; lossCut?: number;
  version?: "v1" | "v2.1";
}): Promise<{ ok: boolean; reason?: string }> {
```

그리고 create data의 `dryRun: true, // 항상 dryRun으로 시작` 줄 앞에 `version` 추가:

```ts
      bigBuyPremium: input.bigBuyPremium ?? 12, lossCut: input.lossCut ?? 10,
      version: input.version === "v2.1" ? "v2.1" : "v1",
      dryRun: true, // 항상 dryRun으로 시작
```

- [ ] **Step 4: CycleView에 version 추가**

`src/actions/infinite-buy.ts`의 `export interface CycleView {` 에 `dryRun: boolean;` 아래로 `version: string;` 추가. 그리고 `listCycles`의 map 반환 객체에서 `dryRun: c.dryRun,` 뒤에 `version: c.version,` 추가.

찾을 반환 블록(대략):
```ts
      id: c.id, symbol: c.symbol, name: c.name, status: c.status, dryRun: c.dryRun,
      principal: c.principal, splits: c.splits, round: c.round, profitTarget: c.profitTarget,
```
교체:
```ts
      id: c.id, symbol: c.symbol, name: c.name, status: c.status, dryRun: c.dryRun,
      version: c.version,
      principal: c.principal, splits: c.splits, round: c.round, profitTarget: c.profitTarget,
```

- [ ] **Step 5: 타입 확인**

Run: `cd .../apps/company-map && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/worker/infinite-buy-loop.ts apps/company-map/src/actions/infinite-buy.ts
git commit -m "feat(company-map): 무한매수 version 배선(worker·액션)"
```

---

## Task 5: UI — 버전 선택 + 배지

**Files:**
- Modify: `src/app/stocks/infinite-buy/InfiniteBuyManager.tsx`

- [ ] **Step 1: version 상태 추가**

`InfiniteBuyManager` 컴포넌트 안, `const [principal, setPrincipal] = useState("");` 아래에 추가:

```ts
  const [version, setVersion] = useState<"v1" | "v2.1">("v1");
```

- [ ] **Step 2: createCycle 호출에 version 전달 + 초기화**

`onCreate` 안의 다음 줄을 찾는다:

```ts
      const r = await createCycle({ symbol, name, principal: Number(principal) });
```

교체:

```ts
      const r = await createCycle({ symbol, name, principal: Number(principal), version });
```

그리고 같은 함수의 초기화 줄 `setSymbol(""); setName(""); setPrincipal("");`을 다음으로:

```ts
      setSymbol(""); setName(""); setPrincipal(""); setVersion("v1");
```

- [ ] **Step 3: 등록 폼에 버전 선택 추가**

등록 폼에서 원금(USD) 입력 `<label>` 블록을 찾는다:

```tsx
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">원금(USD)</span>
            <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="4000"
              className="w-28 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
          </label>
```

그 `</label>` 바로 뒤에 버전 선택 label 추가:

```tsx
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">전략</span>
            <select value={version} onChange={(e) => setVersion(e.target.value as "v1" | "v2.1")}
              className="w-28 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
              <option value="v1">v1</option>
              <option value="v2.1">v2.1</option>
            </select>
          </label>
```

- [ ] **Step 4: 사이클 카드에 버전 배지**

카드 헤더에서 dryRun 배지 `<span>` 다음, status 배지 앞(또는 뒤)에 버전 배지를 추가한다. status 배지 블록을 찾는다:

```tsx
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    {c.status}
                  </span>
```

그 바로 뒤에 추가:

```tsx
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                    {c.version}
                  </span>
```

- [ ] **Step 5: 타입 확인 + lint**

Run: `cd .../apps/company-map && npx tsc --noEmit && npx eslint src/app/stocks/infinite-buy/InfiniteBuyManager.tsx`
Expected: tsc 0 errors. eslint: 이 파일 신규 에러 없음.

- [ ] **Step 6: Commit**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/app/stocks/infinite-buy/InfiniteBuyManager.tsx
git commit -m "feat(company-map): 무한매수 대시보드 버전 선택·배지(v1/v2.1)"
```

---

## Task 6: 최종 검증

- [ ] **Step 1: 전체 검증**

Run: `cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map && yarn vitest run src/lib/infinite-buy && npx tsc --noEmit`
Expected: 25 tests PASS(15 v1 + 10 v21), tsc 0 errors.

Run: `npx eslint src/lib/infinite-buy/strategy-v21.ts src/lib/infinite-buy/run.ts src/actions/infinite-buy.ts worker/infinite-buy-loop.ts src/app/stocks/infinite-buy/InfiniteBuyManager.tsx`
Expected: 신규 에러 없음.

- [ ] **Step 2: 수동 확인 (사용자, dev 서버·worker 재시작 후)**

- 사이클 등록 시 전략 v2.1 선택 → 카드에 v2.1 배지, dryRun 배지 확인.
- "지금 실행"(dryRun) → 주문 이력에 v2.1 규칙대로 `simulated` 로깅(전반: loc_avg/loc_big/sell_loc_5/sell_lim_10 등).
- LIVE 검증(소액): 후반전 3건 동시 매도가 Toss에 접수되는지.

---

## 최종 체크리스트

- [ ] v21 코어 10 테스트 + v1 15 테스트 모두 통과
- [ ] tsc 0 errors, 변경 파일 lint 신규 에러 없음
- [ ] 기존 v1 사이클 동작 회귀 없음(기본 version="v1")
- [ ] 큰수매수 주문가 = 평단×1.05 고정(현재가 무관) — 테스트로 보장
- [ ] 매도 분할 합계 = 보유수량(정수 반올림) — 테스트로 보장
- [ ] 손절/리셋 = v1과 동일(쿼터손절 없음)

## 주의

- worker 시작(실주문 유발)은 구현자가 하지 말 것 — 사용자가 재시작·검증.
- 스키마 변경(Task 3) 후 dev 서버·worker 재시작 필요.
- 후반전 동시 다중 매도 수용은 문서 미명시 → LIVE 소액 검증으로 확정.
