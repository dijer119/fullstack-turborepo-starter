# QQQ·QLD 적립식 — 금액 기반 주문 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DCA 전략의 주문 형태를 LOC 지정가(정수 수량)에서 토스 금액 기반 시장가 주문(`orderAmount`, 소수점 수량)으로 바꿔, 매 거래일 설정 금액이 정확히 투입되게 한다.

**왜:** 정수 수량 제약 때문에 QQQ는 약 21거래일마다, QLD는 약 3거래일마다 매수된다. 정상 구간에 현금이 3주씩 고이고 하락이 시작되면 그 뭉치가 한꺼번에 QLD로 들어가는 **체계적 왜곡**이 생긴다. 백테스트가 검증한 "매일 균등 투입"과 다른 전략이 되어버린다. 금액 기반으로 바꾸면 체결가가 종가에서 장중 시세로 바뀌는 대신(방향성 없는 노이즈) 이 왜곡이 사라진다.

**Architecture:** 순수 함수(`peak.ts`·`state.ts`)는 손대지 않는다. 바뀌는 것은 사이징(`sizing.ts`), 주문 제출·체결 경로(`run-dca.ts`, `toss-deps.ts`), 그리고 그 위의 액션·UI·문서다. dryRun은 시장가 주문의 실제 동작대로 **주문 즉시 체결 처리**하므로 기존 2단계 정산(일봉 재조회 → 판정)이 dryRun 경로에서 사라진다. LIVE는 실체결 수량을 나중에 알 수 있으므로 기존 정산 경로를 유지한다.

**Tech Stack:** Next.js 16 App Router · Prisma 6 (SQLite, `@prisma-clients/company-map`) · Vitest · 토스증권 Open API v1.2.14

**근거 문서:** 토스 OpenAPI 명세 `components.schemas.OrderCreateRequest` — https://openapi.tossinvest.com/openapi-docs/latest/openapi.json

## Global Constraints

- 작업 디렉토리 `/Users/dijer/dev/workspace/fullstack-turborepo-starter`, 앱 코드는 `apps/company-map/`.
- **dev 서버를 시작·재시작·종료하지 말 것.** 포트 3004는 사용자의 `nps dev`가 관리한다. 죽이면 사용자의 다른 앱까지 내려간다.
- **실주문을 절대 넣지 말 것.** `createOrder`를 스크립트·`tsx -e`·테스트에서 실행 금지. `dryRun: false`는 **테스트 파일 안의 인메모리 객체 리터럴에서만** 허용된다(실DB의 계좌에는 금지).
- **lint를 게이트로 쓸 수 없음** — 기존 파일의 `react-hooks/set-state-in-effect` 에러로 워크스페이스 lint가 항상 exit 1. 변경 파일만 `cd apps/company-map && npx eslint <files>`로 스코프.
- useEffect 안 동기 `setState` 금지(`await` 이후는 허용).
- 테스트: `yarn workspace company-map test`. 단일 파일은 `yarn workspace company-map vitest run src/lib/dca/<file>.test.ts`.
- 커밋은 승인됨. **경로 명시 `git add`만** 사용하고 `git add -A`/`git add .` 금지 — 워킹트리에 사용자의 무관한 미커밋 변경이 있다(`apps/company-map/src/actions/infinite-buy.ts`, `apps/company-map/src/app/stocks/infinite-buy/InfiniteBuyManager.tsx`, `.recall/` 여러 개, `apps/api/data/all_safety_margin_results.json`). 그대로 미커밋으로 남겨야 한다.
- 커밋 메시지 본문 끝에 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- 금액 단위 엄수: `cashKrw`·`dailyAmountKrw`·`amountKrw`는 **원(KRW)**, `amountUsd`·`price`는 **달러(USD)**.
- 거래일은 `YYYY-MM-DD` 문자열(US 거래일).
- `src/lib/dca/peak.ts`·`state.ts`와 그 테스트는 **변경 금지**(로직이 그대로 유효하다).

## 토스 명세 요약 (이 계획의 사실 근거)

`POST /api/v1/orders`의 요청 본문은 `oneOf` 두 스키마다.

**수량 기반** (`OrderCreateQuantityBased`) — 현재 우리가 쓰는 것
- `quantity` 필수. "기본: 양의 정수만 가능합니다. 소수점 수량: 미국 주식 시장가 매도(`orderType=MARKET` + `side=SELL`) 주문에만 허용됩니다. 그 외(매수/지정가/국내) 소수점 수량은 `400 invalid-request` 를 반환합니다. **소수점 매수는 `orderAmount` 를 사용하세요.**"
- `timeInForce` enum `DAY | CLS | OPG`. `CLS`는 "현재 미국 주식 + `orderType=LIMIT` 조합만 지원".

**금액 기반** (`OrderCreateAmountBased`) — 전환 대상
- 허용 필드가 `clientOrderId`, `symbol`, `side`, `orderType`, `orderAmount`, `confirmHighValueOrder` **뿐이다**. `timeInForce`·`price`·`quantity`를 받지 않는다.
- `orderType` enum은 `MARKET` 하나.
- `orderAmount`: "주문 금액 (달러). 지정한 금액만큼 주문합니다. 체결 수량은 체결 시점의 시장가에 따라 결정됩니다." / "정규장 시작부터 정규장 종료 1시간 전까지만 접수 가능합니다. 그 외 시간 요청 시 `422 amount-order-outside-regular-hours`."
- 타입은 `string`, `pattern: ^\d+(\.\d+)?$`.
- 최소·최대 금액은 서버가 정하며 위반 시 에러의 `data.limits`(`minimum`/`maximum` + `currency`)로 알려준다. **클라이언트에서 임의 하한을 만들지 말 것** — `0.01` 미만 방어만 둔다.

