# 무한매수법 V4.0 일반모드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** company-map 무한매수 자동매매에 V4.0 일반모드(연속 T·잔금 영속화·체결 동기화 기반)를 별도 버전 `"v4.0"`으로 추가한다. 기존 v1·v2.2 경로는 무변경.

**Architecture:** 순수 전략 코어(`strategy-v4.ts`) + 체결 적용 순수 로직(`sync.ts`) + 오케스트레이터(`run-v4.ts`, sync→apply→check→compute→submit 순서 강제)로 구성. 상태(연속 T·잔금)는 `InfiniteBuyCycle`의 nullable 필드로 영속화하고, **상태 갱신은 체결(실제/가상) 반영으로만** 일어난다. dryRun은 전일 일봉으로 가상 체결을 판정해 라이브와 동일한 적용 경로를 탄다.

**Tech Stack:** Next.js 16 App Router / Prisma(SQLite, 별도 클라이언트 `@prisma-clients/company-map`) / Vitest / 토스증권 Open API(`src/lib/toss/client.ts`) / tsx worker

**스펙:** `docs/superpowers/specs/2026-07-13-infinite-buy-v4.0-normal-mode-design.html` (승인됨)

## Global Constraints

- **기존 v1·v2.2 코드 경로 무변경** — `strategy.ts`·`strategy-v22.ts`는 손대지 않는다. `run.ts`의 기존 분기도 그대로.
- **실주문 검증 금지** — 어떤 검증 단계에서도 LIVE 주문을 넣지 않는다. 신규 사이클은 항상 `dryRun: true`.
- **워크스페이스 lint는 게이트 불가** (기존 에러로 항상 exit 1) — 변경 파일만 `npx eslint <files>`로 검증.
- **테스트 실행**: `yarn workspace company-map vitest run <파일>` (단일) / `yarn workspace company-map test` (전체).
- **dev 서버를 백그라운드로 띄우지 말 것** — 3004는 사용자의 `nps dev`(turbo)가 관리.
- **Prisma generate 후 dev 서버·worker 재시작 필수** — `src/lib/db.ts`가 globalThis에 PrismaClient 캐싱. 재시작은 마지막 태스크에서 사용자에게 안내(직접 죽이지 말 것).
- 커밋 메시지는 `feat(company-map): …` 형식 + 마지막 줄에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 가격 반올림은 소수 2자리 `px()`(Math.round). 미국 주식 호가 1센트.
- V4 미확정 규칙 확정치(스펙 승인 사항): ΔT는 주문 단위 비례(전반 leg=0.5·후반/첫매수=1 가중 × 체결비율), 매도 배수는 부분체결이어도 전량 기준(쿼터 ×0.75, 지정가 ×0.25), 같은 거래일 적용 순서 `sell_lim_target → sell_loc_star → 매수`.

---

### Task 0: 기존 작업 트리 WIP 분리 커밋

v4 커밋을 깨끗하게 유지하기 위해, 이전 세션의 미커밋 변경(v1·v2.2 보유0 리셋 가드 + 누적 실현수익 표시)을 먼저 별도 커밋한다.

**Files:**
- Commit only (수정 없음): `apps/company-map/src/lib/infinite-buy/strategy.ts`, `strategy-v22.ts`, `strategy.test.ts`, `strategy-v22.test.ts`, `apps/company-map/src/actions/infinite-buy.ts`, `apps/company-map/src/app/stocks/infinite-buy/InfiniteBuyManager.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: 깨끗한 작업 트리 (이후 태스크의 diff가 v4 변경만 포함)

- [ ] **Step 1: 기존 테스트 전체 통과 확인**

Run: `yarn workspace company-map test`
Expected: 전체 PASS (strategy/strategy-v22/run/rsi/toss-adapter 테스트 포함)

- [ ] **Step 2: WIP 커밋**

```bash
git add apps/company-map/src/lib/infinite-buy/strategy.ts apps/company-map/src/lib/infinite-buy/strategy-v22.ts apps/company-map/src/lib/infinite-buy/strategy.test.ts apps/company-map/src/lib/infinite-buy/strategy-v22.test.ts apps/company-map/src/actions/infinite-buy.ts apps/company-map/src/app/stocks/infinite-buy/InfiniteBuyManager.tsx
git commit -m "feat(company-map): 무한매수 사이클 중간 보유0 자동리셋 + 누적 실현수익 표시

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

`apps/api/data/all_safety_margin_results.json`(무관한 데이터 갱신)과 `.recall/`, `docs/` 신규 파일은 커밋하지 않는다.

---

### Task 1: Prisma 스키마 확장 + 마이그레이션

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma` (InfiniteBuyCycle 411-432행, InfiniteBuyOrder 434-459행 부근)

**Interfaces:**
- Consumes: 없음
- Produces: `InfiniteBuyCycle.tValue: Float?`, `.cashRemaining: Float?`, `.starBase: Float?`, `.note: String?` / `InfiniteBuyOrder.stateApplied: Boolean?` — 이후 모든 태스크가 이 컬럼명을 사용

- [ ] **Step 1: 스키마 수정**

`model InfiniteBuyCycle`의 `round Int @default(0)` 아래에 추가:

```prisma
  // ── v4.0 전용 상태 (v1/v2.2에선 null) ──
  tValue        Float?   @map("t_value")         // 연속 T (체결 반영으로만 갱신)
  cashRemaining Float?   @map("cash_remaining")  // 잔금(USD). 생성 시 principal
  starBase      Float?   @map("star_base")       // 별% base = 지정가매도 % (TQQQ 15 / SOXL 20)
  note          String?                          // 마지막 경고/보류 사유 (대시보드 배지)
```

`model InfiniteBuyOrder`의 `tossOrderId String? @map("toss_order_id")` 아래에 추가:

```prisma
  stateApplied Boolean? @map("state_applied")    // v4: 이 체결이 T/잔금에 반영됐는지(멱등 마커)
```

- [ ] **Step 2: 마이그레이션 + 클라이언트 생성**

Run: `yarn workspace company-map prisma migrate dev --name infinite_buy_v4_state`
Expected: `Your database is now in sync with your schema.` + generate 완료. 기존 행 영향 없음(전부 nullable).

- [ ] **Step 3: 스키마 검증**

Run: `yarn workspace company-map prisma validate`
Expected: `The schema ... is valid`

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/prisma
git commit -m "feat(company-map): 무한매수 v4 스키마 - 연속T·잔금·starBase·note·stateApplied

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 코어 전략 `strategy-v4.ts` (TDD)

**Files:**
- Create: `apps/company-map/src/lib/infinite-buy/strategy-v4.ts`
- Test: `apps/company-map/src/lib/infinite-buy/strategy-v4.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수, 토스/DB 의존 없음)
- Produces (이후 태스크가 사용하는 정확한 시그니처):

```ts
export const px: (v: number) => number;                                  // 소수 2자리
export const starPct: (t: number, splits: number, base: number) => number;
export interface V4State {
  t: number; splits: number; cash: number; starBase: number; bigBuyPremium: number;
  avgPrice: number | null; currentPrice: number; holdingQty: number;
}
export type V4OrderKind =
  | "first_big_loc"   // 첫매수 큰수 LOC (ΔT 가중 1)
  | "loc_star_half"   // 전반 ½ @매수점 (0.5)
  | "loc_avg_half"    // 전반 ½ @평단 (0.5)
  | "loc_star_full"   // 후반 전액 @매수점 (1)
  | "sell_loc_star"   // 쿼터 ¼ LOC @별지점 (T×0.75)
  | "sell_lim_target";// ¾ 지정가 @평단+starBase% (T×0.25)
export interface V4Order {
  side: "BUY" | "SELL"; kind: V4OrderKind; orderType: "LIMIT";
  tif: "CLS" | "DAY"; price: number; quantity: number;
}
export interface V4Plan { orders: V4Order[]; exhausted: boolean; blocked: string | null; }
export function computeDailyOrdersV4(s: V4State): V4Plan;
```

- [ ] **Step 1: 실패하는 테스트 작성**

`strategy-v4.test.ts` 전체 내용 (레퍼런스 부록 A 수치로 검증):