`clientOrderId`: "클라이언트 지정 주문 식별자. 멱등성 키로 사용됩니다. … 동일 값으로 재요청 시 이전 주문 결과를 그대로 재반환합니다. … 최대 36자, 영숫자 및 `-`, `_` 허용. 멱등성 키는 10분간 유효."

---

### Task 1: 토스 클라이언트에 금액 기반 주문 지원 추가

**Files:**
- Modify: `apps/company-map/src/lib/toss/client.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `CreateOrderInput`이 금액 기반 주문을 표현할 수 있게 되고, `createOrder`가 그 형태를 올바른 본문으로 보낸다. 이후 Task 4의 `toss-deps.ts`가 이를 사용한다.

- [ ] **Step 1: 현재 코드 확인**

`createOrder`와 `CreateOrderInput`을 읽는다. 현재는 `quantity`가 필수이고 본문에 항상 `quantity`와 `timeInForce`를 넣는다. 이 함수는 **무한매수법과 VR도 사용**하므로 기존 호출부의 동작이 바뀌면 안 된다.

- [ ] **Step 2: 타입을 두 형태의 유니온으로 바꾼다**

`CreateOrderInput`을 수량 기반과 금액 기반의 유니온으로 만든다. 공통 필드(`symbol`, `side`, `clientOrderId?`, `confirmHighValueOrder?`)를 뽑고, 수량 기반은 `orderType: OrderType` + `quantity: string` + `price?` + `timeInForce?`, 금액 기반은 `orderType: "MARKET"` + `orderAmount: string`으로 구분한다. 판별은 `orderAmount` 필드의 존재 여부로 한다.

기존 호출부(무한매수·VR)는 `quantity`를 넘기므로 수량 기반으로 추론되어야 하고, 타입 에러가 나면 안 된다. `npx tsc --noEmit`으로 확인한다.

- [ ] **Step 3: `createOrder`의 본문 조립을 분기한다**

금액 기반일 때 보내는 본문은 정확히 `symbol`, `side`, `orderType: "MARKET"`, `orderAmount`, 그리고 있을 때만 `clientOrderId`·`confirmHighValueOrder`다. **`quantity`·`price`·`timeInForce`를 넣지 말 것** — 명세의 `oneOf` 분기가 다르므로 넣으면 거절될 수 있다.

수량 기반 경로는 지금 동작을 그대로 유지한다(`timeInForce`의 `?? "DAY"` 기본값 포함).

`clientOrderId`는 두 형태 모두에서 전달됐을 때만 본문에 넣는다.

- [ ] **Step 4: 타입 체크**

Run: `cd apps/company-map && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "toss/client|infinite-buy|vr/" || echo "타입 에러 없음"`
Expected: `타입 에러 없음` — 특히 무한매수·VR의 기존 `createOrder` 호출이 깨지지 않아야 한다.

- [ ] **Step 5: 기존 전략 테스트가 그대로 통과하는지 확인**

Run: `yarn workspace company-map test`
Expected: 전체 통과. 이 태스크는 기존 동작을 바꾸지 않는 순수 추가여야 한다.

- [ ] **Step 6: lint**

Run: `cd apps/company-map && npx eslint src/lib/toss/client.ts`
Expected: 에러 없음

- [ ] **Step 7: Commit**

```bash
git add apps/company-map/src/lib/toss/client.ts
git commit -m "feat(company-map): 토스 클라이언트 금액 기반 주문(orderAmount)·clientOrderId 지원"
```

---

### Task 2: Prisma 스키마를 금액 기반 주문에 맞춘다

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma`

**Interfaces:**
- Consumes: 없음
- Produces: `DcaAccount`에서 `premiumPct`가 사라지고, `DcaOrder`가 `amountUsd`·`clientOrderId`를 갖고 `price`·`quantity`·`tif`가 nullable이 된다. Task 3~5가 이 모양을 전제한다.

**중요:** `dca_accounts`·`dca_orders` 두 테이블은 **0행**이다(확인됨). 파괴적 마이그레이션의 위험이 없다.

- [ ] **Step 1: 현재 두 모델을 읽는다**

`apps/company-map/prisma/schema.prisma`의 `DcaAccount`·`DcaOrder`를 읽는다. 현재 `DcaOrder.price`·`quantity`·`tif`는 non-null이고 `DcaAccount.premiumPct`는 `Float @default(5)`다.

- [ ] **Step 2: 스키마를 수정한다**

`DcaAccount`:
- `premiumPct` 필드를 **삭제**한다. 금액 기반 주문에는 지정가가 없어 프리미엄 개념이 존재하지 않는다.

`DcaOrder`:
- `amountUsd Float @map("amount_usd")` 추가 — 주문한 달러 금액. 금액 기반 주문의 핵심 값이다.
- `clientOrderId String? @map("client_order_id")` 추가 — 멱등성 키. dryRun에서는 null.
- `price` → `Float?`로 바꾸고 주석을 "주문 시점 참조 시세(감사용). 금액 기반 주문에는 지정가가 없다"로 고친다.
- `quantity` → `Float?`로 바꾸고 주석을 "주문 시점 예상 수량(감사용). 실제 수량은 체결 시 결정된다"로 고친다.
- `tif` → `String?`로 바꾸고 주석에 "금액 기반 주문에는 없음"을 남긴다.
- `status` 주석을 새 목록으로 갱신한다. 현재 값 중 `expired`는 금액 기반 dryRun에서 발생하지 않지만 LIVE 경로에는 남으므로 유지한다.