```ts
import { describe, it, expect } from "vitest";
import { computeDailyOrdersV4, starPct, px, type V4State } from "./strategy-v4";

// 부록 A 앵커: $10,000 · 40분할 · TQQQ(base 15) · 평단 $50
const base: V4State = {
  t: 0, splits: 40, cash: 10000, starBase: 15, bigBuyPremium: 12,
  avgPrice: null, currentPrice: 50, holdingQty: 0,
};
const buys = (p: { orders: { side: string }[] }) => p.orders.filter((o) => o.side === "BUY");
const sells = (p: { orders: { side: string }[] }) => p.orders.filter((o) => o.side === "SELL");

describe("starPct / px", () => {
  it("별% = base×(1−2T/분할): 검증점 T=1→14.25, T=20→0, T=39→−14.25", () => {
    expect(starPct(1, 40, 15)).toBeCloseTo(14.25, 10);
    expect(starPct(20, 40, 15)).toBeCloseTo(0, 10);
    expect(starPct(39, 40, 15)).toBeCloseTo(-14.25, 10);
  });
  it("SOXL 20분할 원문 예: T=8.6 → 2.8%", () => {
    expect(starPct(8.6, 20, 20)).toBeCloseTo(2.8, 10);
  });
  it("px: 반올림 소수 2자리", () => {
    expect(px(57.125)).toBe(57.13);
    expect(px(42.875)).toBe(42.88);
  });
});

describe("computeDailyOrdersV4 매수", () => {
  it("첫매수(T=0, 보유0): 큰수 LOC 종가+12%, 수량 floor(1회금/리밋)", () => {
    const p = computeDailyOrdersV4(base);
    // perBuy=10000/40=250, limit=px(50*1.12)=56.00, floor(250/56)=4
    expect(p.orders).toEqual([
      { side: "BUY", kind: "first_big_loc", orderType: "LIMIT", tif: "CLS", price: 56, quantity: 4 },
    ]);
    expect(p.exhausted).toBe(false);
    expect(p.blocked).toBeNull();
  });

  it("전반전(T=1): ½ @매수점(별지점−0.01) + ½ @평단, 부록 A 수치", () => {
    const p = computeDailyOrdersV4({ ...base, t: 1, cash: 9750, avgPrice: 50, holdingQty: 4 });
    // perBuy=9750/39=250, half=125. 별지점=px(50×1.1425)=57.13, 매수점=57.12
    // qStar=floor(125/57.12)=2, qAvg=floor(125/50)=2
    expect(buys(p)).toEqual([
      { side: "BUY", kind: "loc_star_half", orderType: "LIMIT", tif: "CLS", price: 57.12, quantity: 2 },
      { side: "BUY", kind: "loc_avg_half", orderType: "LIMIT", tif: "CLS", price: 50, quantity: 2 },
    ]);
  });

  it("후반전 시작(T=20): 별%=0 → 매수점=평단−0.01, 전액 1건", () => {
    const p = computeDailyOrdersV4({ ...base, t: 20, cash: 5000, avgPrice: 50, holdingQty: 40 });
    // perBuy=5000/20=250, 별지점=50.00, 매수점=49.99, floor(250/49.99)=5
    expect(buys(p)).toEqual([
      { side: "BUY", kind: "loc_star_full", orderType: "LIMIT", tif: "CLS", price: 49.99, quantity: 5 },
    ]);
  });

  it("소진 직전(T=39): 별%=−14.25 → 매수점 42.87, 잔금 전액", () => {
    const p = computeDailyOrdersV4({ ...base, t: 39, cash: 250, avgPrice: 50, holdingQty: 100 });
    // perBuy=250/1=250, 별지점=px(50×0.8575)=42.88, 매수점=42.87, floor(250/42.87)=5
    const star = buys(p).find((o) => o.kind === "loc_star_full");
    expect(star).toEqual({ side: "BUY", kind: "loc_star_full", orderType: "LIMIT", tif: "CLS", price: 42.87, quantity: 5 });
  });

  it("연속 T(소수)도 동작: SOXL 20분할 T=8.6 원문 예 — 별지점 39.37/매수점 39.36", () => {
    const p = computeDailyOrdersV4({
      t: 8.6, splits: 20, cash: 2280, starBase: 20, bigBuyPremium: 12,
      avgPrice: 38.3, currentPrice: 39, holdingQty: 8,
    });
    // perBuy=2280/11.4=200, half=100 → qStar=floor(100/39.36)=2, qAvg=floor(100/38.30)=2
    expect(buys(p)).toEqual([
      { side: "BUY", kind: "loc_star_half", orderType: "LIMIT", tif: "CLS", price: 39.36, quantity: 2 },
      { side: "BUY", kind: "loc_avg_half", orderType: "LIMIT", tif: "CLS", price: 38.3, quantity: 2 },
    ]);
  });
});

describe("computeDailyOrdersV4 매도 (전·후반 공통 2단)", () => {
  it("¼ floor @별지점 LOC + 나머지 @평단+base% 지정가, 합계=보유", () => {
    const p = computeDailyOrdersV4({ ...base, t: 1, cash: 9750, avgPrice: 50, holdingQty: 4 });
    expect(sells(p)).toEqual([
      { side: "SELL", kind: "sell_loc_star", orderType: "LIMIT", tif: "CLS", price: 57.13, quantity: 1 },
      { side: "SELL", kind: "sell_lim_target", orderType: "LIMIT", tif: "DAY", price: 57.5, quantity: 3 },
    ]);
  });

  it("후반전 매도: 별지점이 평단 아래(부분 손절 성격)", () => {
    const p = computeDailyOrdersV4({ ...base, t: 28, cash: 3000, avgPrice: 50, holdingQty: 40 });
    // 별%=15−0.75×28=−6 → 별지점 47.00
    expect(sells(p)).toEqual([
      { side: "SELL", kind: "sell_loc_star", orderType: "LIMIT", tif: "CLS", price: 47, quantity: 10 },
      { side: "SELL", kind: "sell_lim_target", orderType: "LIMIT", tif: "DAY", price: 57.5, quantity: 30 },
    ]);
  });

  it("보유 3주: 쿼터 floor(0.75)=0 생략, 지정가 3주만", () => {
    const p = computeDailyOrdersV4({ ...base, t: 2, cash: 9500, avgPrice: 50, holdingQty: 3 });
    expect(sells(p)).toEqual([
      { side: "SELL", kind: "sell_lim_target", orderType: "LIMIT", tif: "DAY", price: 57.5, quantity: 3 },
    ]);
  });
});

describe("computeDailyOrdersV4 경계·가드", () => {
  it("T > 분할−1: 소진 — 주문 없음 + exhausted", () => {
    const p = computeDailyOrdersV4({ ...base, t: 39.5, cash: 100, avgPrice: 50, holdingQty: 100 });
    expect(p.orders).toEqual([]);
    expect(p.exhausted).toBe(true);
  });
  it("T=0인데 기보유 존재: blocked", () => {
    const p = computeDailyOrdersV4({ ...base, holdingQty: 5 });
    expect(p.orders).toEqual([]);
    expect(p.blocked).toMatch(/기보유/);
  });
  it("T>0인데 보유 0: blocked (완료 판정은 apply 단계 책임)", () => {
    const p = computeDailyOrdersV4({ ...base, t: 3, cash: 9000, avgPrice: null, holdingQty: 0 });
    expect(p.blocked).toMatch(/보유 0/);
  });
  it("잔금 0 이하: blocked", () => {
    const p = computeDailyOrdersV4({ ...base, t: 5, cash: 0, avgPrice: 50, holdingQty: 10 });
    expect(p.blocked).toMatch(/잔금/);
  });
  it("T>0인데 평단 없음: blocked", () => {
    const p = computeDailyOrdersV4({ ...base, t: 5, cash: 9000, avgPrice: 0, holdingQty: 10 });
    expect(p.blocked).toMatch(/평단/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/infinite-buy/strategy-v4.test.ts`
Expected: FAIL — `Cannot find module './strategy-v4'`

- [ ] **Step 3: 구현**

`strategy-v4.ts` 전체 내용:

```ts
// 라오어 무한매수법 V4.0 일반모드 일일 주문 계산. 순수 함수(토스/DB 의존 없음).
// 근거: docs/superpowers/specs/2026-07-08-infinite-buy-v4.0-reference.html
// 핵심: 별지점 = 평단×(1+별%), 별% = starBase×(1−2T/분할). T는 연속값(체결 기반, §sync).
//   매수점 = 별지점−0.01 (매수·매도 동시 발동 차단). 1회매수금 = 잔금/(분할−T).
// 범위: 코어만 — LOC 사다리·소진모드 제외(원문 미확보). 소진(T>분할−1)은 exhausted 반환.
// 상태(T·잔금) 갱신은 여기서 하지 않는다 — sync.ts의 체결 적용만이 수행.

export const px = (v: number): number => Math.round(v * 100) / 100;

// 별% = base × (1 − 2T/분할). base = TQQQ 15 / SOXL 20 (지정가매도 %와 동일 값).
export const starPct = (t: number, splits: number, base: number): number =>
  base * (1 - (2 * t) / splits);

export interface V4State {
  t: number;             // 연속 T
  splits: number;        // 분할수 (20/30/40)
  cash: number;          // 잔금(USD)
  starBase: number;      // 별% base = 지정가매도 %
  bigBuyPremium: number; // 첫매수 큰수 % (기본 12, 원문 10~15)
  avgPrice: number | null;
  currentPrice: number;
  holdingQty: number;
}

export type V4OrderKind =
  | "first_big_loc"    // 첫매수 큰수 LOC (ΔT 가중 1)
  | "loc_star_half"    // 전반 ½회분 @매수점 (0.5)
  | "loc_avg_half"     // 전반 ½회분 @평단 (0.5)
  | "loc_star_full"    // 후반 전액 @매수점 (1)
  | "sell_loc_star"    // 쿼터 ¼ LOC @별지점 (체결 시 T×0.75)
  | "sell_lim_target"; // ¾ 지정가 @평단+starBase% (체결 시 T×0.25)

export interface V4Order {
  side: "BUY" | "SELL";
  kind: V4OrderKind;
  orderType: "LIMIT";
  tif: "CLS" | "DAY"; // LOC=CLS, 지정가=DAY (토스 매핑)
  price: number;
  quantity: number;
}

export interface V4Plan {
  orders: V4Order[];
  exhausted: boolean;     // T > 분할−1 → 소진모드 대상(주문 없음)
  blocked: string | null; // 주문 보류 사유(그날 스킵, 다음 폴 재시도)
}

export function computeDailyOrdersV4(s: V4State): V4Plan {
  const none = (blocked: string | null, exhausted = false): V4Plan =>
    ({ orders: [], exhausted, blocked });

  if (s.t > s.splits - 1) return none(null, true); // 소진 (N−T < 1)
  if (!(s.cash > 0)) return none("잔금 없음");
  if (s.t === 0 && s.holdingQty > 0) return none("T=0인데 기보유 존재 — 수동 정리 필요");
  if (s.t > 0 && s.holdingQty <= 0) return none("보유 0 — 사이클 완료 대상(apply 단계 처리)");

  const perBuy = s.cash / (s.splits - s.t); // 1회매수금 = 잔금/(분할−T)
  const orders: V4Order[] = [];

  if (s.t === 0) {
    // 첫매수: 큰수 LOC(종가+bigBuyPremium%). 어떤 종가든 체결되도록 위에 걸고 체결은 종가로.
    const limit = px(s.currentPrice * (1 + s.bigBuyPremium / 100));
    const qty = limit > 0 ? Math.floor(perBuy / limit) : 0;
    if (qty >= 1) {
      orders.push({ side: "BUY", kind: "first_big_loc", orderType: "LIMIT", tif: "CLS", price: limit, quantity: qty });
    }
    return { orders, exhausted: false, blocked: null };
  }

  if (!s.avgPrice || s.avgPrice <= 0) return none("평단 없음 — 체결 동기화 확인 필요");

  const star = px(s.avgPrice * (1 + starPct(s.t, s.splits, s.starBase) / 100)); // 별지점 = 매도점
  const buyPoint = px(star - 0.01); // 매수점 (1센트 아래)

  // ── 매수 (전부 LOC) ──
  if (s.t < s.splits / 2) {
    // 전반전: ½ 별지점(매수점) + ½ 평단
    const half = perBuy / 2;
    const qStar = buyPoint > 0 ? Math.floor(half / buyPoint) : 0;
    if (qStar >= 1) orders.push({ side: "BUY", kind: "loc_star_half", orderType: "LIMIT", tif: "CLS", price: buyPoint, quantity: qStar });
    const qAvg = Math.floor(half / s.avgPrice);
    if (qAvg >= 1) orders.push({ side: "BUY", kind: "loc_avg_half", orderType: "LIMIT", tif: "CLS", price: px(s.avgPrice), quantity: qAvg });
  } else {
    // 후반전: 전액 매수점(평단 이하)
    const qStar = buyPoint > 0 ? Math.floor(perBuy / buyPoint) : 0;
    if (qStar >= 1) orders.push({ side: "BUY", kind: "loc_star_full", orderType: "LIMIT", tif: "CLS", price: buyPoint, quantity: qStar });
  }

  // ── 매도 (전·후반 공통 2단, 반올림은 v2.2 관행: 쿼터 floor + 나머지 지정가) ──
  const qQuarter = Math.floor(s.holdingQty * 0.25);
  const qLim = s.holdingQty - qQuarter;
  if (qQuarter >= 1) orders.push({ side: "SELL", kind: "sell_loc_star", orderType: "LIMIT", tif: "CLS", price: star, quantity: qQuarter });
  if (qLim >= 1) orders.push({ side: "SELL", kind: "sell_lim_target", orderType: "LIMIT", tif: "DAY", price: px(s.avgPrice * (1 + s.starBase / 100)), quantity: qLim });

  return { orders, exhausted: false, blocked: null };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/infinite-buy/strategy-v4.test.ts`
Expected: PASS (전체)

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/lib/infinite-buy/strategy-v4.ts apps/company-map/src/lib/infinite-buy/strategy-v4.test.ts
git commit -m "feat(company-map): 무한매수 v4 코어 전략 - 별지점·연속T·잔금 기반 주문 계산

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 일봉 고가 확장 + dryRun 가상 체결 판정 `dry-fill.ts` (TDD)

`DailyCandle`에 고가가 없어 지정가매도(장중 터치) 판정이 불가 → 캔들 매핑에 `high`를 추가하고, 판정은 순수 함수로 작성한다.

**Files:**
- Modify: `apps/company-map/src/lib/toss/client.ts` (RawCandle 322-325행, DailyCandle 327-330행, getDailyCandles 333-344행)
- Create: `apps/company-map/src/lib/infinite-buy/dry-fill.ts`
- Test: `apps/company-map/src/lib/infinite-buy/dry-fill.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:

```ts
// toss/client.ts
export interface DailyCandle { date: string; close: number; high: number; } // high 추가
// dry-fill.ts
export interface DryCandle { close: number; high: number; }
export interface DryFillResult { filled: boolean; fillPrice: number | null; }
export function judgeDryFill(
  order: { side: "BUY" | "SELL"; orderType: string; tif: string; price: number | null },
  candle: DryCandle,
): DryFillResult;
```

- [ ] **Step 1: 실패하는 테스트 작성**

`dry-fill.test.ts` 전체 내용:

```ts
import { describe, it, expect } from "vitest";
import { judgeDryFill } from "./dry-fill";

const candle = { close: 55, high: 58 };
const loc = (side: "BUY" | "SELL", price: number) =>
  ({ side, orderType: "LIMIT", tif: "CLS", price });
const day = (price: number) =>
  ({ side: "SELL" as const, orderType: "LIMIT", tif: "DAY", price });

describe("judgeDryFill — LOC (종가 판정)", () => {
  it("LOC 매수: 종가 ≤ 리밋 → 종가 체결 (경계 포함)", () => {
    expect(judgeDryFill(loc("BUY", 55), candle)).toEqual({ filled: true, fillPrice: 55 });
    expect(judgeDryFill(loc("BUY", 56), candle)).toEqual({ filled: true, fillPrice: 55 });
  });
  it("LOC 매수: 종가 > 리밋 → 미체결", () => {
    expect(judgeDryFill(loc("BUY", 54.99), candle)).toEqual({ filled: false, fillPrice: null });
  });
  it("LOC 매도: 종가 ≥ 리밋 → 종가 체결 (경계 포함)", () => {
    expect(judgeDryFill(loc("SELL", 55), candle)).toEqual({ filled: true, fillPrice: 55 });
    expect(judgeDryFill(loc("SELL", 54), candle)).toEqual({ filled: true, fillPrice: 55 });
  });
  it("LOC 매도: 종가 < 리밋 → 미체결", () => {
    expect(judgeDryFill(loc("SELL", 55.01), candle)).toEqual({ filled: false, fillPrice: null });
  });
});

describe("judgeDryFill — 지정가 매도 (고가 판정, 리밋가 체결)", () => {
  it("고가 ≥ 리밋 → 리밋가 체결", () => {
    expect(judgeDryFill(day(58), candle)).toEqual({ filled: true, fillPrice: 58 });
    expect(judgeDryFill(day(57.5), candle)).toEqual({ filled: true, fillPrice: 57.5 });
  });
  it("고가 < 리밋 → 미체결", () => {
    expect(judgeDryFill(day(58.01), candle)).toEqual({ filled: false, fillPrice: null });
  });
});