다른 모델은 건드리지 말 것.

- [ ] **Step 3: 마이그레이션 생성·적용**

Run: `yarn workspace company-map prisma migrate dev --name dca_amount_based_orders`
Expected: 마이그레이션 디렉토리가 생성되고 `Your database is now in sync with your schema.` 출력. SQLite는 컬럼 삭제·nullable 변경 시 테이블을 재생성하므로 생성된 `migration.sql`을 읽어 **의도한 테이블만** 재생성되는지 확인한다.

- [ ] **Step 4: 새 모양이 실제로 반영됐는지 확인**

Run:
```bash
cd apps/company-map && npx tsx -e '
import { PrismaClient } from "@prisma-clients/company-map";
const db = new PrismaClient();
(async () => {
  console.log("dcaAccount=", await db.dcaAccount.count(), "dcaOrder=", await db.dcaOrder.count());
  await db.$disconnect();
})();
'
```
Expected: `dcaAccount= 0 dcaOrder= 0` — 에러 없이 출력되면 새 클라이언트가 생성된 것이다.

- [ ] **Step 5: tsc로 깨진 참조를 찾는다**

Run: `cd apps/company-map && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "dca" | head -20`
Expected: `premiumPct`·`price`·`quantity`를 쓰는 곳에서 에러가 **나는 것이 정상**이다(Task 3~5에서 고친다). 어떤 파일의 어떤 줄이 걸리는지 목록을 리포트에 남겨 이후 태스크가 참고하게 한다. 이 태스크에서 그 파일들을 고치지 말 것.

- [ ] **Step 6: Commit**

```bash
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "feat(company-map): DCA 스키마 금액 기반 전환 (premiumPct 삭제, amountUsd·clientOrderId 추가)"
```

---

### Task 3: 사이징을 금액 기반으로 바꾼다

**Files:**
- Modify: `apps/company-map/src/lib/dca/sizing.ts`
- Modify: `apps/company-map/src/lib/dca/sizing.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수)
- Produces:
  - `DcaAmountPlan = { amountUsd: number; amountKrw: number }`
  - `planAmountBuy(args: { cashKrw: number; fxRate: number }): DcaAmountPlan | null`
  - `estimateQuantity(amountUsd: number, price: number): number` — 표시·시뮬레이션용 예상 수량
  - 삭제: `DcaBuyPlan`, `planBuy`, `tradingDaysToOneShare`, `locLimit`

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`sizing.test.ts`를 새 계약으로 전면 교체한다. 아래 케이스를 포함할 것 — 수치는 2026-08-27 실측값(USD/KRW 1379.1, QQQ $715.87, QLD $90.07)을 쓴다.

```ts
import { describe, expect, it } from "vitest";
import { estimateQuantity, planAmountBuy } from "./sizing";

describe("planAmountBuy", () => {
  it("잔액을 당일 환율로 환산해 센트 단위로 절삭한다", () => {
    // 50,000 / 1379.1 = 36.2555... → 36.25 (절삭, 반올림 아님)
    const r = planAmountBuy({ cashKrw: 50_000, fxRate: 1379.1 })!;
    expect(r.amountUsd).toBe(36.25);
    expect(r.amountKrw).toBe(Math.round(36.25 * 1379.1));
  });

  it("절삭분은 amountKrw에서 빠져 잔액으로 이월된다", () => {
    const r = planAmountBuy({ cashKrw: 50_000, fxRate: 1379.1 })!;
    expect(r.amountKrw).toBeLessThan(50_000);
  });

  it("정수로 나누어떨어지는 경우", () => {
    const r = planAmountBuy({ cashKrw: 100_000, fxRate: 1000 })!;
    expect(r.amountUsd).toBe(100);
    expect(r.amountKrw).toBe(100_000);
  });

  it("환산액이 1센트 미만이면 null (주문 불가)", () => {
    expect(planAmountBuy({ cashKrw: 10, fxRate: 1379.1 })).toBeNull();
  });

  it("비정상 입력은 null", () => {
    expect(planAmountBuy({ cashKrw: 0, fxRate: 1379.1 })).toBeNull();
    expect(planAmountBuy({ cashKrw: -1000, fxRate: 1379.1 })).toBeNull();
    expect(planAmountBuy({ cashKrw: 50_000, fxRate: 0 })).toBeNull();
    expect(planAmountBuy({ cashKrw: 50_000, fxRate: Number.NaN })).toBeNull();
    expect(planAmountBuy({ cashKrw: Number.NaN, fxRate: 1379.1 })).toBeNull();
    expect(planAmountBuy({ cashKrw: Number.POSITIVE_INFINITY, fxRate: 1379.1 })).toBeNull();
  });

  it("잔액이 커도 상한 없이 그대로 환산한다 (정수 수량 제약이 없어짐)", () => {
    const r = planAmountBuy({ cashKrw: 3_000_000, fxRate: 1379.1 })!;
    expect(r.amountUsd).toBeCloseTo(2175.33, 2);
  });
});