describe("judgeDryFill — 방어", () => {
  it("가격 없는 주문/시장가: 미체결 처리", () => {
    expect(judgeDryFill({ side: "BUY", orderType: "MARKET", tif: "DAY", price: null }, candle))
      .toEqual({ filled: false, fillPrice: null });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/infinite-buy/dry-fill.test.ts`
Expected: FAIL — `Cannot find module './dry-fill'`

- [ ] **Step 3: dry-fill.ts 구현**

```ts
// dryRun 가상 체결 판정. 전일 일봉(종가·고가)으로 전일 simulated 주문의 체결을 흉내낸다.
// 라이브와 동일한 적용 경로(sync.ts applyFills)를 태우기 위한 입력 생성용. 순수 함수.
export interface DryCandle {
  close: number;
  high: number;
}

export interface DryFillResult {
  filled: boolean;
  fillPrice: number | null;
}

export function judgeDryFill(
  order: { side: "BUY" | "SELL"; orderType: string; tif: string; price: number | null },
  candle: DryCandle,
): DryFillResult {
  const miss: DryFillResult = { filled: false, fillPrice: null };
  if (order.orderType !== "LIMIT" || order.price == null) return miss;

  if (order.tif === "CLS") {
    // LOC: 종가 기준, 체결가는 종가
    if (order.side === "BUY") {
      return candle.close <= order.price ? { filled: true, fillPrice: candle.close } : miss;
    }
    return candle.close >= order.price ? { filled: true, fillPrice: candle.close } : miss;
  }

  if (order.tif === "DAY" && order.side === "SELL") {
    // 지정가 매도: 장중 고가가 리밋 터치 → 리밋가 체결
    return candle.high >= order.price ? { filled: true, fillPrice: order.price } : miss;
  }

  return miss;
}
```

- [ ] **Step 4: toss/client.ts 캔들에 high 추가**

`RawCandle`(322행)을 다음으로 교체:

```ts
interface RawCandle {
  timestamp: string;
  closePrice: string;
  highPrice?: string;
}
```

`DailyCandle`(327행)을 다음으로 교체:

```ts
export interface DailyCandle {
  date: string; // YYYY-MM-DD (KST)
  close: number;
  high: number; // 고가. 응답에 없으면 close로 대체(보수적 판정)
}
```

`getDailyCandles` 내부 map(340행 부근)을 다음으로 교체:

```ts
    .map((c) => {
      const close = Number(c.closePrice);
      const high = Number(c.highPrice);
      return { date: c.timestamp.slice(0, 10), close, high: Number.isFinite(high) && high > 0 ? high : close };
    })
```

(주의: 이 함수를 쓰는 기존 소비자 — 대시보드 차트, RSI — 는 `close`만 사용하므로 필드 추가는 무해.)

- [ ] **Step 5: 테스트 통과 + 기존 테스트 회귀 확인**

Run: `yarn workspace company-map vitest run src/lib/infinite-buy/dry-fill.test.ts && yarn workspace company-map test`
Expected: 모두 PASS

- [ ] **Step 6: Commit**

```bash
git add apps/company-map/src/lib/infinite-buy/dry-fill.ts apps/company-map/src/lib/infinite-buy/dry-fill.test.ts apps/company-map/src/lib/toss/client.ts
git commit -m "feat(company-map): dryRun 가상 체결 판정 + 일봉 고가 확장

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 체결 적용 순수 로직 — `sync.ts`의 applyFills / derivePosition / crossCheck (TDD)

**Files:**
- Create: `apps/company-map/src/lib/infinite-buy/sync.ts` (이 태스크에선 순수 파트만; IO 파트는 Task 5에서 같은 파일에 추가)
- Test: `apps/company-map/src/lib/infinite-buy/sync.test.ts`

**Interfaces:**
- Consumes: Task 2의 `V4OrderKind` 문자열 값들
- Produces:

```ts
export interface FillEvent {
  side: "BUY" | "SELL"; kind: string;
  quantity: number;      // 주문 수량
  filledQty: number;     // 체결 수량
  filledPrice: number;   // 체결가
  tradeDate: string;     // YYYY-MM-DD (정렬 키)
}
export function sortFills<T extends FillEvent>(fills: T[]): T[];
export function applyFills(init: { t: number; cash: number }, fills: FillEvent[]): { t: number; cash: number };
export function derivePositionFromFills(fills: FillEvent[]): { avgPrice: number | null; holdingQty: number };
export function crossCheckHolding(fills: FillEvent[], actualQty: number): { ok: boolean; expected: number };
```

- [ ] **Step 1: 실패하는 테스트 작성**

`sync.test.ts` 전체 내용:

```ts
import { describe, it, expect } from "vitest";
import { applyFills, sortFills, derivePositionFromFills, crossCheckHolding, type FillEvent } from "./sync";

const f = (o: Partial<FillEvent>): FillEvent => ({
  side: "BUY", kind: "loc_star_half", quantity: 2, filledQty: 2, filledPrice: 50, tradeDate: "2026-07-13",
  ...o,
});

describe("applyFills — ΔT (주문 단위 비례, 스펙 해석 ①)", () => {
  it("첫매수 전량 체결: +1", () => {
    const r = applyFills({ t: 0, cash: 10000 }, [f({ kind: "first_big_loc", quantity: 4, filledQty: 4, filledPrice: 50 })]);
    expect(r.t).toBeCloseTo(1, 10);
    expect(r.cash).toBeCloseTo(10000 - 200, 10);
  });
  it("전반 ½ 주문 1건 전량 체결: +0.5", () => {
    const r = applyFills({ t: 3, cash: 9000 }, [f({ kind: "loc_star_half", quantity: 2, filledQty: 2 })]);
    expect(r.t).toBeCloseTo(3.5, 10);
  });
  it("전반 두 주문 모두 체결: +1 (0.5+0.5)", () => {
    const r = applyFills({ t: 3, cash: 9000 }, [
      f({ kind: "loc_star_half" }), f({ kind: "loc_avg_half" }),
    ]);
    expect(r.t).toBeCloseTo(4, 10);
  });
  it("부분체결 비례: ½ 주문 2주 중 1주 → +0.25", () => {
    const r = applyFills({ t: 3, cash: 9000 }, [f({ kind: "loc_star_half", quantity: 2, filledQty: 1 })]);
    expect(r.t).toBeCloseTo(3.25, 10);
  });
  it("후반 전액 주문 전량 체결: +1", () => {
    const r = applyFills({ t: 25, cash: 3000 }, [f({ kind: "loc_star_full", quantity: 5, filledQty: 5 })]);
    expect(r.t).toBeCloseTo(26, 10);
  });
});

describe("applyFills — 매도 배수 (부분체결이어도 전량 기준, 스펙 확정)", () => {
  it("쿼터매도: T×0.75, 잔금 += 체결대금", () => {
    const r = applyFills({ t: 10, cash: 5000 }, [
      f({ side: "SELL", kind: "sell_loc_star", quantity: 25, filledQty: 25, filledPrice: 54.2 }),
    ]);
    expect(r.t).toBeCloseTo(7.5, 10);
    expect(r.cash).toBeCloseTo(5000 + 25 * 54.2, 10);
  });
  it("지정가매도 후 같은 날 매수 체결: ×0.25 먼저 → 매수 ΔT (원문 예시 ③C: T=10 → 3.5)", () => {
    const r = applyFills({ t: 10, cash: 5000 }, [
      f({ kind: "loc_star_half", quantity: 2, filledQty: 2, filledPrice: 49, tradeDate: "2026-07-13" }),
      f({ side: "SELL", kind: "sell_lim_target", quantity: 75, filledQty: 75, filledPrice: 57.5, tradeDate: "2026-07-13" }),
      f({ kind: "loc_avg_half", quantity: 2, filledQty: 2, filledPrice: 49, tradeDate: "2026-07-13" }),
    ]);
    // 정렬: sell_lim_target 먼저 → 10×0.25=2.5 → +0.5+0.5 → 3.5
    expect(r.t).toBeCloseTo(3.5, 10);
  });
  it("체결수량 0 이벤트는 무시", () => {
    const r = applyFills({ t: 5, cash: 1000 }, [f({ filledQty: 0 })]);
    expect(r).toEqual({ t: 5, cash: 1000 });
  });
});

describe("sortFills — 거래일 → 종류 우선순위(지정가매도→쿼터→매수)", () => {
  it("날짜가 다르면 날짜 우선", () => {
    const s = sortFills([
      f({ tradeDate: "2026-07-14", kind: "sell_lim_target", side: "SELL" }),
      f({ tradeDate: "2026-07-13", kind: "loc_star_half" }),
    ]);
    expect(s[0].tradeDate).toBe("2026-07-13");
  });
});

describe("derivePositionFromFills — dryRun 포지션 파생", () => {
  it("매수 가중평균, 매도는 수량만 감소(평단 유지)", () => {
    const pos = derivePositionFromFills([
      f({ kind: "first_big_loc", quantity: 4, filledQty: 4, filledPrice: 56, tradeDate: "2026-07-10" }),
      f({ kind: "loc_avg_half", quantity: 2, filledQty: 2, filledPrice: 50, tradeDate: "2026-07-11" }),
      f({ side: "SELL", kind: "sell_loc_star", quantity: 1, filledQty: 1, filledPrice: 57, tradeDate: "2026-07-12" }),
    ]);
    // avg = (4×56 + 2×50)/6 = 54, qty = 6−1 = 5
    expect(pos.holdingQty).toBe(5);
    expect(pos.avgPrice).toBeCloseTo(54, 10);
  });
  it("체결 없음 → 보유 0, 평단 null", () => {
    expect(derivePositionFromFills([])).toEqual({ avgPrice: null, holdingQty: 0 });
  });
});

describe("crossCheckHolding", () => {
  it("Σ매수−Σ매도 = 실보유 → ok", () => {
    const fills = [
      f({ quantity: 4, filledQty: 4 }),
      f({ side: "SELL", kind: "sell_loc_star", quantity: 1, filledQty: 1 }),
    ];
    expect(crossCheckHolding(fills, 3)).toEqual({ ok: true, expected: 3 });
    expect(crossCheckHolding(fills, 5).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/infinite-buy/sync.test.ts`
Expected: FAIL — `Cannot find module './sync'`

- [ ] **Step 3: 순수 파트 구현**

`sync.ts` (이 태스크 시점의 전체 내용):

```ts
// V4.0 체결 동기화 — 순수 파트.
// V4의 상태(연속 T·잔금)는 오직 체결 이벤트로만 갱신된다 (레퍼런스 §2·§10).
//   매수: ΔT = 가중(전반 leg 0.5 / 후반·첫매수 1) × 체결비율. 잔금 −= 체결대금.
//   쿼터매도: T×0.75 / 지정가매도: T×0.25 (부분체결이어도 전량 기준 — 스펙 확정). 잔금 += 체결대금.
// 같은 거래일 적용 순서: 지정가매도(장중) → 쿼터매도(종가) → 매수(종가).
export interface FillEvent {
  side: "BUY" | "SELL";
  kind: string;
  quantity: number;    // 주문 수량
  filledQty: number;   // 체결 수량
  filledPrice: number; // 체결가
  tradeDate: string;   // YYYY-MM-DD
}

const BUY_T_WEIGHT: Record<string, number> = {
  first_big_loc: 1,
  loc_star_full: 1,
  loc_star_half: 0.5,
  loc_avg_half: 0.5,
};

const KIND_PRIORITY: Record<string, number> = {
  sell_lim_target: 0, // 장중 체결 — 같은 날이면 가장 먼저
  sell_loc_star: 1,   // 종가 체결
};

export function sortFills<T extends FillEvent>(fills: T[]): T[] {
  return [...fills].sort((a, b) =>
    a.tradeDate !== b.tradeDate
      ? a.tradeDate.localeCompare(b.tradeDate)
      : (KIND_PRIORITY[a.kind] ?? 2) - (KIND_PRIORITY[b.kind] ?? 2),
  );
}

export function applyFills(
  init: { t: number; cash: number },
  fills: FillEvent[],
): { t: number; cash: number } {
  let { t, cash } = init;
  for (const fe of sortFills(fills)) {
    if (!(fe.filledQty > 0) || !(fe.filledPrice > 0)) continue;
    const amount = fe.filledQty * fe.filledPrice;
    if (fe.side === "BUY") {
      const weight = BUY_T_WEIGHT[fe.kind] ?? 1;
      t += weight * (fe.filledQty / fe.quantity);
      cash -= amount;
    } else {
      t *= fe.kind === "sell_loc_star" ? 0.75 : 0.25;
      cash += amount;
    }
  }
  return { t, cash };
}

// dryRun 포지션 파생: 매수 가중평균 평단, 매도는 수량만 감소(평단 유지).
export function derivePositionFromFills(fills: FillEvent[]): { avgPrice: number | null; holdingQty: number } {
  let qty = 0;
  let avg: number | null = null;
  for (const fe of sortFills(fills)) {
    if (!(fe.filledQty > 0) || !(fe.filledPrice > 0)) continue;
    if (fe.side === "BUY") {
      avg = avg == null || qty <= 0
        ? fe.filledPrice
        : (avg * qty + fe.filledPrice * fe.filledQty) / (qty + fe.filledQty);
      qty += fe.filledQty;
    } else {
      qty -= fe.filledQty;
      if (qty <= 0) { qty = 0; avg = null; }
    }
  }
  return { avgPrice: avg, holdingQty: qty };
}

// 정합성: Σ매수체결 − Σ매도체결 = 실제 보유수량 (LIVE 오염 방어선)
export function crossCheckHolding(fills: FillEvent[], actualQty: number): { ok: boolean; expected: number } {
  let expected = 0;
  for (const fe of fills) {
    if (!(fe.filledQty > 0)) continue;
    expected += fe.side === "BUY" ? fe.filledQty : -fe.filledQty;
  }
  return { ok: Math.abs(expected - actualQty) < 1e-6, expected };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/infinite-buy/sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/lib/infinite-buy/sync.ts apps/company-map/src/lib/infinite-buy/sync.test.ts
git commit -m "feat(company-map): v4 체결 적용 순수 로직 - ΔT·잔금·포지션 파생·크로스체크

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 체결 동기화 IO 파트 — `sync.ts`에 추가

토스 조회·DB 반영. 순수 파트는 Task 4에서 검증됐으므로 이 파트는 타입체크 + Task 10 스모크로 검증한다(스펙 §10 테스트 계획과 일치).

**Files:**
- Modify: `apps/company-map/src/lib/infinite-buy/sync.ts` (파일 끝에 추가)

**Interfaces:**
- Consumes: Task 4의 `applyFills`/`FillEvent`, Prisma `InfiniteBuyOrder`/`InfiniteBuyCycle`, `TossOrder`(toss/client.ts 475행)
- Produces:

```ts
export interface SyncTossDeps {
  getDefaultAccountSeq(): Promise<number>;
  getClosedOrders(accountSeq: number, symbol: string, from: string): Promise<TossOrder[]>;
}
export async function syncFillsFromToss(db: PrismaClient, cycleId: string, deps: SyncTossDeps): Promise<{ updated: number }>;
export async function applyPendingFillsV4(db: PrismaClient, cycleId: string): Promise<{ t: number; cash: number; applied: number }>;
export async function loadFillEvents(db: PrismaClient, cycleId: string): Promise<FillEvent[]>; // 체결된 전체(포지션 파생·크로스체크용)
```

- [ ] **Step 1: IO 파트 구현**

`sync.ts` 상단 import 추가:

```ts
import type { PrismaClient } from "@prisma-clients/company-map";
import type { TossOrder } from "@/lib/toss/client";
```

파일 끝에 추가:

```ts
// ───────────────────────── IO 파트 ─────────────────────────

export interface SyncTossDeps {
  getDefaultAccountSeq(): Promise<number>;
  getClosedOrders(accountSeq: number, symbol: string, from: string): Promise<TossOrder[]>;
}

// 토스 CLOSED 주문 ↔ 우리 주문(tossOrderId) 대조, BUY·SELL 모두 체결 기록. 멱등.
// (기존 syncSellFills의 확장판 — SELL 필터 제거. 서버 액션은 이 함수의 래퍼가 된다.)
export async function syncFillsFromToss(
  db: PrismaClient,
  cycleId: string,
  deps: SyncTossDeps,
): Promise<{ updated: number }> {
  const cycle = await db.infiniteBuyCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return { updated: 0 };
  const accountSeq = cycle.accountSeq ?? (await deps.getDefaultAccountSeq());
  const from = cycle.createdAt.toISOString().slice(0, 10);
  const tossOrders = await deps.getClosedOrders(accountSeq, cycle.symbol, from);
  let updated = 0;
  for (const to of tossOrders) {
    if (to.filledQuantity <= 0) continue;
    const our = await db.infiniteBuyOrder.findFirst({ where: { cycleId, tossOrderId: to.orderId } });
    if (!our) continue;
    if (our.status === "filled" && our.filledQty === to.filledQuantity) continue; // 이미 반영
    await db.infiniteBuyOrder.update({
      where: { id: our.id },
      data: {
        status: "filled",
        filledQty: to.filledQuantity,
        filledPrice: to.averageFilledPrice,
        filledAt: to.filledAt,
      },
    });
    updated++;
  }
  return { updated };
}

const FILLED_STATUSES = ["filled", "simulated_filled"];

function toFillEvent(o: {
  side: string; kind: string; quantity: number;
  filledQty: number | null; filledPrice: number | null; tradeDate: string;
}): FillEvent {
  return {
    side: o.side as "BUY" | "SELL",
    kind: o.kind,
    quantity: o.quantity,
    filledQty: o.filledQty ?? 0,
    filledPrice: o.filledPrice ?? 0,
    tradeDate: o.tradeDate,
  };
}

// 체결된 전체 이벤트 (포지션 파생·크로스체크용)
export async function loadFillEvents(db: PrismaClient, cycleId: string): Promise<FillEvent[]> {
  const rows = await db.infiniteBuyOrder.findMany({
    where: { cycleId, status: { in: FILLED_STATUSES } },
    orderBy: { tradeDate: "asc" },
  });
  return rows.map(toFillEvent);
}

// 미반영 체결(stateApplied ≠ true)을 T/잔금에 반영하고 마킹. 트랜잭션으로 원자성 보장.
export async function applyPendingFillsV4(
  db: PrismaClient,
  cycleId: string,
): Promise<{ t: number; cash: number; applied: number }> {
  return db.$transaction(async (tx) => {
    const cycle = await tx.infiniteBuyCycle.findUniqueOrThrow({ where: { id: cycleId } });
    const pending = await tx.infiniteBuyOrder.findMany({
      where: { cycleId, status: { in: FILLED_STATUSES }, OR: [{ stateApplied: null }, { stateApplied: false }] },
      orderBy: { tradeDate: "asc" },
    });
    let t = cycle.tValue ?? 0;
    let cash = cycle.cashRemaining ?? cycle.principal;
    if (pending.length > 0) {
      ({ t, cash } = applyFills({ t, cash }, pending.map(toFillEvent)));
      await tx.infiniteBuyCycle.update({ where: { id: cycleId }, data: { tValue: t, cashRemaining: cash } });
      await tx.infiniteBuyOrder.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { stateApplied: true },
      });
    }
    return { t, cash, applied: pending.length };
  });
}
```

- [ ] **Step 2: 타입체크 + 기존 테스트 회귀**

Run: `cd apps/company-map && npx tsc --noEmit; cd ../..` 그리고 `yarn workspace company-map test`
Expected: 타입 에러 0 · 테스트 전체 PASS

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/src/lib/infinite-buy/sync.ts
git commit -m "feat(company-map): 체결 동기화 lib IO - 토스 대조(BUY 포함)·v4 상태 반영 트랜잭션

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 오케스트레이터 `run-v4.ts` + 토스 어댑터 V4 deps

sync→apply→check→compute→submit 순서를 한 함수에 강제해 "상태 갱신 전 주문" 실수를 구조적으로 차단한다. worker와 서버 액션(runCycleNow)이 공유.

**Files:**
- Create: `apps/company-map/src/lib/infinite-buy/run-v4.ts`
- Modify: `apps/company-map/src/lib/infinite-buy/toss-adapter.ts` (파일 끝에 `tossV4Deps` 추가)

**Interfaces:**
- Consumes: Task 2 `computeDailyOrdersV4`/`V4State`, Task 3 `judgeDryFill`/`DryCandle`, Task 4·5 sync 함수들, `run.ts`의 `RunDeps`, toss client `getOrders`/`getDailyCandles`
- Produces:

```ts
// run-v4.ts
export interface V4RunDeps extends RunDeps {
  getClosedOrders(accountSeq: number, symbol: string, from: string): Promise<TossOrder[]>;
  getDailyCandle(symbol: string, date: string): Promise<DryCandle | null>;
}
export interface V4RunResult {
  placed: number; simulated: number;
  blocked: string | null; exhausted: boolean; completed: boolean;
}
export async function runV4(
  db: PrismaClient, deps: V4RunDeps,
  cycleId: string, tradeDate: string, killed: boolean,
): Promise<V4RunResult>;
// toss-adapter.ts
export function tossV4Deps(): V4RunDeps;
```

- [ ] **Step 1: run-v4.ts 구현**

전체 내용:

```ts
// V4.0 하루 실행 오케스트레이터. 순서 불변식: 상태 갱신(체결 반영)은 항상 주문 계산보다 먼저.
//   ① sync(LIVE: 토스 대조 / dryRun: 일봉 가상 체결) → ② apply(T·잔금)
//   → ③ 포지션·크로스체크 → ④ computeDailyOrdersV4 → ⑤ 제출/기록
// blocked 시 lastRunDate를 갱신하지 않아 다음 15분 폴에서 자동 재시도된다.
import type { PrismaClient } from "@prisma-clients/company-map";
import type { TossOrder } from "@/lib/toss/client";
import type { RunDeps } from "./run";
import { computeDailyOrdersV4, type V4Order } from "./strategy-v4";
import { judgeDryFill, type DryCandle } from "./dry-fill";
import {
  syncFillsFromToss, applyPendingFillsV4, loadFillEvents,
  derivePositionFromFills, crossCheckHolding,
} from "./sync";
import { assertSubmittable } from "./toss-adapter";
import type { IntendedOrder } from "./strategy";

export interface V4RunDeps extends RunDeps {
  getClosedOrders(accountSeq: number, symbol: string, from: string): Promise<TossOrder[]>;
  getDailyCandle(symbol: string, date: string): Promise<DryCandle | null>;
}

export interface V4RunResult {
  placed: number;
  simulated: number;
  blocked: string | null;
  exhausted: boolean;
  completed: boolean;
}

// dryRun: 과거 거래일의 simulated 주문을 그 날 일봉으로 판정.
// 체결 → simulated_filled(+filledQty/Price/At), 미체결 → expired (재판정 방지).
async function simulateDryFills(
  db: PrismaClient,
  deps: V4RunDeps,
  cycle: { id: string; symbol: string },
  tradeDate: string,
): Promise<void> {
  const pending = await db.infiniteBuyOrder.findMany({
    where: { cycleId: cycle.id, dryRun: true, status: "simulated", tradeDate: { lt: tradeDate } },
    orderBy: { tradeDate: "asc" },
  });
  const candles = new Map<string, DryCandle | null>();
  for (const o of pending) {
    if (!candles.has(o.tradeDate)) {
      candles.set(o.tradeDate, await deps.getDailyCandle(cycle.symbol, o.tradeDate));
    }
    const candle = candles.get(o.tradeDate);
    if (!candle) continue; // 일봉 미확보(휴장/조회실패) — 다음 폴에서 재시도
    const r = judgeDryFill(
      { side: o.side as "BUY" | "SELL", orderType: o.orderType, tif: o.tif, price: o.price },
      candle,
    );
    await db.infiniteBuyOrder.update({
      where: { id: o.id },
      data: r.filled
        ? { status: "simulated_filled", filledQty: o.quantity, filledPrice: r.fillPrice, filledAt: o.tradeDate }
        : { status: "expired" },
    });
  }
}

export async function runV4(
  db: PrismaClient,
  deps: V4RunDeps,
  cycleId: string,
  tradeDate: string,
  killed: boolean,
): Promise<V4RunResult> {
  const result: V4RunResult = { placed: 0, simulated: 0, blocked: null, exhausted: false, completed: false };
  const block = async (reason: string): Promise<V4RunResult> => {
    await db.infiniteBuyCycle.update({ where: { id: cycleId }, data: { note: reason } });
    return { ...result, blocked: reason };
  };

  const c0 = await db.infiniteBuyCycle.findUnique({ where: { id: cycleId } });
  if (!c0) return { ...result, blocked: "사이클 없음" };
  if (c0.starBase == null || c0.tValue == null || c0.cashRemaining == null) {
    return block("v4 상태 미초기화 (tValue/cashRemaining/starBase)");
  }

  // ① sync
  try {
    if (c0.dryRun) {
      await simulateDryFills(db, deps, c0, tradeDate);
    } else {
      const accountSeq = c0.accountSeq ?? (await deps.getDefaultAccountSeq());
      void accountSeq; // syncFillsFromToss가 내부에서 재조회
      await syncFillsFromToss(db, cycleId, deps);
    }
  } catch (e) {
    return block(`체결 동기화 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ② apply — T·잔금 갱신
  const { t, cash } = await applyPendingFillsV4(db, cycleId);

  // ③ 포지션 + 크로스체크
  const fills = await loadFillEvents(db, cycleId);
  let avgPrice: number | null;
  let holdingQty: number;
  let currentPrice: number;
  if (c0.dryRun) {
    ({ avgPrice, holdingQty } = derivePositionFromFills(fills));
    currentPrice = await deps.getCurrentPrice(c0.symbol);
  } else {
    const accountSeq = c0.accountSeq ?? (await deps.getDefaultAccountSeq());
    const h = await deps.getHoldingForSymbol(accountSeq, c0.symbol);
    avgPrice = h?.avgPrice ?? null;
    holdingQty = h?.quantity ?? 0;
    currentPrice = h?.currentPrice ?? (await deps.getCurrentPrice(c0.symbol));
    const check = crossCheckHolding(fills, holdingQty);
    if (!check.ok) {
      return block(`정합성 불일치: 체결합 ${check.expected} ≠ 실보유 ${holdingQty} — 수동 확인 필요`);
    }
  }

  // 사이클 완료: 전량 매도됨
  if (t > 0 && holdingQty <= 0) {
    await db.infiniteBuyCycle.update({
      where: { id: cycleId },
      data: { status: "completed", lastRunDate: tradeDate, note: "보유 0 — 사이클 종료(재시작은 새 사이클 생성)" },
    });
    return { ...result, completed: true };
  }

  // ④ compute
  const plan = computeDailyOrdersV4({
    t, splits: c0.splits, cash, starBase: c0.starBase, bigBuyPremium: c0.bigBuyPremium,
    avgPrice, currentPrice, holdingQty,
  });
  if (plan.exhausted) {
    await db.infiniteBuyCycle.update({
      where: { id: cycleId },
      data: { status: "exhausted", lastRunDate: tradeDate, note: `소진 도달(T=${t.toFixed(2)}) — 소진모드 미구현, 수동 판단 필요` },
    });
    return { ...result, exhausted: true };
  }
  if (plan.blocked) return block(plan.blocked);

  // ⑤ submit / 기록 (run.ts와 동일한 관행)
  const simulate = c0.dryRun || killed;
  let buyingPower = 0;
  if (!simulate && plan.orders.some((o) => o.side === "BUY")) {
    const accountSeq = c0.accountSeq ?? (await deps.getDefaultAccountSeq());
    buyingPower = await deps.getBuyingPowerUsd(accountSeq);
  }
  for (const o of plan.orders) {
    const base = {
      cycleId, tradeDate, round: Math.floor(t), side: o.side, kind: o.kind,
      orderType: o.orderType, tif: o.tif, price: o.price, quantity: o.quantity,
      avgCost: o.side === "SELL" ? avgPrice : null,
      tossOrderId: null as string | null, dryRun: c0.dryRun,
    };
    if (o.side === "BUY" && !simulate) {
      const est = o.price * o.quantity;
      if (est > buyingPower) {
        await db.infiniteBuyOrder.create({ data: { ...base, status: "skipped", error: "insufficient buying power" } });
        continue;
      }
      buyingPower -= est;
    }
    if (simulate) {
      await db.infiniteBuyOrder.create({ data: { ...base, status: "simulated", error: null } });
      result.simulated++;
      continue;
    }
    try {
      const intended: IntendedOrder = {
        side: o.side, kind: "loc_avg", orderType: o.orderType, tif: o.tif, price: o.price, quantity: o.quantity,
      };
      assertSubmittable(intended);
      const accountSeq = c0.accountSeq ?? (await deps.getDefaultAccountSeq());
      const { tossOrderId } = await deps.submitOrder(accountSeq, intended, c0.symbol);
      await db.infiniteBuyOrder.create({ data: { ...base, tossOrderId, status: "submitted", error: null } });
      result.placed++;
    } catch (e) {
      await db.infiniteBuyOrder.create({
        data: { ...base, status: "failed", error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  await db.infiniteBuyCycle.update({ where: { id: cycleId }, data: { lastRunDate: tradeDate, note: null } });
  return result;
}
```

(참고: `submitOrder`는 kind를 읽지 않으므로 v4 kind를 `IntendedOrder`의 임의 kind로 좁혀 전달 — run.ts 138행의 기존 관행과 동일. 로그에는 v4 kind가 그대로 저장된다.)

- [ ] **Step 2: toss-adapter.ts에 V4 deps 추가**

`toss-adapter.ts` import 수정(1-6행):

```ts
import {
  getDefaultAccountSeq, getHoldings, getPrices, getBuyingPower, createOrder, getOrders, getDailyCandles,
} from "@/lib/toss/client";
import type { PrismaClient } from "@prisma-clients/company-map";
import type { RunDeps, RunPersistence, HoldingSnapshot, OrderLog } from "./run";
import type { V4RunDeps } from "./run-v4";
import type { IntendedOrder } from "./strategy";
```

파일 끝(`isKilled` 위)에 추가:

```ts
// 토스 클라이언트 → V4RunDeps. 기존 RunDeps에 체결 조회·일봉 1건 조회를 얹는다.
export function tossV4Deps(): V4RunDeps {
  return {
    ...tossRunDeps(),
    getClosedOrders(accountSeq, symbol, from) {
      return getOrders(accountSeq, { status: "CLOSED", symbol, from });
    },
    async getDailyCandle(symbol, date) {
      const candles = await getDailyCandles(symbol, 30);
      const c = candles.find((x) => x.date === date);
      return c ? { close: c.close, high: c.high } : null;
    },
  };
}
```

- [ ] **Step 3: 타입체크 + 회귀**

Run: `cd apps/company-map && npx tsc --noEmit; cd ../..` 그리고 `yarn workspace company-map test`
Expected: 타입 에러 0 · 전체 PASS

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/src/lib/infinite-buy/run-v4.ts apps/company-map/src/lib/infinite-buy/toss-adapter.ts
git commit -m "feat(company-map): v4 실행 오케스트레이터 - sync→apply→check→compute→submit 순서 강제

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: worker 루프 편입

**Files:**
- Modify: `apps/company-map/worker/infinite-buy-loop.ts` (사이클 for 루프 내부, 40행 부근)

**Interfaces:**
- Consumes: Task 6 `runV4`/`tossV4Deps`
- Produces: v4.0 사이클의 자동 일일 실행 (기존 v1/v2.2 경로 무변경)

- [ ] **Step 1: import 추가 및 분기 삽입**

import에 추가:

```ts
import { runV4 } from "@/lib/infinite-buy/run-v4";
import { tossV4Deps } from "@/lib/infinite-buy/toss-adapter";
```

사이클 for 루프의 `if (c.lastRunDate === tradeDate) continue;` 바로 아래, 기존 `const config: CycleConfig = {` 앞에 삽입:

```ts
          if (c.version === "v4.0") {
            try {
              const r = await runV4(db, tossV4Deps(), c.id, tradeDate, isKilled());
              console.log(`[infinite-buy] ${c.symbol} v4 (${tradeDate}):`, r, c.dryRun ? "[dryRun]" : "[LIVE]");
            } catch (e) {
              console.error(`[infinite-buy] ${c.symbol} v4 run failed:`, e);
            }
            continue;
          }
```

(주의: blocked 시 `runV4`가 lastRunDate를 갱신하지 않으므로 다음 15분 폴에서 자동 재시도된다 — 의도된 동작.)

- [ ] **Step 2: 타입체크**

Run: `cd apps/company-map && npx tsc --noEmit; cd ../..`
Expected: 에러 0

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/worker/infinite-buy-loop.ts
git commit -m "feat(company-map): worker 무한매수 루프에 v4 편입

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 서버 액션 — 생성·동기화 위임·수동실행·뷰 확장

**Files:**
- Modify: `apps/company-map/src/actions/infinite-buy.ts`

**Interfaces:**
- Consumes: Task 2 `starPct`/`px`, Task 5 `syncFillsFromToss`/`loadFillEvents`/`derivePositionFromFills`, Task 6 `runV4`/`tossV4Deps`
- Produces (UI가 사용):

```ts
export interface CycleView {
  // 기존 필드 유지 + v4 추가 필드 (v1/v2.2에선 전부 null)
  tValue: number | null; cashRemaining: number | null; starBase: number | null;
  note: string | null; starPrice: number | null; perBuyAmount: number | null;
}
// createCycle input에 version?: "v1" | "v2.2" | "v4.0"; starBase?: number 추가
```

- [ ] **Step 1: import 추가**

기존 import 아래에 추가:

```ts
import { starPct, px } from "@/lib/infinite-buy/strategy-v4";
import { syncFillsFromToss, loadFillEvents, derivePositionFromFills } from "@/lib/infinite-buy/sync";
import { runV4 } from "@/lib/infinite-buy/run-v4";
import { tossV4Deps } from "@/lib/infinite-buy/toss-adapter";
```

- [ ] **Step 2: CycleView 확장**

`CycleView` 인터페이스(13-33행)의 `realizedPnl` 아래에 추가:

```ts
  // v4.0 전용 (그 외 버전은 null)
  tValue: number | null;
  cashRemaining: number | null;
  starBase: number | null;
  note: string | null;
  starPrice: number | null;     // 오늘의 별지점 (평단 있을 때)
  perBuyAmount: number | null;  // 1회매수금 = 잔금/(분할−T)
```

- [ ] **Step 3: listCycles를 v4 인지형으로 수정**

기존 `return rows.map((c) => {...})` 블록(151-161행)을 다음으로 교체 (async 파생 때문에 for-of로 전환):

```ts
  const views: CycleView[] = [];
  for (const c of rows) {
    const h = live.get(c.symbol) ?? null;
    const isV4 = c.version === "v4.0";
    // v4 dryRun은 라이브 보유가 없으므로 가상 체결 이력에서 포지션 파생
    let avgPrice = h?.avg ?? null;
    let holdingQty: number | null = h?.qty ?? null;
    if (isV4 && c.dryRun) {
      const pos = derivePositionFromFills(await loadFillEvents(db, c.id));
      avgPrice = pos.avgPrice;
      holdingQty = pos.holdingQty;
    }
    const t = c.tValue;
    const v4Star =
      isV4 && t != null && c.starBase != null && avgPrice != null && avgPrice > 0
        ? px(avgPrice * (1 + starPct(t, c.splits, c.starBase) / 100))
        : null;
    const v4PerBuy =
      isV4 && t != null && c.cashRemaining != null && t <= c.splits - 1
        ? px(c.cashRemaining / (c.splits - t))
        : null;
    views.push({
      id: c.id, symbol: c.symbol, name: c.name, status: c.status, dryRun: c.dryRun, version: c.version,
      principal: c.principal, splits: c.splits, round: c.round, profitTarget: c.profitTarget,
      bigBuyPremium: c.bigBuyPremium, lossCut: c.lossCut, lastRunDate: c.lastRunDate,
      avgPrice, holdingQty, pnlPct: h?.pnl ?? null,
      targetSellPrice:
        isV4 && c.starBase != null && avgPrice != null && avgPrice > 0
          ? px(avgPrice * (1 + c.starBase / 100))
          : h && h.avg > 0 ? Math.round(h.avg * (1 + c.profitTarget / 100) * 100) / 100 : null,
      realizedPnl: pnlByCycle.get(c.id) ?? null,
      tValue: c.tValue, cashRemaining: c.cashRemaining, starBase: c.starBase, note: c.note,
      starPrice: v4Star, perBuyAmount: v4PerBuy,
    });
  }
  return views;
```

- [ ] **Step 4: createCycle v4 지원**

`createCycle`(164-185행)을 다음으로 교체:

```ts
const V4_STAR_BASE: Record<string, number> = { TQQQ: 15, SOXL: 20 };

export async function createCycle(input: {
  symbol: string; name: string; principal: number;
  splits?: number; profitTarget?: number; bigBuyPremium?: number; lossCut?: number;
  version?: "v1" | "v2.2" | "v4.0";
  starBase?: number; // v4.0 전용 — TQQQ/SOXL은 자동, 그 외 필수
}): Promise<{ ok: boolean; reason?: string }> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false, reason: "심볼 필요" };
  if (!(input.principal > 0)) return { ok: false, reason: "원금은 0보다 커야 함" };
  const exists = await db.infiniteBuyCycle.findFirst({ where: { symbol, status: "active" } });
  if (exists) return { ok: false, reason: "이미 active 사이클이 있는 종목" };

  const version = input.version === "v2.2" ? "v2.2" : input.version === "v4.0" ? "v4.0" : "v1";
  let v4Fields: { starBase: number; tValue: number; cashRemaining: number } | undefined;
  if (version === "v4.0") {
    const starBase = input.starBase ?? V4_STAR_BASE[symbol];
    if (!starBase || starBase <= 0) {
      return { ok: false, reason: "v4.0은 starBase 필요 (TQQQ 15/SOXL 20 자동, 그 외 직접 입력)" };
    }
    v4Fields = { starBase, tValue: 0, cashRemaining: input.principal };
  }

  await db.infiniteBuyCycle.create({
    data: {
      symbol, name: input.name.trim() || symbol, principal: input.principal,
      splits: input.splits ?? 40, profitTarget: input.profitTarget ?? 10,
      bigBuyPremium: input.bigBuyPremium ?? 12, lossCut: input.lossCut ?? 10,
      version,
      dryRun: true, // 항상 dryRun으로 시작
      ...(v4Fields ?? {}),
    },
  });
  revalidatePath("/stocks/infinite-buy");
  return { ok: true };
}
```

- [ ] **Step 5: syncSellFills를 lib 위임 래퍼로 교체**

`syncSellFills`(253-287행)의 try 블록 내부를 다음으로 교체 (시그니처·반환 형식 유지):

```ts
  try {
    const { updated } = await syncFillsFromToss(db, id, {
      getDefaultAccountSeq,
      getClosedOrders: (accountSeq, symbol, from) =>
        retryRead(() => getOrders(accountSeq, { status: "CLOSED", symbol, from })),
    });
    revalidatePath("/stocks/infinite-buy");
    return { ok: true, updated };
  } catch (e) {
    return { ok: false, updated: 0, reason: e instanceof Error ? e.message : String(e) };
  }
```

(함수 위 주석도 갱신: "매도" → "매수·매도 체결 확인·저장". BUY까지 filled로 기록되지만 v1/v2.2 로직은 filled BUY를 읽지 않으므로 무영향. `cycle`/`accountSeq`/`from`/`orders` 지역변수 등 대체된 코드는 제거.)

- [ ] **Step 6: runCycleNow v4 분기**

`runCycleNow`(290-305행)의 `const config: CycleConfig = {` 앞에 삽입:

```ts
  if (c.version === "v4.0") {
    const tradeDate = new Date().toISOString().slice(0, 10);
    const r = await runV4(db, tossV4Deps(), c.id, tradeDate, isKilled());
    revalidatePath("/stocks/infinite-buy");
    return r.blocked ? { ok: false, reason: r.blocked } : { ok: true };
  }
```

- [ ] **Step 7: 타입체크 + 회귀 + eslint**

Run: `cd apps/company-map && npx tsc --noEmit; cd ../..` 그리고 `yarn workspace company-map test` 그리고 `cd apps/company-map && npx eslint src/actions/infinite-buy.ts; cd ../..`
Expected: 모두 통과 (eslint 에러 0)

- [ ] **Step 8: Commit**

```bash
git add apps/company-map/src/actions/infinite-buy.ts
git commit -m "feat(company-map): v4 액션 - 생성·체결동기화 위임·수동실행·뷰 확장

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 대시보드 UI — v4 생성 옵션 + 상태 표시

**Files:**
- Modify: `apps/company-map/src/app/stocks/infinite-buy/InfiniteBuyManager.tsx`

**Interfaces:**
- Consumes: Task 8의 `CycleView` v4 필드(`tValue`/`cashRemaining`/`starPrice`/`perBuyAmount`/`note`), `createCycle`의 `starBase` 입력
- Produces: 사용자용 v4 사이클 생성·모니터링 UI

- [ ] **Step 1: 생성 폼 — 버전 옵션·starBase 입력**

state 선언(46행)을 교체:

```ts
  const [version, setVersion] = useState<"v1" | "v2.2" | "v4.0">("v1");
  const [starBase, setStarBase] = useState("");
```

`onCreate`(54-61행)를 교체:

```ts
  const onCreate = () =>
    start(async () => {
      setMsg(null);
      const r = await createCycle({
        symbol, name, principal: Number(principal), version,
        starBase: starBase ? Number(starBase) : undefined,
      });
      if (!r.ok) { setMsg(r.reason ?? "실패"); return; }
      setSymbol(""); setName(""); setPrincipal(""); setVersion("v1"); setStarBase("");
      router.refresh();
    });
```

전략 select(260-267행)를 교체하고 starBase 입력 추가:

```tsx
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">전략</span>
            <select value={version} onChange={(e) => setVersion(e.target.value as "v1" | "v2.2" | "v4.0")}
              className="w-28 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
              <option value="v1">v1</option>
              <option value="v2.2">v2.2</option>
              <option value="v4.0">v4.0</option>
            </select>
          </label>
          {version === "v4.0" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">별% base</span>
              <input type="number" value={starBase} onChange={(e) => setStarBase(e.target.value)}
                placeholder="TQQQ 15 / SOXL 20 자동"
                className="w-40 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
            </label>
          )}
```

- [ ] **Step 2: 매도 kind 라벨 추가**

`sellKindLabel`(22-30행)의 switch에 케이스 추가:

```ts
    case "sell_loc_star": return "쿼터(LOC@별지점)"; // v4 ¼
    case "sell_lim_target": return "지정가(+base%)";  // v4 ¾
```

- [ ] **Step 3: 사이클 카드 — v4 상태 표시**

status 배지(293-295행) 아래(version 배지 다음)에 note 경고 배지 추가:

```tsx
                  {c.note && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title={c.note}>
                      ⚠ {c.note.length > 30 ? `${c.note.slice(0, 30)}…` : c.note}
                    </span>
                  )}
```

기존 통계 그리드(312-326행)의 `<div><span className="text-gray-500">진행</span> {c.round}/{c.splits}</div>`를 다음으로 교체:

```tsx
                <div>
                  <span className="text-gray-500">진행</span>{" "}
                  {c.version === "v4.0"
                    ? `T ${c.tValue == null ? "—" : c.tValue.toFixed(2)}/${c.splits}`
                    : `${c.round}/${c.splits}`}
                </div>
```

같은 그리드의 `마지막실행` div 앞에 v4 전용 항목 추가:

```tsx
                {c.version === "v4.0" && (
                  <>
                    <div><span className="text-gray-500">잔금</span> {usd(c.cashRemaining)}</div>
                    <div><span className="text-gray-500">별지점</span> {usd(c.starPrice)}</div>
                    <div><span className="text-gray-500">1회매수금</span> {usd(c.perBuyAmount)}</div>
                  </>
                )}
```

- [ ] **Step 4: eslint + 타입체크**

Run: `cd apps/company-map && npx eslint src/app/stocks/infinite-buy/InfiniteBuyManager.tsx && npx tsc --noEmit; cd ../..`
Expected: 에러 0 (주의: useEffect 내 동기 setState 금지 규칙 — 이 변경은 이벤트 핸들러만 사용하므로 해당 없음)

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/app/stocks/infinite-buy/InfiniteBuyManager.tsx
git commit -m "feat(company-map): 무한매수 대시보드 v4 표시 - 생성 옵션·T/잔금/별지점·경고 배지

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: 통합 검증 + 재시작 안내

**Files:** 없음 (검증 전용)

**Interfaces:**
- Consumes: 전체
- Produces: 검증 완료 보고 + 사용자 액션 안내

- [ ] **Step 1: 전체 테스트**

Run: `yarn workspace company-map test`
Expected: 전체 PASS (기존 + strategy-v4 + dry-fill + sync)

- [ ] **Step 2: 변경 파일 eslint**

Run:
```bash
cd apps/company-map && npx eslint \
  src/lib/infinite-buy/strategy-v4.ts src/lib/infinite-buy/strategy-v4.test.ts \
  src/lib/infinite-buy/dry-fill.ts src/lib/infinite-buy/dry-fill.test.ts \
  src/lib/infinite-buy/sync.ts src/lib/infinite-buy/sync.test.ts \
  src/lib/infinite-buy/run-v4.ts src/lib/infinite-buy/toss-adapter.ts \
  src/lib/toss/client.ts src/actions/infinite-buy.ts \
  src/app/stocks/infinite-buy/InfiniteBuyManager.tsx ../..//apps/company-map/worker/infinite-buy-loop.ts 2>/dev/null \
  || npx eslint src/lib/infinite-buy/ src/actions/infinite-buy.ts src/app/stocks/infinite-buy/InfiniteBuyManager.tsx worker/infinite-buy-loop.ts
cd ../..
```
Expected: 에러 0

- [ ] **Step 3: 타입체크**

Run: `cd apps/company-map && npx tsc --noEmit; cd ../..`
Expected: 에러 0

- [ ] **Step 4: 사용자 안내 (실행하지 말 것 — 안내만)**

최종 보고에 다음을 포함한다:
1. **Prisma 스키마가 바뀌었으므로 dev 서버(3004)와 worker 재시작 필요** — 사용자의 `nps dev`/worker 프로세스를 직접 죽이지 말고 재시작을 요청.
2. 재시작 후 스모크 절차: 대시보드에서 **SOXL · v4.0 · dryRun** 사이클 생성(원금은 부록 A 참고 — SOXL $30 수준이면 $3,000 이상 권장) → "지금 실행" → 주문 이력에 `first_big_loc` simulated 1건 확인 → 다음 거래일 이후 재실행 시 `simulated_filled` 전환·T/잔금 갱신 확인.
3. LIVE 전환은 dryRun 며칠 관찰 후 사용자 판단(스펙 확정 사항).

---

## 계획 셀프 리뷰 결과 (작성 시 반영 완료)

- 스펙 §3~§10 전 항목이 Task 1~9에 매핑됨. 스펙과의 차이(계획 단계에서 정밀화): ① v4 매수 kind를 ΔT 가중치 유도 가능하게 `loc_star_half/loc_avg_half/loc_star_full`로 세분화, ② `run.ts` 수정 대신 신규 `run-v4.ts`(순서 불변식 강제), ③ 미체결 simulated 주문 종료 상태 `expired` 도입, ④ `DailyCandle.high` 확장, ⑤ 사이클 `note` 필드(경고 배지 저장). — 스펙 문서에 동일 내용 반영됨.
- 타입 일관성: `V4State`/`V4Order`/`FillEvent`/`V4RunDeps` 시그니처를 Interfaces 블록에 고정, 태스크 간 동일 명칭 사용 확인.
- 플레이스홀더 없음 (모든 코드 스텝에 전체 코드 포함).