describe("estimateQuantity", () => {
  it("금액 ÷ 시세, 소수 6자리", () => {
    // 36.25 / 715.87 = 0.050638...
    expect(estimateQuantity(36.25, 715.87)).toBeCloseTo(0.050638, 6);
    // QLD는 같은 금액으로 훨씬 많이 산다
    expect(estimateQuantity(36.25, 90.07)).toBeCloseTo(0.402465, 6);
  });

  it("시세가 비정상이면 0", () => {
    expect(estimateQuantity(36.25, 0)).toBe(0);
    expect(estimateQuantity(36.25, Number.NaN)).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/dca/sizing.test.ts`
Expected: FAIL — `planAmountBuy`·`estimateQuantity`가 없다는 에러

- [ ] **Step 3: 구현으로 교체한다**

`sizing.ts`를 새 계약으로 전면 교체한다. 파일 상단 주석도 새 모델을 설명하게 고친다 — 요지는 "토스 금액 기반 주문(`orderAmount`)은 달러 금액을 확정하고 수량이 변동한다. 정수 수량 제약이 없으므로 매 거래일 잔액 전액을 투입한다. 센트 단위 절삭분만 다음 거래일로 이월된다."

- `planAmountBuy`: `cashKrw`·`fxRate`를 `Number.isFinite`로 검증(양수 요구), `amountUsd = Math.floor(cashKrw / fxRate * 100) / 100`, `amountUsd < 0.01`이면 null, `amountKrw = Math.round(amountUsd * fxRate)`.
- `estimateQuantity`: `price`가 유한한 양수가 아니면 0, 아니면 `Math.round(amountUsd / price * 1e6) / 1e6`.
- `locLimit`·`planBuy`·`tradingDaysToOneShare`·`DcaBuyPlan`을 삭제한다.

**절삭(`Math.floor`)을 반올림으로 바꾸지 말 것** — 올림·반올림하면 잔액보다 큰 금액을 주문할 수 있다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/dca/sizing.test.ts`
Expected: PASS

- [ ] **Step 5: lint**

Run: `cd apps/company-map && npx eslint src/lib/dca/sizing.ts src/lib/dca/sizing.test.ts`
Expected: 에러 없음

> **이 태스크 직후 전체 스위트는 일시적으로 red다.** `planBuy`를 삭제했으므로 아직 그것을 쓰는 `run-dca.ts`가 깨지고, 따라서 `run-dca.test.ts`도 실패한다. Task 4가 그것을 고친다. **`yarn workspace company-map test`(전체)를 이 태스크의 게이트로 쓰지 말고 `sizing.test.ts`만 확인할 것.** 전체가 red인 것은 이 시점에서 정상이며 결함이 아니다.

- [ ] **Step 6: Commit**

```bash
git add apps/company-map/src/lib/dca/sizing.ts apps/company-map/src/lib/dca/sizing.test.ts
git commit -m "feat(company-map): DCA 사이징을 금액 기반으로 전환 (planAmountBuy)"
```

---

### Task 4: 오케스트레이터와 어댑터를 금액 기반 주문으로 전환

이 태스크가 전환의 핵심이다. 실주문 경로가 걸려 있으니 신중하게.

**Files:**
- Create: `apps/company-map/src/lib/dca/market-window.ts`
- Modify: `apps/company-map/src/lib/dca/toss-deps.ts`
- Modify: `apps/company-map/src/lib/dca/run-dca.ts`
- Modify: `apps/company-map/src/lib/dca/run-dca.test.ts`
- Modify: `apps/company-map/src/lib/dca/toss-deps.test.ts`
- Modify: `apps/company-map/scripts/dca-smoke.ts`

**Interfaces:**
- Consumes: Task 1의 금액 기반 `createOrder`, Task 2의 스키마, Task 3의 `planAmountBuy`·`estimateQuantity`
- Produces:
  - `src/lib/dca/market-window.ts`: `isAmountOrderWindowOpen(): Promise<boolean>` (신규 파일)
  - `DcaRunDeps`: `submitOrder`의 시그니처가 `(accountSeq, o: { amountUsd: number; clientOrderId: string }, symbol) => Promise<{ tossOrderId: string }>`로 바뀌고, `isAmountOrderWindowOpen(): Promise<boolean>`가 추가되고, `getDailyCandle`이 제거된다
  - `run-dca.ts`: `settleDryOrders` 삭제, dryRun 즉시 체결

- [ ] **Step 1: 마감 창 헬퍼를 새 파일로 만든다**

먼저 `worker/us-market.ts`를 **읽기만** 한다 — 정규장 세션을 판정하는 기존 로직(`previousBusinessDay`/`today`/`nextBusinessDay`를 훑어 `regularMarket.startTime`/`endTime` 사이인지 보는 방식)의 참고용이다. **그 파일은 수정하지 말 것**: VR·무한매수 루프가 쓰고 있고, 금액 기반 창을 필요로 하는 것은 `run-dca`뿐이다.

새 파일 `src/lib/dca/market-window.ts`에 `isAmountOrderWindowOpen(): Promise<boolean>`를 만든다. `@/lib/toss/client`의 `getMarketCalendarUS`를 써서, `now >= open && now < close - 3600_000`인 세션이 하나라도 있으면 `true`를 반환한다. 조회 실패 시 에러를 로깅하고 **`false`를 반환한다**(fail-closed — 창을 모르면 주문하지 않는다).

세션 판정 로직이 `worker/us-market.ts`·`src/actions/dca.ts`의 `currentUsTradeDate()`와 비슷해 보이겠지만, **이 코드베이스는 이미 그 판정을 두 곳에 복제해 두는 관행**을 쓴다(`src/`가 `worker/`를 import하지 않기 위해). 그 관행을 따르고, `worker/`에서 import해 오지 말 것.

- [ ] **Step 2: 어댑터를 금액 기반으로 바꾼다**

`src/lib/dca/toss-deps.ts`를 수정한다.

- `submitOrder`: 인자를 `{ amountUsd: number; clientOrderId: string }`로 받고 `createOrder(accountSeq, { symbol, side: "BUY", orderType: "MARKET", orderAmount: String(amountUsd), clientOrderId })`를 호출한다. `price`·`quantity`·`timeInForce`를 넘기지 말 것.
- `assertSubmittable`: 정수 수량 검증을 **금액 검증으로 교체**한다 — `amountUsd`가 유한한 양수이고 `0.01` 이상이며 소수 2자리를 넘지 않아야 한다. `clientOrderId`는 비어 있지 않고 36자 이하이며 `^[A-Za-z0-9\-_]+$`를 만족해야 한다. 위반 시 throw(실주문 직전 방어 가드).
- `getDailyCandle`을 삭제한다 — dryRun이 즉시 체결로 바뀌어 일봉 재조회가 필요 없다. `getPrevTradeClose`는 peak 갱신에 계속 쓰이므로 **유지**한다.
- `isAmountOrderWindowOpen`을 deps에 추가하고 Step 1의 `market-window.ts` 헬퍼로 구현한다.
- `PEAK_SEED_COUNT`·`pickPrevTradeClose`·`isDcaKilled`는 유지한다.

`toss-deps.test.ts`에서 `assertSubmittable` 케이스를 새 계약으로 교체한다 — 정상 금액 통과, `0.005` 같은 1센트 미만 throw, 소수 3자리 throw, 음수·NaN throw, 잘못된 `clientOrderId`(빈 문자열·37자·공백 포함) throw. `pickPrevTradeClose` 케이스는 그대로 둔다.

- [ ] **Step 3: 오케스트레이터를 전환한다**

`src/lib/dca/run-dca.ts`를 수정한다. 파일 상단의 순서 주석도 실제와 맞게 고친다.

**삭제:** `settleDryOrders` 함수 전체, `judgeDryFill`·`DryCandle` import, `getDailyCandle` dep 사용처.

**정산 단계(①):** 이제 LIVE 정산만 남는다. `settleLiveOrders`는 그대로 유지하고, 계좌 모드와 무관하게 항상 실행하는 현재 방식을 유지한다(주문 행의 `dryRun: false, status: "submitted"`로 필터하므로 dryRun 계좌에서도 잔여 LIVE 행이 정산된다).

**주문 단계:** `planBuy` 대신 `planAmountBuy({ cashKrw: acc.cashKrw, fxRate: fx })`를 쓴다. 현재가는 여전히 필요하다 — 예상 수량과 dryRun 체결가에 쓰인다.

주문 직전에 **마감 창을 확인**한다. `await deps.isAmountOrderWindowOpen()`이 `false`면 주문을 만들지 않고, `lastRunDate`를 **갱신하고**(그날은 창이 닫혔으므로 재시도가 무의미하다), `note`에 "금액 기반 주문 접수 시간(정규장 종료 1시간 전) 경과 — 적립만 반영"을 남기고 정상 반환한다. 적립은 이미 ③단계에서 반영됐다.

**dryRun 기록:** 주문 행을 만들 때 바로 체결 상태로 기록한다 —
```
status: "simulated_filled"
dryRun: true
amountUsd: plan.amountUsd
amountKrw: plan.amountKrw
fxRate: fx
price: <주문 시점 시세>        // 감사용 참조가
quantity: estimateQuantity(plan.amountUsd, price)   // 예상 수량
filledQty: 같은 예상 수량
filledPrice: <주문 시점 시세>
filledAt: tradeDate
clientOrderId: null
tif: null
stateApplied: null            // 아래 차감이 이 마커를 세운다
```
그리고 **같은 실행 안에서** `applyPendingFills`를 다시 호출해 이 체결을 `cashKrw`에서 차감하고 `stateApplied`를 세운다. 차감액은 `state.ts`의 `applyFills`가 `filledPrice × filledQty × fxRate`로 계산하므로 `amountKrw`와 센트 절삭 수준의 오차만 난다 — `state.ts`를 수정하지 말고 그 결과를 권위로 둔다.

**LIVE 제출:** 현재 구조(주문 행을 `submitOrder` **앞에** `status: "submitting"`으로 만들고, 성공 시 같은 행을 `submitted` + `tossOrderId`로 갱신, 실패 시 `submit_unknown` + note)를 **그대로 유지**한다. 이 뮤텍스 순서는 중복 실주문 방어의 핵심이므로 깨지 않을 것. 달라지는 것은 제출 인자와, `clientOrderId`를 만들어 행에도 저장하고 제출에도 넘긴다는 점이다.

`clientOrderId` 형식: `dca-<accountId의 앞 8자>-<tradeDate에서 하이픈 제거>` (예 `dca-a1b2c3d4-20260828`). 36자 이하이고 `^[A-Za-z0-9\-_]+$`를 만족한다. 같은 계좌·같은 거래일이면 항상 같은 값이 되어야 한다 — 토스의 10분 멱등성 창이 워커와 "지금 실행"의 동시 제출을 막아준다.

예수금 가드(`!(buyingPower >= ...)`)는 유지하되 비교 대상을 `plan.amountUsd`로 바꾼다.

- [ ] **Step 4: 오케스트레이터 테스트를 재작성한다**

`run-dca.test.ts`의 fake db·fake deps 골격은 재사용하고 케이스를 새 동작에 맞춘다. fake `dcaAccount.update`가 Prisma의 `{ increment }`/`{ decrement }` 연산자 객체를 **실제로 해석**하는 현재 구현을 반드시 유지할 것 — 무시하면 모든 금액 단정이 무의미해진다.

덮어야 할 것:
- **dryRun 매일 체결**: 잔액 50,000원·환율 1379.1·시세 715.87에서 1회 실행 → 주문 1건이 `simulated_filled`로 생기고 `cashKrw`가 `적립 후 잔액 − round(filledPrice × filledQty × fxRate)`로 줄어든다. 정확한 수치를 단정할 것.
- **멱등**: `lastRunDate`만 되돌려 재실행해도 적립·주문·차감이 반복되지 않는다.
- **연속 2거래일**: D일 체결 후 D+1일에도 정상 체결되고 잔액이 두 번 적립·두 번 차감된다(이전 모델의 "다음날 정산" 단계가 없어졌음을 확인).
- **마감 창 닫힘**: `isAmountOrderWindowOpen`이 `false`면 주문 행이 0건이고 적립은 반영되며 `lastRunDate`가 갱신되고 `note`가 설정된다.
- **1센트 미만**: 잔액이 아주 작으면 주문 없이 적립만.
- **LIVE 제출 성공**: 주문 행이 `submitOrder` **호출 전에** 존재하고(스텁 안에서 스토어를 스냅샷해 순서를 실제로 관측할 것), 같은 행이 `submitted`로 갱신되며, `submitOrder`에 넘어간 인자가 `{ amountUsd, clientOrderId }` 형태이고 `clientOrderId`가 규격을 만족한다.
- **LIVE 제출 실패**: `submit_unknown` + note + `lastRunDate` 갱신 + 차감 없음.
- **예수금 부족·NaN**: 행을 만들지 않고 보류하며 `submitOrder`가 호출되지 않는다.
- **killed**: 아무것도 하지 않고 `blocked: "disabled"`.

LIVE 케이스에서 `dryRun: false`는 fake 객체 리터럴에만 쓴다 — 실DB·실주문 금지.

- [ ] **Step 5: 스모크 스크립트를 갱신한다**

`scripts/dca-smoke.ts`를 읽고 새 모델에 맞춘다. 이제 기본 적립액 50,000원으로도 **매 실행 주문이 생기고 체결된다**. 따라서 검증 문구를 바꿔야 한다 — 1회차에 `simulated: 1`이 나오고, `lastRunDate`만 되돌린 2회차에서 적립·주문·차감이 **중복되지 않는지**를 확인하는 것이 요지다. 임시 계좌를 `finally`에서 삭제하는 현재 구조는 유지한다. `dailyAmountKrw`를 임시로 키우는 단계는 이제 불필요하므로 제거한다.

- [ ] **Step 6: 타입 체크·테스트·lint**

Run: `cd apps/company-map && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/lib/dca|worker/" || echo "타입 에러 없음"`
Expected: `타입 에러 없음`. (`src/actions/dca.ts`와 UI의 에러는 Task 5에서 고치므로 이 grep 범위 밖이다.)

Run: `yarn workspace company-map vitest run src/lib/dca/`
Expected: `peak`·`state`·`sizing`·`toss-deps`·`run-dca` 전부 통과

Run: `cd apps/company-map && npx eslint src/lib/dca/*.ts scripts/dca-smoke.ts`
Expected: 에러 없음

- [ ] **Step 7: 스모크 실행**

Run: `cd apps/company-map && npx tsx scripts/dca-smoke.ts`
Expected: 1회차 `simulated: 1`(또는 새 결과 형태에 맞는 값), 2회차에서 주문·적립·잔액 불변, ✅ 라인, 임시 계좌 삭제. 실행 후 다음으로 잔여 행 0을 확인한다.

Run: `cd apps/company-map && npx tsx -e 'import { PrismaClient } from "@prisma-clients/company-map"; const db=new PrismaClient(); (async()=>{console.log("dcaAccount=",await db.dcaAccount.count(),"dcaOrder=",await db.dcaOrder.count()); await db.$disconnect();})();'`
Expected: `dcaAccount= 0 dcaOrder= 0`

미국 정규장이 닫혀 있으면 `isAmountOrderWindowOpen`이 `false`라 주문이 생기지 않을 수 있다. 그 경우 스모크가 마감 창 경로를 타는 것이 **정상**이며, 리포트에 그렇게 적고 주문 생성 경로는 Step 4의 단위 테스트로 검증됐음을 밝힌다.

- [ ] **Step 8: Commit**

```bash
git add apps/company-map/src/lib/dca apps/company-map/scripts/dca-smoke.ts
git commit -m "feat(company-map): DCA 오케스트레이터 금액 기반 주문 전환 (즉시 체결·마감창·clientOrderId 멱등)"
```

---

### Task 5: Server Actions와 화면을 새 모델에 맞춘다

**Files:**
- Modify: `apps/company-map/src/actions/dca.ts`
- Modify: `apps/company-map/src/app/stocks/dca/DcaManager.tsx`
- Modify: `apps/company-map/src/app/stocks/dca/page.tsx`

**Interfaces:**
- Consumes: Task 2~4 전부
- Produces: `DcaAccountView`에서 `premiumPct`가 사라지고 `plan`이 금액 기반이 된다. `CreateDcaInput`에서 `premiumPct`가 사라진다.

- [ ] **Step 1: 액션을 고친다**

`src/actions/dca.ts`를 읽고 다음을 반영한다.

- `CreateDcaInput`·`createDcaAccount`에서 `premiumPct`를 제거하고 그 검증도 지운다.
- `updateDcaSettings`의 patch에서 `premiumPct`를 제거하고 그 검증도 지운다. **`confirmLive` 게이트와 `Number.isFinite` 검증은 그대로 유지할 것** — 실거래 전환 보호와 NaN 차단은 이 전환과 무관하게 필요하다.
- `DcaAccountView`: `premiumPct` 제거. `plan`의 타입을 `DcaAmountPlan | null`로 바꾸고, `daysToOneShare`를 제거한다(정수 수량 제약이 없어져 의미가 없다). 대신 `estQuantity: number | null`을 추가해 "오늘 이 금액으로 몇 주 살지"를 보여준다.
- `listDcaAccounts`: `planBuy` 대신 `planAmountBuy({ cashKrw, fxRate })`, `tradingDaysToOneShare` 대신 `estimateQuantity(plan.amountUsd, pickedPrice)`를 쓴다. 보유수량 집계의 `dryRun: acc.dryRun` 필터는 유지한다.
- `runDcaNow`의 결과 메시지에서 "주문 없음(1주 미만)" 문구를 새 상황에 맞게 고친다 — 이제 주문이 없는 경우는 "마감 창 경과" 또는 "잔액 1센트 미만"이다.
- `runDcaNow`가 쓰는 `currentUsTradeDate()`는 **정규장 세션 판정 그대로 유지**한다(정산·적립은 세션 중 아무 때나 유효하다). 마감 창 판정은 `run-dca` 내부에서 한다.

- [ ] **Step 2: 화면을 고친다**

`DcaManager.tsx`:
- 생성 폼과 설정 폼에서 **"LOC 프리미엄 %" 필드를 제거**한다. `CreateForm`의 숫자 필드는 문자열 state + 제출 시 변환 패턴을, `SettingsForm`의 `useRef` 기반 "변경된 필드만 전송" 패턴을 **반드시 유지**할 것.
- 카드 배지의 `LOC +{premiumPct}%` 표기를 제거한다.
- "오늘 주문 미리보기"를 금액 기반으로 바꾼다 — 예: `QQQ 시장가 매수 · $36.25 (49,988원) · 약 0.0506주`. "1주 값에 못 미쳐 적립만 됩니다"와 "약 N거래일 후 1주 가능" 문구를 삭제하고, 주문이 없는 경우의 안내를 새 사유(마감 창 경과·잔액 부족)에 맞게 고친다.
- 주문 이력 테이블: "지정가" 열을 "주문금액"으로 바꿔 `amountUsd`를 보여주고, 수량은 소수가 표시되도록 자릿수를 조정한다(정수 표기 `fmt(x, 0)`를 쓰고 있으면 소수 4~6자리로).
- 낙폭·매수대상·미리보기 타일의 "(현재가 기준)" 캡션은 유지한다.

`page.tsx`: 설명 문구에서 LOC·종가 매수·"1주 미만" 관련 표현을 금액 기반 시장가 매수로 고친다. dryRun 경고 문구는 유지한다.

- [ ] **Step 3: 타입 체크·lint**

Run: `cd apps/company-map && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0, 에러 없음(이 태스크로 모든 참조가 정리되어야 한다)

Run: `cd apps/company-map && npx eslint src/actions/dca.ts src/app/stocks/dca/page.tsx src/app/stocks/dca/DcaManager.tsx`
Expected: 에러 없음. `react-hooks/set-state-in-effect`가 나오면 해당 `setState`를 `await` 뒤로 옮긴다(새 `useEffect`를 만들지 말 것).

- [ ] **Step 4: 페이지가 실제로 뜨는지 확인한다**

Run: `curl -s -o /tmp/dca-amt.html -w "GET /stocks/dca → %{http_code}\n" --max-time 60 http://localhost:3004/stocks/dca`

사용자의 dev 서버는 Task 2의 마이그레이션 이후 재시작되지 않았을 수 있다. 500이 나고 본문에 Prisma 관련 에러(모델·컬럼 미인식)가 있으면 **알려진 stale 클라이언트 문제이며 코드 결함이 아니다** — 본 것을 그대로 리포트에 적고 넘어간다. **서버를 재시작·종료하지 말 것.** 200이면 본문에서 헤딩과 "LOC 프리미엄"이 **사라졌는지** 확인한다.

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/actions/dca.ts apps/company-map/src/app/stocks/dca
git commit -m "feat(company-map): DCA 액션·화면 금액 기반 전환 (프리미엄 필드 제거, 예상 수량 표시)"
```

---

### Task 6: 문서 정합화 + 최종 검증

**Files:**
- Modify: `docs/superpowers/specs/2026-08-27-qqq-qld-dca-design.html`
- Modify: `docs/2026-08-27-qqq-qld-dca-handoff.html`
- Modify: `CLAUDE.md`
- Modify: `apps/company-map/README.md`

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 없음(문서·검증)

- [ ] **Step 1: 전체 검증**

Run: `yarn workspace company-map test`
Expected: 전체 통과. 총 파일 수·테스트 수를 리포트에 적는다(전환 전 기준: 43파일 343건).

Run:
```bash
cd apps/company-map && npx eslint src/lib/dca/*.ts src/actions/dca.ts \
  src/app/stocks/dca/page.tsx src/app/stocks/dca/DcaManager.tsx \
  src/lib/toss/client.ts worker/dca-loop.ts scripts/dca-smoke.ts
```
Expected: 에러 0

Run: `cd apps/company-map && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0

Run: `cd apps/company-map && npx tsx scripts/dca-smoke.ts` 후 잔여 행 0 확인
Expected: ✅ + `dcaAccount= 0 dcaOrder= 0`

- [ ] **Step 2: 스펙을 고친다**

`docs/superpowers/specs/2026-08-27-qqq-qld-dca-design.html`은 자체 완결형 HTML이다. 인라인 `<style>` 블록을 건드리지 말고, 제목 계층을 유지하며, 기존 HTML 관용구(`<table>`·`<code>`·`<li>`·`<blockquote>`)를 쓸 것. 본문에 markdown 구문을 넣지 말 것.

**소스를 읽고** 다음을 반영한다. 아래 목록이 전부라고 가정하지 말고 §4~§13을 훑어 코드와 어긋나는 문장을 모두 고칠 것.
- §4의 "매수 주문 방식 — LOC 종가매수" 결정을 **금액 기반 시장가**로 교체하고, 왜 바꿨는지(정수 수량이 만든 현금 고임·QLD 몰림의 체계적 왜곡)와 대가(체결가가 종가가 아닌 장중 시세)를 적는다. 토스 명세의 상호 배타성(`CLS`는 `LIMIT` 요구, `LIMIT`은 소수점 수량 거부, `orderAmount`는 `MARKET` 전용)을 근거로 인용한다.
- §5 데이터 모델을 Task 2의 실제 스키마와 일치시킨다(`premiumPct` 삭제, `amountUsd`·`clientOrderId` 추가, nullable 변경).
- §6 실행 흐름에서 dryRun 2단계 정산이 사라졌음과 마감 창 확인이 추가됐음을 반영한다. 단계 수와 교차 참조를 함께 갱신한다.
- §8 인터페이스를 실제 export와 일치시킨다(`planAmountBuy`·`estimateQuantity`·`usAmountOrderWindowOpen`, `DcaRunDeps`의 변경).
- §10 오류 처리에 마감 창 경과와 `422 amount-order-outside-regular-hours`를 추가한다.
- §11 테스트 계획을 실제 파일·케이스와 맞춘다.
- §12 한계: 체결가가 장중 시세라는 점을 추가하고, 이제 해결된 항목(`@@unique` 후속과제 → `clientOrderId` 멱등성으로 대체됨)을 갱신한다. 프리미엄 관련 한계는 삭제한다.

- [ ] **Step 3: 인수인계 문서를 고친다**

`docs/2026-08-27-qqq-qld-dca-handoff.html`의 다음을 갱신한다 — "LOC 프리미엄 %" 설명, "기본 설정의 실제 거동"(이제 매일 매수되므로 "21거래일에 1주"가 아니다), 검증 수치, 후속 과제에서 `@@unique` 항목(멱등성 키로 대체됨), 그리고 새 한계(장중 체결가·마감 창).

- [ ] **Step 4: `CLAUDE.md`와 README를 고친다**

`CLAUDE.md`의 company-map 주의사항에서 DCA 관련 불릿을 새 모델에 맞게 고친다 — 특히 동시 실행 레이스 불릿은 `clientOrderId` 멱등성으로 상당 부분 닫혔으므로 무엇이 닫히고 무엇이 남았는지 정확히 쓴다. 금액 기반 주문의 접수 시간 제약(정규장 종료 1시간 전)도 함정으로 남길 가치가 있다.

`apps/company-map/README.md`의 `## 기능` 항목에서 DCA 설명을 금액 기반으로 고친다.

두 파일은 Markdown이며 Markdown으로 유지한다.

- [ ] **Step 5: 문서 주장을 소스와 대조한다**

고친 각 섹션을 소스 파일과 다시 대조해 문장이 **존재하는 것이 아니라 사실인지** 확인한다. 확인한 것과 발견한 것을 리포트에 적는다.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-27-qqq-qld-dca-design.html \
        docs/2026-08-27-qqq-qld-dca-handoff.html \
        CLAUDE.md apps/company-map/README.md
git commit -m "docs(company-map): DCA 금액 기반 전환 문서 정합화"
```

---

## 부록: 전환 후 기대 거동 (2026-08-27 실측 기준)

USD/KRW 1379.1 · QQQ $715.87 · QLD $90.07 · 적립 50,000원/거래일 · 임계 10%

| 항목 | 전환 전 (LOC 정수) | 전환 후 (금액 기반) |
|---|---|---|
| QQQ 매수 주기 | 약 21거래일 | **매 거래일** |
| QLD 매수 주기 | 약 3거래일 | **매 거래일** |
| 1회 주문 | 1주 (약 104만원) | $36.25 (약 0.0506주) |
| 체결가 | 종가 | 주문 시점 시장가 |
| 미투입 잔액 | 최대 1주 값(약 104만원) | 센트 절삭분(수백원) |
| 접수 시간 | 정규장 (LOC) | 정규장 시작 ~ 종료 1시간 전 |

주문이 없는 정상 경우는 두 가지뿐이다 — 마감 창 경과, 그리고 잔액이 1센트 미만. "매일 주문이 생기는 것"이 이제 정상이다.
