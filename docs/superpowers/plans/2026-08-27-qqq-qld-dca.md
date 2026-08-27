# QQQ·QLD 적립식 전략 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** company-map에 "QQQ가 직전 최고가 대비 N% 이상 하락한 거래일에는 QLD, 그 외에는 QQQ를 매일 일정 원화만큼 매수"하는 적립식 전략을 운용·추적하는 메뉴를 추가한다.

**Architecture:** 기존 밸류리밸런싱 VR(`src/lib/vr/*` + `worker/vr-loop.ts`)과 동일한 4계층 구조를 따른다 — (1) 순수 함수 모듈(`src/lib/dca/{peak,sizing,state}.ts`)에 모든 판단·계산·상태전이를 담고 Vitest로 검증, (2) 얇은 오케스트레이터(`run-dca.ts`)가 DB·외부 의존성을 주입받아 순수 함수를 조립, (3) `worker/dca-loop.ts`가 US 정규장 중 15분 폴로 거래일당 1회 실행, (4) Server Actions + App Router 페이지가 화면을 담당. 자금 상태(`cashKrw`)는 주문 시점에 건드리지 않고 **체결 확정 시에만** 차감하며, 적립·차감·주문 생성 각각에 독립 멱등 가드를 둔다.

**Tech Stack:** Next.js 16 App Router · Prisma 6 (SQLite, 클라이언트 `@prisma-clients/company-map`) · Vitest · Tailwind v4 · 토스증권 Open API (`src/lib/toss/client.ts`)

**Spec:** `docs/superpowers/specs/2026-08-27-qqq-qld-dca-design.html`

## Global Constraints

- 작업 디렉토리는 모두 `/Users/dijer/dev/workspace/fullstack-turborepo-starter` 기준. 앱 코드는 `apps/company-map/`.
- **dev 서버를 백그라운드로 띄우지 말 것.** 사용자의 `nps dev`(turbo)가 포트 3004를 관리한다. 스키마 변경 없는 수정은 HMR로 반영된다. 부득이 재시작했으면 `lsof -ti tcp:3004 | xargs kill`로 정리.
- **Prisma 스키마 변경 후에는 dev 서버 재시작이 필수** — `src/lib/db.ts`가 `globalThis`에 PrismaClient를 캐싱하므로 generate만으로는 새 모델에 접근할 수 없다. Task 1 완료 후 사용자에게 재시작을 요청한다.
- **워크스페이스 lint를 게이트로 쓸 수 없다** — 기존 파일의 `react-hooks/set-state-in-effect` 에러로 `yarn workspace company-map lint`는 항상 exit 1. 검증은 변경 파일만 `cd apps/company-map && npx eslint <files>`로 스코프한다.
- **useEffect 안에서 동기 `setState` 금지** (`await` 이후는 허용) — 위 lint 규칙 때문.
- 테스트는 `yarn workspace company-map test` (Vitest). 단일 파일은 `yarn workspace company-map vitest run src/lib/dca/peak.test.ts`.
- 명시적 요청이 있을 때까지 **자동 커밋 금지**. 각 Task의 "Commit" 스텝은 커밋 메시지 초안까지 준비해 두고, 사용자 승인 후 실행한다.
- 실주문은 검증 중 절대 제출하지 않는다. 계좌는 항상 `dryRun: true`로 생성되고, LIVE 전환은 사용자가 UI에서 직접 한다.
- 거래일 문자열은 전부 `YYYY-MM-DD` (US 거래일). Prisma 필드는 snake_case `@map`.
- 금액 단위: `cashKrw`·`dailyAmountKrw`·`amountKrw`는 **원(KRW)**, `price`·`estUsd`는 **달러(USD)**. 혼용 금지.

---

### Task 1: Prisma 모델 추가 + 마이그레이션

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma` (파일 끝에 append)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: Prisma 모델 `DcaAccount`, `DcaOrder`. 이후 모든 태스크가 `db.dcaAccount` / `db.dcaOrder`로 접근한다.

- [ ] **Step 1: 스키마에 모델 2개 추가**

`apps/company-map/prisma/schema.prisma` 맨 끝에 아래를 그대로 붙인다.

```prisma
// QQQ·QLD 적립식: base 종목이 직전 최고가 대비 thresholdPct 이상 하락한 거래일에는
// leverSymbol을, 그 외에는 baseSymbol을 매 거래일 dailyAmountKrw만큼 LOC 매수한다.
model DcaAccount {
  id              String   @id @default(uuid())
  name            String                                    // 표시용 이름
  baseSymbol      String   @default("QQQ")  @map("base_symbol")
  leverSymbol     String   @default("QLD")  @map("lever_symbol")
  accountSeq      Int?     @map("account_seq")              // 토스 계좌(null=기본계좌)
  thresholdPct    Float    @default(10)     @map("threshold_pct")     // 이 % 이상 하락 시 레버리지
  dailyAmountKrw  Float    @default(50000)  @map("daily_amount_krw")  // 거래일당 적립액(원)
  premiumPct      Float    @default(5)      @map("premium_pct")       // LOC 지정가 프리미엄 %
  cashKrw         Float    @default(0)      @map("cash_krw")          // 미체결 이월 잔액(원)
  peakPrice       Float    @map("peak_price")                         // base 종목 최고 종가
  peakDate        String   @map("peak_date")
  startDate       String   @map("start_date")
  status          String   @default("active")                // active | paused | stopped
  dryRun          Boolean  @default(true)   @map("dry_run")
  note            String?                                    // 마지막 경고/보류 사유 (대시보드 배지)
  lastRunDate     String?  @map("last_run_date")             // 거래일당 1회 실행 보장
  lastAccrualDate String?  @map("last_accrual_date")         // 적립 멱등 마커 (lastRunDate와 분리)
  createdAt       DateTime @default(now())  @map("created_at")
  updatedAt       DateTime @updatedAt       @map("updated_at")

  orders DcaOrder[]

  @@map("dca_accounts")
}

model DcaOrder {
  id           String   @id @default(uuid())
  accountId    String   @map("account_id")
  tradeDate    String   @map("trade_date")     // US 거래일
  symbol       String                          // 실제 매수한 종목 (QQQ | QLD)
  side         String                          // BUY 고정
  kind         String                          // loc_buy 고정
  orderType    String   @map("order_type")     // LIMIT
  tif          String                          // CLS
  price        Float                           // LOC 지정가(상한)
  quantity     Float
  amountKrw    Float    @map("amount_krw")     // 주문 시 배정한 원화(추정)
  fxRate       Float    @map("fx_rate")        // 주문 시 USD/KRW — 체결 차감에 재사용
  drawdownPct  Float    @map("drawdown_pct")   // 판정에 쓴 낙폭(%) — 감사용
  filledQty    Float?   @map("filled_qty")
  filledPrice  Float?   @map("filled_price")
  filledAt     String?  @map("filled_at")
  tossOrderId  String?  @map("toss_order_id")
  stateApplied Boolean? @map("state_applied")  // cashKrw 반영 여부(멱등 마커)
  dryRun       Boolean  @map("dry_run")
  status       String                          // simulated | simulated_filled | expired | submitted | filled | failed
  error        String?
  createdAt    DateTime @default(now()) @map("created_at")

  account DcaAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId, tradeDate])
  @@map("dca_orders")
}
```

- [ ] **Step 2: 마이그레이션 생성·적용**

Run: `yarn workspace company-map prisma migrate dev --name add_dca_accounts`
Expected: `Your database is now in sync with your schema.` 그리고 `apps/company-map/prisma/migrations/<timestamp>_add_dca_accounts/migration.sql` 생성.

- [ ] **Step 3: 클라이언트 재생성 확인**

Run: `yarn workspace company-map prisma generate`
Expected: `Generated Prisma Client ... to ./node_modules/@prisma-clients/company-map`

- [ ] **Step 4: 테이블이 실제로 만들어졌는지 확인**

Run:
```bash
cd apps/company-map && npx tsx -e '
import { PrismaClient } from "@prisma-clients/company-map";
const db = new PrismaClient();
(async () => {
  console.log("dcaAccount count =", await db.dcaAccount.count());
  console.log("dcaOrder count =", await db.dcaOrder.count());
  await db.$disconnect();
})();
'
```
Expected: `dcaAccount count = 0` / `dcaOrder count = 0` (에러 없이 0 출력)

- [ ] **Step 5: 사용자에게 dev 서버 재시작 요청**

`src/lib/db.ts`의 `globalThis` 캐시 때문에 실행 중인 dev 서버는 새 모델을 모른다. 사용자에게 "`nps dev`를 재시작해 주세요"라고 알리고 확인을 받은 뒤 다음 태스크로 넘어간다. (여기서 직접 dev 서버를 띄우지 말 것.)

- [ ] **Step 6: Commit (승인 후)**

```bash
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "feat(company-map): QQQ·QLD 적립식 DcaAccount·DcaOrder 모델 추가"
```

---

### Task 2: 낙폭 판정 순수 함수 (`peak.ts`)

**Files:**
- Create: `apps/company-map/src/lib/dca/peak.ts`
- Test: `apps/company-map/src/lib/dca/peak.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `updatePeak(peak: number, prevClose: number): number`
  - `drawdownRatio(prevClose: number, peak: number): number` — 반올림 없는 비율(−0.1 = −10%)
  - `drawdownPct(prevClose: number, peak: number): number` — 표시용, 소수 2자리
  - `pickSymbol(args): DcaSymbolPick` where `DcaSymbolPick = { symbol: string; leveraged: boolean; drawdownPct: number }`
  - `seedPeak(candles: Array<{ date: string; close: number }>): { price: number; date: string } | null`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/company-map/src/lib/dca/peak.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { drawdownPct, drawdownRatio, pickSymbol, seedPeak, updatePeak } from "./peak";

describe("updatePeak", () => {
  it("신고가면 갱신, 아니면 유지", () => {
    expect(updatePeak(700, 746.16)).toBe(746.16);
    expect(updatePeak(746.16, 715.87)).toBe(746.16);
    expect(updatePeak(746.16, 746.16)).toBe(746.16); // 동일가는 유지
  });

  it("비정상 입력은 기존 peak 유지", () => {
    expect(updatePeak(746.16, Number.NaN)).toBe(746.16);
    expect(updatePeak(746.16, 0)).toBe(746.16);
    expect(updatePeak(746.16, -5)).toBe(746.16);
  });
});

describe("drawdownPct / drawdownRatio", () => {
  it("하락은 음수, 2026-08-27 실측값 재현", () => {
    // QQQ 현재가 715.87 / 200봉 최고종가 746.16 → −4.06%
    expect(drawdownPct(715.87, 746.16)).toBeCloseTo(-4.06, 2);
    expect(drawdownRatio(715.87, 746.16)).toBeCloseTo(-0.0406, 4);
  });

  it("최고가와 같으면 0", () => {
    expect(drawdownPct(746.16, 746.16)).toBe(0);
  });

  it("peak가 0 이하거나 비정상이면 0", () => {
    expect(drawdownPct(700, 0)).toBe(0);
    expect(drawdownPct(Number.NaN, 746.16)).toBe(0);
  });
});

describe("pickSymbol", () => {
  const pair = { baseSymbol: "QQQ", leverSymbol: "QLD" };

  it("낙폭이 임계 미달이면 base", () => {
    const r = pickSymbol({ prevClose: 715.87, peak: 746.16, thresholdPct: 10, ...pair });
    expect(r.symbol).toBe("QQQ");
    expect(r.leveraged).toBe(false);
    expect(r.drawdownPct).toBeCloseTo(-4.06, 2);
  });

  it("낙폭이 임계 이상이면 lever", () => {
    const r = pickSymbol({ prevClose: 650, peak: 746.16, thresholdPct: 10, ...pair });
    expect(r.symbol).toBe("QLD");
    expect(r.leveraged).toBe(true);
  });

  it("정확히 임계값이면 lever (경계 포함)", () => {
    const r = pickSymbol({ prevClose: 90, peak: 100, thresholdPct: 10, ...pair });
    expect(r.leveraged).toBe(true);
  });

  it("표시값이 반올림으로 임계에 닿아도 판정은 반올림 전 값 기준", () => {
    // 실제 낙폭 −9.996% → 표시 −10.0 이지만 레버리지는 아님
    const r = pickSymbol({ prevClose: 90.004, peak: 100, thresholdPct: 10, ...pair });
    expect(r.drawdownPct).toBeCloseTo(-10, 1);
    expect(r.leveraged).toBe(false);
  });

  it("임계 15% 설정도 동작", () => {
    expect(pickSymbol({ prevClose: 88, peak: 100, thresholdPct: 15, ...pair }).leveraged).toBe(false);
    expect(pickSymbol({ prevClose: 85, peak: 100, thresholdPct: 15, ...pair }).leveraged).toBe(true);
  });
});

describe("seedPeak", () => {
  it("일봉 중 최고 종가와 그 날짜", () => {
    expect(
      seedPeak([
        { date: "2026-06-01", close: 700 },
        { date: "2026-06-02", close: 746.16 },
        { date: "2026-08-26", close: 715.87 },
      ]),
    ).toEqual({ price: 746.16, date: "2026-06-02" });
  });

  it("빈 배열이면 null", () => {
    expect(seedPeak([])).toBeNull();
  });

  it("동일 최고가가 여럿이면 가장 이른 날짜", () => {
    expect(
      seedPeak([
        { date: "2026-06-02", close: 746.16 },
        { date: "2026-07-02", close: 746.16 },
      ]),
    ).toEqual({ price: 746.16, date: "2026-06-02" });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/dca/peak.test.ts`
Expected: FAIL — `Failed to resolve import "./peak"` (파일이 아직 없음)

- [ ] **Step 3: 구현 작성**

`apps/company-map/src/lib/dca/peak.ts`:

```ts
// 낙폭 판정. base 종목의 "직전 최고 종가" 대비 하락률로 그날 매수할 종목을 고른다.
// 최고가는 DB에 running peak로 저장한다 — 토스 일봉 조회가 200봉(약 10개월)까지만
// 지원해 매 실행마다 사상 최고가를 재계산할 수 없기 때문. 순수 함수만 둔다.

export interface DcaSymbolPick {
  symbol: string;
  leveraged: boolean;
  /** 표시·기록용 낙폭(%). 판정에는 반올림 전 비율을 쓴다. */
  drawdownPct: number;
}

/** 신고가면 갱신, 아니면 기존 peak 유지. 비정상 입력은 무시. */
export function updatePeak(peak: number, prevClose: number): number {
  if (!Number.isFinite(prevClose) || prevClose <= 0) return peak;
  return prevClose > peak ? prevClose : peak;
}

/** 직전 최고가 대비 비율(−0.1 = −10%). 반올림하지 않는다 — 임계 판정용. */
export function drawdownRatio(prevClose: number, peak: number): number {
  if (!Number.isFinite(prevClose) || !Number.isFinite(peak) || peak <= 0) return 0;
  return prevClose / peak - 1;
}

/** 표시·기록용 낙폭(%), 소수 2자리. */
export function drawdownPct(prevClose: number, peak: number): number {
  return Math.round(drawdownRatio(prevClose, peak) * 10000) / 100;
}

/** 낙폭이 −thresholdPct 이하(경계 포함)면 레버리지 종목. */
export function pickSymbol(args: {
  prevClose: number;
  peak: number;
  thresholdPct: number;
  baseSymbol: string;
  leverSymbol: string;
}): DcaSymbolPick {
  const ratio = drawdownRatio(args.prevClose, args.peak);
  const leveraged = ratio <= -args.thresholdPct / 100;
  return {
    symbol: leveraged ? args.leverSymbol : args.baseSymbol,
    leveraged,
    drawdownPct: Math.round(ratio * 10000) / 100,
  };
}

/** 계좌 생성 시 peak 시딩용 — 일봉 중 최고 종가(동일가면 가장 이른 날짜). */
export function seedPeak(
  candles: Array<{ date: string; close: number }>,
): { price: number; date: string } | null {
  let best: { price: number; date: string } | null = null;
  for (const c of candles) {
    if (!Number.isFinite(c.close) || c.close <= 0) continue;
    if (best == null || c.close > best.price) best = { price: c.close, date: c.date };
  }
  return best;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/dca/peak.test.ts`
Expected: PASS — 5개 describe, 전체 통과

- [ ] **Step 5: lint 확인**

Run: `cd apps/company-map && npx eslint src/lib/dca/peak.ts src/lib/dca/peak.test.ts`
Expected: 출력 없음(에러 0)

- [ ] **Step 6: Commit (승인 후)**

```bash
git add apps/company-map/src/lib/dca/peak.ts apps/company-map/src/lib/dca/peak.test.ts
git commit -m "feat(company-map): DCA 낙폭 판정 순수 함수 (peak/drawdown/pickSymbol)"
```

---

### Task 3: 주문 사이징 순수 함수 (`sizing.ts`)

**Files:**
- Create: `apps/company-map/src/lib/dca/sizing.ts`
- Test: `apps/company-map/src/lib/dca/sizing.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `DcaBuyPlan = { price: number; quantity: number; estUsd: number; estKrw: number }`
  - `planBuy(args: { cashKrw: number; fxRate: number; price: number; premiumPct: number }): DcaBuyPlan | null`
  - `tradingDaysToOneShare(args: { cashKrw: number; dailyAmountKrw: number; fxRate: number; price: number; premiumPct: number }): number | null` — UI 안내용

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/company-map/src/lib/dca/sizing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planBuy, tradingDaysToOneShare } from "./sizing";

describe("planBuy", () => {
  it("잔액이 1주 값에 못 미치면 null (2026-08-27 실측: 5만원 vs QQQ $715.87)", () => {
    expect(planBuy({ cashKrw: 50000, fxRate: 1379.1, price: 715.87, premiumPct: 5 })).toBeNull();
  });

  it("프리미엄을 얹은 지정가와 그 지정가 기준 정수 수량", () => {
    // limit = 90.07 × 1.05 = 94.57(반올림), 예산 = 3,000,000 / 1379.1 = 2175.33 USD
    // 수량 = floor(2175.33 / 94.57) = 23
    const r = planBuy({ cashKrw: 3_000_000, fxRate: 1379.1, price: 90.07, premiumPct: 5 });
    expect(r).not.toBeNull();
    expect(r!.price).toBeCloseTo(94.57, 2);
    expect(r!.quantity).toBe(23);
    expect(r!.estUsd).toBeCloseTo(94.57 * 23, 2);
    expect(r!.estKrw).toBe(Math.round(94.57 * 23 * 1379.1));
  });

  it("정확히 1주 경계", () => {
    // limit = 100, 예산 = 100000/1000 = 100 USD → 1주
    expect(planBuy({ cashKrw: 100_000, fxRate: 1000, price: 100, premiumPct: 0 })!.quantity).toBe(1);
    // 1원 부족하면 0주 → null
    expect(planBuy({ cashKrw: 99_999, fxRate: 1000, price: 100, premiumPct: 0 })).toBeNull();
  });

  it("프리미엄이 커지면 살 수 있는 수량이 줄어든다", () => {
    const a = planBuy({ cashKrw: 1_000_000, fxRate: 1000, price: 100, premiumPct: 0 })!;
    const b = planBuy({ cashKrw: 1_000_000, fxRate: 1000, price: 100, premiumPct: 25 })!;
    expect(a.quantity).toBe(10);
    expect(b.quantity).toBe(8); // limit 125 → floor(1000/125)
  });

  it("비정상 입력은 null", () => {
    expect(planBuy({ cashKrw: 0, fxRate: 1379.1, price: 90, premiumPct: 5 })).toBeNull();
    expect(planBuy({ cashKrw: -1000, fxRate: 1379.1, price: 90, premiumPct: 5 })).toBeNull();
    expect(planBuy({ cashKrw: 1_000_000, fxRate: 0, price: 90, premiumPct: 5 })).toBeNull();
    expect(planBuy({ cashKrw: 1_000_000, fxRate: 1379.1, price: 0, premiumPct: 5 })).toBeNull();
    expect(planBuy({ cashKrw: 1_000_000, fxRate: Number.NaN, price: 90, premiumPct: 5 })).toBeNull();
    expect(planBuy({ cashKrw: 1_000_000, fxRate: 1379.1, price: 90, premiumPct: -1 })).toBeNull();
  });
});

describe("tradingDaysToOneShare", () => {
  it("1주까지 남은 거래일 수 (5만원씩, QQQ $715.87)", () => {
    // 1주 값 = 751.66(=715.87×1.05, 반올림) × 1379.1 = 1,036,614원 → 잔액 0에서 21거래일
    const d = tradingDaysToOneShare({
      cashKrw: 0, dailyAmountKrw: 50_000, fxRate: 1379.1, price: 715.87, premiumPct: 5,
    });
    expect(d).toBe(21);
  });

  it("이미 1주를 살 수 있으면 0", () => {
    expect(
      tradingDaysToOneShare({
        cashKrw: 2_000_000, dailyAmountKrw: 50_000, fxRate: 1379.1, price: 90.07, premiumPct: 5,
      }),
    ).toBe(0);
  });

  it("적립액이 0이면 null (영원히 도달 못 함)", () => {
    expect(
      tradingDaysToOneShare({
        cashKrw: 0, dailyAmountKrw: 0, fxRate: 1379.1, price: 90.07, premiumPct: 5,
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/dca/sizing.test.ts`
Expected: FAIL — `Failed to resolve import "./sizing"`

- [ ] **Step 3: 구현 작성**

`apps/company-map/src/lib/dca/sizing.ts`:

```ts
// 매수 주문 사이징. 이월 원화 잔액을 당일 환율로 환산해 LOC 지정가 기준 정수 수량만 산다.
// 지정가(상한)로 나누는 이유: 체결가는 종가라 지정가 이하이므로 예산 초과가 구조적으로 불가능하다.
// 남은 돈은 차감되지 않고 그대로 이월된다. 순수 함수만 둔다.

export interface DcaBuyPlan {
  /** LOC 지정가(상한) USD */
  price: number;
  quantity: number;
  /** 전량 지정가 체결 시 최대 소요 USD */
  estUsd: number;
  /** 위 금액의 원화 환산(주문 시 환율) */
  estKrw: number;
}

function locLimit(price: number, premiumPct: number): number {
  return Math.round(price * (1 + premiumPct / 100) * 100) / 100;
}

/** 1주도 못 사면 null. 그 경우 잔액은 그대로 다음 거래일로 이월된다. */
export function planBuy(args: {
  cashKrw: number;
  fxRate: number;
  price: number;
  premiumPct: number;
}): DcaBuyPlan | null {
  const { cashKrw, fxRate, price, premiumPct } = args;
  if (!Number.isFinite(cashKrw) || cashKrw <= 0) return null;
  if (!Number.isFinite(fxRate) || fxRate <= 0) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(premiumPct) || premiumPct < 0) return null;

  const limit = locLimit(price, premiumPct);
  if (limit <= 0) return null;

  const quantity = Math.floor(cashKrw / fxRate / limit);
  if (quantity < 1) return null;

  const estUsd = Math.round(quantity * limit * 100) / 100;
  return { price: limit, quantity, estUsd, estKrw: Math.round(estUsd * fxRate) };
}

/** UI 안내용 — 지금 속도로 적립하면 몇 거래일 뒤에 1주를 살 수 있는지. 도달 불가면 null. */
export function tradingDaysToOneShare(args: {
  cashKrw: number;
  dailyAmountKrw: number;
  fxRate: number;
  price: number;
  premiumPct: number;
}): number | null {
  const { cashKrw, dailyAmountKrw, fxRate, price, premiumPct } = args;
  if (!Number.isFinite(fxRate) || fxRate <= 0) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  const oneShareKrw = locLimit(price, premiumPct) * fxRate;
  if (cashKrw >= oneShareKrw) return 0;
  if (!Number.isFinite(dailyAmountKrw) || dailyAmountKrw <= 0) return null;
  return Math.ceil((oneShareKrw - cashKrw) / dailyAmountKrw);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/dca/sizing.test.ts`
Expected: PASS

- [ ] **Step 5: lint 확인**

Run: `cd apps/company-map && npx eslint src/lib/dca/sizing.ts src/lib/dca/sizing.test.ts`
Expected: 출력 없음

- [ ] **Step 6: Commit (승인 후)**

```bash
git add apps/company-map/src/lib/dca/sizing.ts apps/company-map/src/lib/dca/sizing.test.ts
git commit -m "feat(company-map): DCA 주문 사이징 순수 함수 (planBuy)"
```

---

### Task 4: 자금 상태 전이 순수 함수 (`state.ts`)

이 태스크가 이 기능의 **돈 계산 핵심**이다. `infinite-buy/sync.ts`의 `applyFills`와 같은 관행 — DB를 모르는 순수 함수로 상태 전이를 정의하고, 오케스트레이터는 이 결과를 저장만 한다.

**Files:**
- Create: `apps/company-map/src/lib/dca/state.ts`
- Test: `apps/company-map/src/lib/dca/state.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `DcaFillEvent = { filledQty: number | null; filledPrice: number | null; fxRate: number }`
  - `applyFills(cashKrw: number, fills: DcaFillEvent[]): number` — 체결분 차감 후 잔액(원, 정수)
  - `accrue(args: { cashKrw: number; lastAccrualDate: string | null; tradeDate: string; dailyAmountKrw: number }): { cashKrw: number; accrued: boolean }`
  - `deriveHoldings(fills: Array<{ symbol: string; filledQty: number | null }>): Record<string, number>`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/company-map/src/lib/dca/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { accrue, applyFills, deriveHoldings } from "./state";

describe("applyFills", () => {
  it("체결가 × 수량 × 주문 시 환율만큼 차감", () => {
    // 94.57 × 23 × 1379.1 = 2,999,... → 종가 체결이면 더 적게 나간다
    expect(applyFills(3_000_000, [{ filledQty: 23, filledPrice: 90.07, fxRate: 1379.1 }])).toBe(
      Math.round(3_000_000 - 90.07 * 23 * 1379.1),
    );
  });

  it("미체결(filledQty/filledPrice null)은 무시 — 잔액 그대로 이월", () => {
    expect(applyFills(1_000_000, [{ filledQty: null, filledPrice: null, fxRate: 1379.1 }])).toBe(1_000_000);
    expect(applyFills(1_000_000, [{ filledQty: 1, filledPrice: null, fxRate: 1379.1 }])).toBe(1_000_000);
    expect(applyFills(1_000_000, [{ filledQty: null, filledPrice: 90, fxRate: 1379.1 }])).toBe(1_000_000);
  });

  it("여러 건 누적 차감", () => {
    const r = applyFills(1_000_000, [
      { filledQty: 1, filledPrice: 100, fxRate: 1000 },
      { filledQty: 2, filledPrice: 100, fxRate: 1000 },
    ]);
    expect(r).toBe(1_000_000 - 300_000);
  });

  it("환율이 비정상인 체결은 건너뛴다 (잔액 오염 방지)", () => {
    expect(applyFills(500_000, [{ filledQty: 1, filledPrice: 100, fxRate: 0 }])).toBe(500_000);
    expect(applyFills(500_000, [{ filledQty: 1, filledPrice: 100, fxRate: Number.NaN }])).toBe(500_000);
  });

  it("빈 배열이면 잔액 불변", () => {
    expect(applyFills(777_777, [])).toBe(777_777);
  });

  it("잔액보다 큰 체결이 들어와도 음수를 그대로 반영 (은폐하지 않음)", () => {
    expect(applyFills(100_000, [{ filledQty: 1, filledPrice: 100, fxRate: 1000 }])).toBe(0);
    expect(applyFills(50_000, [{ filledQty: 1, filledPrice: 100, fxRate: 1000 }])).toBe(-50_000);
  });
});

describe("accrue", () => {
  it("첫 실행이면 적립", () => {
    expect(accrue({ cashKrw: 0, lastAccrualDate: null, tradeDate: "2026-08-27", dailyAmountKrw: 50_000 })).toEqual({
      cashKrw: 50_000,
      accrued: true,
    });
  });

  it("같은 거래일 재호출은 적립하지 않음 (중복 적립 방지)", () => {
    expect(
      accrue({ cashKrw: 50_000, lastAccrualDate: "2026-08-27", tradeDate: "2026-08-27", dailyAmountKrw: 50_000 }),
    ).toEqual({ cashKrw: 50_000, accrued: false });
  });

  it("거래일이 바뀌면 다시 적립", () => {
    expect(
      accrue({ cashKrw: 50_000, lastAccrualDate: "2026-08-27", tradeDate: "2026-08-28", dailyAmountKrw: 50_000 }),
    ).toEqual({ cashKrw: 100_000, accrued: true });
  });

  it("적립액이 0 이하면 적립하지 않음", () => {
    expect(accrue({ cashKrw: 10, lastAccrualDate: null, tradeDate: "2026-08-27", dailyAmountKrw: 0 })).toEqual({
      cashKrw: 10,
      accrued: false,
    });
  });
});

describe("deriveHoldings", () => {
  it("종목별 체결 수량 합산", () => {
    expect(
      deriveHoldings([
        { symbol: "QQQ", filledQty: 1 },
        { symbol: "QLD", filledQty: 23 },
        { symbol: "QQQ", filledQty: 2 },
        { symbol: "QLD", filledQty: null }, // 미체결 무시
      ]),
    ).toEqual({ QQQ: 3, QLD: 23 });
  });

  it("체결이 없으면 빈 객체", () => {
    expect(deriveHoldings([])).toEqual({});
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/dca/state.test.ts`
Expected: FAIL — `Failed to resolve import "./state"`

- [ ] **Step 3: 구현 작성**

`apps/company-map/src/lib/dca/state.ts`:

```ts
// 자금 상태 전이. cashKrw는 "아직 주식으로 바뀌지 않은 원화 적립 잔액"이다.
//   - 주문 제출은 잔액을 건드리지 않는다 → 미체결 시 원복 로직이 필요 없다.
//   - 체결이 확정된 순간에만 차감한다. 차감액은 주문에 기록된 환율로 환산한다(근사).
//   - 적립은 lastRunDate와 분리된 lastAccrualDate로 멱등을 보장한다. 뒷 단계가 보류돼
//     lastRunDate가 갱신되지 않아도 같은 거래일에 두 번 적립되지 않는다.
// DB를 모르는 순수 함수만 둔다 (infinite-buy/sync.ts applyFills와 같은 관행).

export interface DcaFillEvent {
  filledQty: number | null;
  filledPrice: number | null;
  /** 주문 생성 시점의 USD/KRW */
  fxRate: number;
}

/** 체결분을 원화 잔액에서 차감. 미체결·환율 이상 건은 건너뛴다. 반환값은 원 단위 정수. */
export function applyFills(cashKrw: number, fills: DcaFillEvent[]): number {
  let next = cashKrw;
  for (const f of fills) {
    if (f.filledQty == null || f.filledPrice == null) continue;
    if (!Number.isFinite(f.filledQty) || !Number.isFinite(f.filledPrice)) continue;
    if (!Number.isFinite(f.fxRate) || f.fxRate <= 0) continue;
    next -= f.filledPrice * f.filledQty * f.fxRate;
  }
  return Math.round(next);
}

/** 거래일당 1회 적립. 이미 그 거래일에 적립했으면 accrued: false. */
export function accrue(args: {
  cashKrw: number;
  lastAccrualDate: string | null;
  tradeDate: string;
  dailyAmountKrw: number;
}): { cashKrw: number; accrued: boolean } {
  if (args.lastAccrualDate === args.tradeDate) return { cashKrw: args.cashKrw, accrued: false };
  if (!Number.isFinite(args.dailyAmountKrw) || args.dailyAmountKrw <= 0) {
    return { cashKrw: args.cashKrw, accrued: false };
  }
  return { cashKrw: Math.round(args.cashKrw + args.dailyAmountKrw), accrued: true };
}

/** 종목별 보유수량 = 체결 누적. 매수 전용 전략이라 감산이 없다. 화면 표시용. */
export function deriveHoldings(
  fills: Array<{ symbol: string; filledQty: number | null }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of fills) {
    if (f.filledQty == null || !Number.isFinite(f.filledQty)) continue;
    out[f.symbol] = (out[f.symbol] ?? 0) + f.filledQty;
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/dca/state.test.ts`
Expected: PASS

- [ ] **Step 5: lint 확인**

Run: `cd apps/company-map && npx eslint src/lib/dca/state.ts src/lib/dca/state.test.ts`
Expected: 출력 없음

- [ ] **Step 6: Commit (승인 후)**

```bash
git add apps/company-map/src/lib/dca/state.ts apps/company-map/src/lib/dca/state.test.ts
git commit -m "feat(company-map): DCA 자금 상태 전이 순수 함수 (accrue/applyFills)"
```

---

### Task 5: 토스 어댑터 (`toss-deps.ts`)

**Files:**
- Create: `apps/company-map/src/lib/dca/toss-deps.ts`
- Test: `apps/company-map/src/lib/dca/toss-deps.test.ts`

**Interfaces:**
- Consumes: `DcaRunDeps` 타입은 Task 6에서 정의된다. **이 태스크에서는 `run-dca.ts`를 아직 만들지 않으므로, 아래 구현은 `DcaRunDeps`를 import하지 않고 구조적으로 동일한 객체를 반환한다.** Task 6에서 `run-dca.ts`를 만든 뒤 `tossDcaDeps()`의 반환 타입 주석을 `: DcaRunDeps`로 바꾸는 한 줄 수정을 Task 6 안에서 한다.
- Produces:
  - `PEAK_SEED_COUNT = 200` (토스 일봉 조회 상한)
  - `pickPrevTradeClose(candles, before): { date: string; close: number } | null`
  - `assertSubmittable(o: { price: number; quantity: number }): void`
  - `tossDcaDeps()` — 토스 클라이언트를 묶은 deps 객체
  - `isDcaKilled(): boolean`

- [ ] **Step 1: 실패하는 테스트 작성 (순수 함수만 테스트)**

`apps/company-map/src/lib/dca/toss-deps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertSubmittable, pickPrevTradeClose } from "./toss-deps";

describe("pickPrevTradeClose", () => {
  const candles = [
    { date: "2026-08-24", close: 700 },
    { date: "2026-08-25", close: 710 },
    { date: "2026-08-26", close: 715.87 },
    { date: "2026-08-27", close: 720 },
  ];

  it("기준일 미포함 직전 거래일의 날짜·종가", () => {
    expect(pickPrevTradeClose(candles, "2026-08-27")).toEqual({ date: "2026-08-26", close: 715.87 });
  });

  it("휴장으로 며칠 빈 경우에도 가장 최근 이전 거래일", () => {
    expect(pickPrevTradeClose(candles, "2026-08-31")).toEqual({ date: "2026-08-27", close: 720 });
  });

  it("이전 거래일이 없으면 null", () => {
    expect(pickPrevTradeClose(candles, "2026-08-24")).toBeNull();
    expect(pickPrevTradeClose([], "2026-08-27")).toBeNull();
  });
});

describe("assertSubmittable", () => {
  it("정상 주문은 통과", () => {
    expect(() => assertSubmittable({ price: 94.57, quantity: 23 })).not.toThrow();
  });

  it("수량이 0 이하·정수 아님이면 throw", () => {
    expect(() => assertSubmittable({ price: 94.57, quantity: 0 })).toThrow();
    expect(() => assertSubmittable({ price: 94.57, quantity: -1 })).toThrow();
    expect(() => assertSubmittable({ price: 94.57, quantity: 1.5 })).toThrow();
  });

  it("지정가가 0 이하·NaN이면 throw", () => {
    expect(() => assertSubmittable({ price: 0, quantity: 1 })).toThrow();
    expect(() => assertSubmittable({ price: Number.NaN, quantity: 1 })).toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/dca/toss-deps.test.ts`
Expected: FAIL — `Failed to resolve import "./toss-deps"`

- [ ] **Step 3: 구현 작성**

`apps/company-map/src/lib/dca/toss-deps.ts`:

```ts
// 토스 클라이언트 → DCA 실행 의존성. 순수 함수(직전 종가 선택·제출 가드)는 테스트 대상.
// 일봉 count는 200이 상한이다 — 300 이상은 토스가 "요청이 올바르지 않습니다"로 거부한다(2026-08-27 실측).
import {
  createOrder,
  getBuyingPower,
  getDailyCandles,
  getDefaultAccountSeq,
  getExchangeRate,
  getOrders,
  getPrices,
} from "@/lib/toss/client";

/** 토스 일봉 조회 상한. peak 시딩 범위(약 10개월)를 결정한다. */
export const PEAK_SEED_COUNT = 200;

/** before(미포함) 직전 거래일의 날짜·종가. 순수 함수 — 테스트 대상. */
export function pickPrevTradeClose(
  candles: Array<{ date: string; close: number }>,
  before: string,
): { date: string; close: number } | null {
  const prev = candles
    .filter((c) => c.date < before)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return prev ? { date: prev.date, close: prev.close } : null;
}

/** 실주문 직전 방어 가드 — 비정상 주문이 브로커로 나가지 않게 throw. 정수 수량만 허용. */
export function assertSubmittable(o: { price: number; quantity: number }): void {
  if (!Number.isFinite(o.quantity) || o.quantity <= 0 || !Number.isInteger(o.quantity)) {
    throw new Error(`invalid order quantity: ${o.quantity}`);
  }
  if (!Number.isFinite(o.price) || o.price <= 0) {
    throw new Error(`invalid LOC price: ${o.price}`);
  }
}

export function tossDcaDeps() {
  return {
    getDefaultAccountSeq,

    async getDailyCandle(symbol: string, date: string) {
      const candles = await getDailyCandles(symbol, PEAK_SEED_COUNT);
      const c = candles.find((x) => x.date === date);
      return c ? { close: c.close, high: c.high } : null;
    },

    async getPrevTradeClose(symbol: string, before: string) {
      const candles = await getDailyCandles(symbol, PEAK_SEED_COUNT);
      return pickPrevTradeClose(candles, before);
    },

    async getCurrentPrice(symbol: string): Promise<number> {
      const [p] = await getPrices([symbol]);
      return Number(p?.lastPrice ?? 0);
    },

    getUsdKrw(): Promise<number> {
      return getExchangeRate("USD", "KRW");
    },

    getBuyingPowerUsd(accountSeq: number): Promise<number> {
      return getBuyingPower(accountSeq, "USD");
    },

    async getClosedOrders(accountSeq: number, symbol: string, from: string) {
      const orders = await getOrders(accountSeq, { status: "CLOSED", symbol, from });
      return orders.map((o) => ({
        orderId: o.orderId,
        filledQuantity: o.filledQuantity,
        averageFilledPrice: o.averageFilledPrice ?? null,
      }));
    },

    async submitOrder(
      accountSeq: number,
      o: { price: number; quantity: number },
      symbol: string,
    ): Promise<{ tossOrderId: string }> {
      assertSubmittable(o);
      const r = await createOrder(accountSeq, {
        symbol,
        side: "BUY",
        orderType: "LIMIT",
        quantity: String(o.quantity),
        price: String(o.price),
        timeInForce: "CLS",
      });
      return { tossOrderId: r.orderId };
    },
  };
}

export const isDcaKilled = (): boolean => process.env.DCA_DISABLED === "1";
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/dca/toss-deps.test.ts`
Expected: PASS

- [ ] **Step 5: 타입 확인**

`createOrder`의 `CreateOrderInput`과 `getOrders`의 `TossOrder`가 위 사용과 맞는지 확인한다.

Run: `cd apps/company-map && grep -n "interface CreateOrderInput" -A12 src/lib/toss/client.ts && grep -n "interface TossOrder" -A9 src/lib/toss/client.ts`
Expected: `CreateOrderInput`에 `symbol/side/orderType/quantity/price?/timeInForce?`가 있고, `TossOrder`에 `orderId/filledQuantity/averageFilledPrice?`가 있음. 필드명이 다르면 위 구현을 실제 타입에 맞춰 고친다.

- [ ] **Step 6: lint 확인**

Run: `cd apps/company-map && npx eslint src/lib/dca/toss-deps.ts src/lib/dca/toss-deps.test.ts`
Expected: 출력 없음

- [ ] **Step 7: Commit (승인 후)**

```bash
git add apps/company-map/src/lib/dca/toss-deps.ts apps/company-map/src/lib/dca/toss-deps.test.ts
git commit -m "feat(company-map): DCA 토스 어댑터 (일봉·환율·주문 제출)"
```

---

### Task 6: 오케스트레이터 (`run-dca.ts`) + 스모크 스크립트

**Files:**
- Create: `apps/company-map/src/lib/dca/run-dca.ts`
- Create: `apps/company-map/scripts/dca-smoke.ts`
- Modify: `apps/company-map/src/lib/dca/toss-deps.ts` (반환 타입에 `DcaRunDeps` 명시)

**Interfaces:**
- Consumes:
  - Task 2: `pickSymbol`, `updatePeak` from `./peak`
  - Task 3: `planBuy` from `./sizing`
  - Task 4: `accrue`, `applyFills` from `./state`
  - Task 5: `tossDcaDeps`, `isDcaKilled` from `./toss-deps`
  - 기존: `judgeDryFill`, `DryCandle` from `@/lib/infinite-buy/dry-fill`
- Produces:
  - `DcaRunDeps` 인터페이스 (Task 5 어댑터가 만족해야 하는 계약)
  - `DcaRunResult = { placed: number; simulated: number; symbol: string | null; drawdownPct: number | null; accrued: boolean; blocked: string | null }`
  - `runDca(db, deps, accountId, tradeDate, killed): Promise<DcaRunResult>`

- [ ] **Step 1: 오케스트레이터 작성**

`apps/company-map/src/lib/dca/run-dca.ts`:

```ts
// QQQ·QLD 적립식 오케스트레이터. 순서 불변식:
//   ① 체결 정산(dryRun: 일봉 판정 / LIVE: 토스 대조) → ② 잔액 반영 → ③ 적립
//   → ④ peak 갱신 → ⑤ 종목 선택 → ⑥ 주문 계산 → ⑦ 기록·제출
// blocked 시 lastRunDate를 갱신하지 않아 다음 폴에서 자동 재시도된다 (run-vr.ts와 동일 패턴).
// 적립은 lastAccrualDate로 별도 멱등을 보장하므로 재시도 시에도 중복되지 않는다.
import type { PrismaClient } from "@prisma-clients/company-map";
import { judgeDryFill, type DryCandle } from "@/lib/infinite-buy/dry-fill";
import { pickSymbol, updatePeak } from "./peak";
import { planBuy } from "./sizing";
import { accrue, applyFills } from "./state";

export interface DcaClosedOrder {
  orderId: string;
  filledQuantity: number;
  averageFilledPrice: number | null;
}

export interface DcaRunDeps {
  getDefaultAccountSeq(): Promise<number>;
  getDailyCandle(symbol: string, date: string): Promise<DryCandle | null>;
  getPrevTradeClose(symbol: string, before: string): Promise<{ date: string; close: number } | null>;
  getCurrentPrice(symbol: string): Promise<number>;
  getUsdKrw(): Promise<number>;
  getBuyingPowerUsd(accountSeq: number): Promise<number>;
  getClosedOrders(accountSeq: number, symbol: string, from: string): Promise<DcaClosedOrder[]>;
  submitOrder(
    accountSeq: number,
    o: { price: number; quantity: number },
    symbol: string,
  ): Promise<{ tossOrderId: string }>;
}

export interface DcaRunResult {
  /** LIVE 실제 제출 건수 */
  placed: number;
  /** dryRun 기록 건수 */
  simulated: number;
  symbol: string | null;
  drawdownPct: number | null;
  accrued: boolean;
  blocked: string | null;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ① dryRun — 과거 거래일의 simulated 주문을 그 날 일봉으로 판정.
async function settleDryOrders(
  db: PrismaClient,
  deps: DcaRunDeps,
  accountId: string,
  tradeDate: string,
): Promise<void> {
  const pending = await db.dcaOrder.findMany({
    where: { accountId, dryRun: true, status: "simulated", tradeDate: { lt: tradeDate } },
    orderBy: { tradeDate: "asc" },
  });
  const cache = new Map<string, DryCandle | null>();
  for (const o of pending) {
    const key = `${o.symbol}:${o.tradeDate}`;
    if (!cache.has(key)) cache.set(key, await deps.getDailyCandle(o.symbol, o.tradeDate));
    const candle = cache.get(key);
    if (!candle) continue; // 일봉 미확보 — 다음 폴에서 재시도
    const r = judgeDryFill(
      { side: "BUY", orderType: o.orderType, tif: o.tif, price: o.price },
      candle,
    );
    await db.dcaOrder.update({
      where: { id: o.id },
      data: r.filled
        ? {
            status: "simulated_filled",
            filledQty: o.quantity,
            filledPrice: r.fillPrice,
            filledAt: o.tradeDate,
          }
        : { status: "expired" },
    });
  }
}

// ① LIVE — 제출된 주문을 토스 CLOSED 목록과 대조해 체결/만료 확정.
async function settleLiveOrders(
  db: PrismaClient,
  deps: DcaRunDeps,
  account: { id: string; accountSeq: number | null },
): Promise<void> {
  const pending = await db.dcaOrder.findMany({
    where: { accountId: account.id, dryRun: false, status: "submitted" },
    orderBy: { tradeDate: "asc" },
  });
  if (pending.length === 0) return;
  const accountSeq = account.accountSeq ?? (await deps.getDefaultAccountSeq());
  const from = pending[0].tradeDate;
  const cache = new Map<string, DcaClosedOrder[]>();
  for (const o of pending) {
    if (!cache.has(o.symbol)) {
      cache.set(o.symbol, await deps.getClosedOrders(accountSeq, o.symbol, from));
    }
    const closed = cache.get(o.symbol)!.find((c) => c.orderId === o.tossOrderId);
    if (!closed) continue; // 아직 CLOSED 아님 — 다음 폴에서 재시도
    await db.dcaOrder.update({
      where: { id: o.id },
      data:
        closed.filledQuantity > 0
          ? {
              status: "filled",
              filledQty: closed.filledQuantity,
              filledPrice: closed.averageFilledPrice ?? o.price,
              filledAt: o.tradeDate,
            }
          : { status: "expired" },
    });
  }
}

// ② 미반영 체결을 cashKrw에서 차감. stateApplied 마커로 멱등. 한 트랜잭션으로 원자 처리.
async function applyPendingFills(db: PrismaClient, accountId: string): Promise<void> {
  const pending = await db.dcaOrder.findMany({
    where: {
      accountId,
      status: { in: ["simulated_filled", "filled"] },
      OR: [{ stateApplied: false }, { stateApplied: null }],
    },
    orderBy: { tradeDate: "asc" },
  });
  if (pending.length === 0) return;
  const acc = await db.dcaAccount.findUniqueOrThrow({ where: { id: accountId } });
  const nextCash = applyFills(
    acc.cashKrw,
    pending.map((o) => ({ filledQty: o.filledQty, filledPrice: o.filledPrice, fxRate: o.fxRate })),
  );
  await db.$transaction([
    db.dcaAccount.update({ where: { id: accountId }, data: { cashKrw: nextCash } }),
    ...pending.map((o) =>
      db.dcaOrder.update({ where: { id: o.id }, data: { stateApplied: true } }),
    ),
  ]);
}

export async function runDca(
  db: PrismaClient,
  deps: DcaRunDeps,
  accountId: string,
  tradeDate: string,
  killed: boolean,
): Promise<DcaRunResult> {
  const none: DcaRunResult = {
    placed: 0,
    simulated: 0,
    symbol: null,
    drawdownPct: null,
    accrued: false,
    blocked: null,
  };

  let acc = await db.dcaAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (acc.status !== "active") return { ...none, blocked: "not_active" };
  if (acc.lastRunDate === tradeDate) return { ...none, blocked: "already_ran" };

  const block = async (reason: string, accrued: boolean): Promise<DcaRunResult> => {
    await db.dcaAccount.update({ where: { id: accountId }, data: { note: reason } });
    return { ...none, accrued, blocked: reason };
  };

  // ① 체결 정산
  try {
    if (acc.dryRun) await settleDryOrders(db, deps, acc.id, tradeDate);
    else await settleLiveOrders(db, deps, acc);
  } catch (e) {
    return block(`체결 동기화 실패: ${msg(e)}`, false);
  }

  // ② 잔액 반영
  try {
    await applyPendingFills(db, acc.id);
  } catch (e) {
    return block(`잔액 반영 실패: ${msg(e)}`, false);
  }

  // ③ 적립 (lastAccrualDate 멱등 — 이후 단계가 보류돼도 재적립되지 않음)
  acc = await db.dcaAccount.findUniqueOrThrow({ where: { id: accountId } });
  const a = accrue({
    cashKrw: acc.cashKrw,
    lastAccrualDate: acc.lastAccrualDate,
    tradeDate,
    dailyAmountKrw: acc.dailyAmountKrw,
  });
  if (a.accrued) {
    acc = await db.dcaAccount.update({
      where: { id: accountId },
      data: { cashKrw: a.cashKrw, lastAccrualDate: tradeDate },
    });
  }

  // ④ peak 갱신 (base 종목의 직전 거래일 종가 기준)
  let prev: { date: string; close: number } | null;
  try {
    prev = await deps.getPrevTradeClose(acc.baseSymbol, tradeDate);
  } catch (e) {
    return block(`전일 종가 조회 실패: ${msg(e)}`, a.accrued);
  }
  if (prev == null) return block("전일 종가 미확보 — 재시도 대기", a.accrued);

  const newPeak = updatePeak(acc.peakPrice, prev.close);
  if (newPeak !== acc.peakPrice) {
    acc = await db.dcaAccount.update({
      where: { id: accountId },
      data: { peakPrice: newPeak, peakDate: prev.date },
    });
  }

  // ⑤ 종목 선택
  const pick = pickSymbol({
    prevClose: prev.close,
    peak: newPeak,
    thresholdPct: acc.thresholdPct,
    baseSymbol: acc.baseSymbol,
    leverSymbol: acc.leverSymbol,
  });
  const picked = { ...none, symbol: pick.symbol, drawdownPct: pick.drawdownPct, accrued: a.accrued };

  // 같은 거래일 중복 주문 방지 — "지금 실행"이 lastRunDate 가드를 우회하는 경로 대비.
  const alreadyToday = await db.dcaOrder.count({ where: { accountId, tradeDate } });
  if (alreadyToday > 0) {
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: null },
    });
    return picked;
  }

  // ⑥ 주문 계산
  let price: number;
  let fx: number;
  try {
    [price, fx] = await Promise.all([deps.getCurrentPrice(pick.symbol), deps.getUsdKrw()]);
  } catch (e) {
    return block(`시세·환율 조회 실패: ${msg(e)}`, a.accrued);
  }
  if (!(price > 0) || !(fx > 0)) return block("시세·환율 비정상 — 재시도 대기", a.accrued);

  const plan = planBuy({
    cashKrw: acc.cashKrw,
    fxRate: fx,
    price,
    premiumPct: acc.premiumPct,
  });
  if (!plan) {
    // 1주 미만 — 적립만 하고 종료. 잔액은 그대로 이월된다.
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: null },
    });
    return picked;
  }

  const orderData = {
    accountId,
    tradeDate,
    symbol: pick.symbol,
    side: "BUY",
    kind: "loc_buy",
    orderType: "LIMIT",
    tif: "CLS",
    price: plan.price,
    quantity: plan.quantity,
    amountKrw: plan.estKrw,
    fxRate: fx,
    drawdownPct: pick.drawdownPct,
  };

  // ⑦ 기록·제출. killed면 LIVE 계좌도 시뮬레이션으로 기록한다 —
  //    dryRun: true로 남겨야 settleDryOrders가 나중에 판정해 상태가 고아로 남지 않는다.
  const simulate = acc.dryRun || killed;
  if (simulate) {
    await db.dcaOrder.create({
      data: {
        ...orderData,
        dryRun: true,
        status: "simulated",
        error: killed && !acc.dryRun ? "DCA_DISABLED — 실주문 대신 시뮬레이션" : null,
      },
    });
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: null },
    });
    return { ...picked, simulated: 1 };
  }

  const accountSeq = acc.accountSeq ?? (await deps.getDefaultAccountSeq());
  let buyingPower: number;
  try {
    buyingPower = await deps.getBuyingPowerUsd(accountSeq);
  } catch (e) {
    return block(`매수가능금액 조회 실패: ${msg(e)}`, a.accrued);
  }
  if (buyingPower < plan.estUsd) {
    return block(
      `USD 예수금 부족: 필요 $${plan.estUsd.toFixed(2)} / 보유 $${buyingPower.toFixed(2)}`,
      a.accrued,
    );
  }

  try {
    const r = await deps.submitOrder(
      accountSeq,
      { price: plan.price, quantity: plan.quantity },
      pick.symbol,
    );
    await db.dcaOrder.create({
      data: { ...orderData, tossOrderId: r.tossOrderId, dryRun: false, status: "submitted" },
    });
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: null },
    });
    return { ...picked, placed: 1 };
  } catch (e) {
    await db.dcaOrder.create({
      data: { ...orderData, dryRun: false, status: "failed", error: msg(e) },
    });
    await db.dcaAccount.update({
      where: { id: accountId },
      data: { lastRunDate: tradeDate, note: `주문 제출 실패: ${msg(e)}` },
    });
    return picked;
  }
}
```

- [ ] **Step 2: 어댑터에 계약 타입 명시**

`apps/company-map/src/lib/dca/toss-deps.ts`를 두 곳 수정한다.

import 블록 아래에 추가:
```ts
import type { DcaRunDeps } from "./run-dca";
```

그리고 함수 시그니처:
```ts
export function tossDcaDeps(): DcaRunDeps {
```

- [ ] **Step 3: 타입 체크**

Run: `cd apps/company-map && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/lib/dca" || echo "dca 타입 에러 없음"`
Expected: `dca 타입 에러 없음`

- [ ] **Step 4: 스모크 스크립트 작성**

`apps/company-map/scripts/dca-smoke.ts`:

```ts
// DCA 오케스트레이터 스모크 테스트. dryRun 계좌를 임시로 만들어 같은 거래일에 runDca를
// 두 번 실행하고, 적립·주문이 중복되지 않는지 실DB에서 확인한 뒤 계좌를 삭제한다.
// 실주문 경로는 타지 않는다 (dryRun: true). 토스 호출은 시세·일봉·환율 읽기 전용.
import "../worker/setup-env";
import { PrismaClient } from "@prisma-clients/company-map";
import { runDca } from "../src/lib/dca/run-dca";
import { seedPeak } from "../src/lib/dca/peak";
import { tossDcaDeps, PEAK_SEED_COUNT } from "../src/lib/dca/toss-deps";
import { getDailyCandles } from "../src/lib/toss/client";

const TRADE_DATE = process.argv[2] ?? new Date().toISOString().slice(0, 10);

async function main() {
  const db = new PrismaClient();
  const deps = tossDcaDeps();

  const candles = await getDailyCandles("QQQ", PEAK_SEED_COUNT);
  const seed = seedPeak(candles);
  if (!seed) throw new Error("QQQ 일봉을 받지 못했습니다");
  console.log(`[smoke] peak 시딩: ${seed.price} (${seed.date}), 일봉 ${candles.length}건`);

  const acc = await db.dcaAccount.create({
    data: {
      name: "[smoke] 임시 계좌",
      peakPrice: seed.price,
      peakDate: seed.date,
      startDate: TRADE_DATE,
      dailyAmountKrw: 50_000,
      dryRun: true,
    },
  });
  console.log(`[smoke] 계좌 생성: ${acc.id}`);

  try {
    const r1 = await runDca(db, deps, acc.id, TRADE_DATE, false);
    console.log("[smoke] 1회차:", r1);

    const after1 = await db.dcaAccount.findUniqueOrThrow({ where: { id: acc.id } });
    const orders1 = await db.dcaOrder.count({ where: { accountId: acc.id } });
    console.log(`[smoke] 1회차 후 cashKrw=${after1.cashKrw} 주문=${orders1}건 lastRun=${after1.lastRunDate}`);

    // lastRunDate 가드를 우회해 "지금 실행" 재호출 상황을 재현한다.
    await db.dcaAccount.update({ where: { id: acc.id }, data: { lastRunDate: null } });
    const r2 = await runDca(db, deps, acc.id, TRADE_DATE, false);
    console.log("[smoke] 2회차:", r2);

    const after2 = await db.dcaAccount.findUniqueOrThrow({ where: { id: acc.id } });
    const orders2 = await db.dcaOrder.count({ where: { accountId: acc.id } });
    console.log(`[smoke] 2회차 후 cashKrw=${after2.cashKrw} 주문=${orders2}건`);

    const ok =
      after1.cashKrw === after2.cashKrw && orders1 === orders2 && r2.accrued === false;
    console.log(ok ? "✅ 중복 적립·중복 주문 없음" : "❌ 재실행에서 상태가 변했습니다");
    if (!ok) process.exitCode = 1;
  } finally {
    await db.dcaAccount.delete({ where: { id: acc.id } });
    console.log("[smoke] 임시 계좌 삭제 완료");
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 5: 스모크 스크립트 실행**

Run: `cd apps/company-map && npx tsx scripts/dca-smoke.ts`
Expected 출력 형태:
```
[smoke] peak 시딩: 746.16 (2026-06-02), 일봉 200건
[smoke] 계좌 생성: <uuid>
[smoke] 1회차: { placed: 0, simulated: 0, symbol: 'QQQ', drawdownPct: -4.06, accrued: true, blocked: null }
[smoke] 1회차 후 cashKrw=50000 주문=0건 lastRun=2026-08-27
[smoke] 2회차: { ..., accrued: false, blocked: null }
[smoke] 2회차 후 cashKrw=50000 주문=0건
✅ 중복 적립·중복 주문 없음
[smoke] 임시 계좌 삭제 완료
```
`✅`가 나오지 않으면 멈추고 원인을 찾는다. 5만원으로는 QQQ 1주를 못 사므로 `simulated: 0`이 정상이다.

- [ ] **Step 6: 큰 잔액에서 주문이 생기는지도 확인**

`scripts/dca-smoke.ts`의 계좌 생성부 `dailyAmountKrw: 50_000`을 잠시 `dailyAmountKrw: 2_000_000`으로 바꿔 한 번 더 실행한다.
Run: `cd apps/company-map && npx tsx scripts/dca-smoke.ts`
Expected: 1회차에 `simulated: 1`, `주문=1건`. 2회차에도 `주문=1건`(중복 없음). 확인 후 값을 `50_000`으로 되돌린다.

- [ ] **Step 7: lint 확인**

Run: `cd apps/company-map && npx eslint src/lib/dca/run-dca.ts src/lib/dca/toss-deps.ts scripts/dca-smoke.ts`
Expected: 출력 없음

- [ ] **Step 8: Commit (승인 후)**

```bash
git add apps/company-map/src/lib/dca/run-dca.ts apps/company-map/src/lib/dca/toss-deps.ts apps/company-map/scripts/dca-smoke.ts
git commit -m "feat(company-map): DCA 오케스트레이터 + 멱등성 스모크 스크립트"
```

---

### Task 7: 워커 루프 등록

**Files:**
- Create: `apps/company-map/worker/dca-loop.ts`
- Modify: `apps/company-map/worker/index.ts` (import 블록 + `else` 분기 하단)

**Interfaces:**
- Consumes: Task 6의 `runDca`, Task 5의 `tossDcaDeps`/`isDcaKilled`, 기존 `worker/db.ts`의 `db`, 기존 `worker/us-market.ts`의 `usRegularTradeDate`
- Produces: `dcaLoop(): Promise<void>`

- [ ] **Step 1: 루프 작성**

`apps/company-map/worker/dca-loop.ts` — 기존 `worker/vr-loop.ts`와 같은 형태로 만든다.

```ts
import { db } from "./db";
import { usRegularTradeDate } from "./us-market";
import { runDca } from "@/lib/dca/run-dca";
import { isDcaKilled, tossDcaDeps } from "@/lib/dca/toss-deps";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15분 폴

export async function dcaLoop(): Promise<void> {
  console.log("[dca-loop] starting (15min poll, US 정규장 거래일당 1회)");
  while (true) {
    try {
      const tradeDate = await usRegularTradeDate();
      if (tradeDate) {
        const accounts = await db.dcaAccount.findMany({ where: { status: "active" } });
        for (const a of accounts) {
          if (a.lastRunDate === tradeDate) continue; // 거래일당 1회
          try {
            const r = await runDca(db, tossDcaDeps(), a.id, tradeDate, isDcaKilled());
            console.log(`[dca] ${a.name} (${tradeDate}):`, r, a.dryRun ? "[dryRun]" : "[LIVE]");
          } catch (e) {
            console.error(`[dca] ${a.name} run failed:`, e);
          }
        }
      }
    } catch (e) {
      console.error("[dca-loop] iteration failed:", e);
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  }
}
```

- [ ] **Step 2: worker/index.ts에 등록**

import 블록에서 `import { vrLoop } from "./vr-loop";` 아래에 추가:
```ts
import { dcaLoop } from "./dca-loop";
```

`else` 분기 안, `vrLoop().catch(...)` 블록 아래에 추가:
```ts
  dcaLoop().catch((err) =>
    console.error("[worker] dca loop crashed:", err),
  );
```

- [ ] **Step 3: 루프가 기동되는지 확인 (짧게 띄우고 종료)**

`worker/dca-loop.ts`는 export만 있어 단독 실행으로는 아무 일도 하지 않는다. 아래처럼 불러서 확인한다.

Run:
```bash
cd apps/company-map && npx tsx -e '
import "./worker/setup-env";
import { dcaLoop } from "./worker/dca-loop";
dcaLoop();
setTimeout(() => process.exit(0), 20000);
' 2>&1 | head -20
```
Expected: `[dca-loop] starting (15min poll, US 정규장 거래일당 1회)` 출력. 활성 계좌가 없으면 그 뒤로 조용하고, US 정규장이 닫혀 있으면 아무 것도 실행하지 않는다. 에러 스택이 없어야 한다.

- [ ] **Step 4: lint 확인**

Run: `cd apps/company-map && npx eslint worker/dca-loop.ts worker/index.ts`
Expected: 출력 없음

- [ ] **Step 5: Commit (승인 후)**

```bash
git add apps/company-map/worker/dca-loop.ts apps/company-map/worker/index.ts
git commit -m "feat(company-map): DCA 워커 루프 (15분 폴, 거래일당 1회)"
```

---

### Task 8: Server Actions (`actions/dca.ts`)

**Files:**
- Create: `apps/company-map/src/actions/dca.ts`

**Interfaces:**
- Consumes: Task 2~6 전부, 기존 `@/lib/db`의 `db`, 기존 `@/lib/toss/client`의 `getPrices`/`getDailyCandles`/`getExchangeRate`/`getMarketCalendarUS`
- Produces:
  - `DcaAccountView` (아래 정의) — Task 9의 UI가 이 형태를 받는다
  - `listDcaAccounts(): Promise<DcaAccountView[]>`
  - `createDcaAccount(input: CreateDcaInput): Promise<{ ok: boolean; error?: string }>`
  - `updateDcaSettings(id, patch): Promise<{ ok: boolean; error?: string }>`
  - `setDcaStatus(id, status): Promise<void>`
  - `runDcaNow(id): Promise<{ ok: boolean; message: string }>`
  - `getDcaOrders(id, limit?): Promise<DcaOrder[]>`
  - `previewSeedPeak(symbol: string): Promise<{ price: number; date: string; candles: number } | null>`

- [ ] **Step 1: 액션 작성**

`apps/company-map/src/actions/dca.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  getDailyCandles,
  getExchangeRate,
  getMarketCalendarUS,
  getPrices,
} from "@/lib/toss/client";
import { drawdownPct, pickSymbol, seedPeak } from "@/lib/dca/peak";
import { planBuy, tradingDaysToOneShare, type DcaBuyPlan } from "@/lib/dca/sizing";
import { deriveHoldings } from "@/lib/dca/state";
import { runDca } from "@/lib/dca/run-dca";
import { isDcaKilled, tossDcaDeps, PEAK_SEED_COUNT } from "@/lib/dca/toss-deps";

const PAGE = "/stocks/dca";

export interface DcaAccountView {
  id: string;
  name: string;
  baseSymbol: string;
  leverSymbol: string;
  thresholdPct: number;
  dailyAmountKrw: number;
  premiumPct: number;
  cashKrw: number;
  peakPrice: number;
  peakDate: string;
  status: string;
  dryRun: boolean;
  note: string | null;
  startDate: string;
  lastRunDate: string | null;
  /** base 종목 현재가 (조회 실패 시 null) */
  basePrice: number | null;
  /** 현재가 기준 낙폭(%) — 판정은 워커가 전일 종가로 한다는 점을 화면에 안내 */
  currentDrawdownPct: number | null;
  /** 지금 시점 기준 매수 대상 */
  pickedSymbol: string | null;
  leveraged: boolean;
  pickedPrice: number | null;
  fxRate: number | null;
  /** 오늘 주문 미리보기. 1주 미만이면 null */
  plan: DcaBuyPlan | null;
  /** 1주까지 남은 거래일 수 (plan이 null일 때 안내용) */
  daysToOneShare: number | null;
  /** 종목별 보유수량 */
  holdings: Record<string, number>;
  /** 보유 평가액 USD (시세 조회 실패 종목은 제외) */
  evalUsd: number | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listDcaAccounts(): Promise<DcaAccountView[]> {
  const accounts = await db.dcaAccount.findMany({ orderBy: { createdAt: "asc" } });
  const views: DcaAccountView[] = [];

  for (const acc of accounts) {
    const fills = await db.dcaOrder.findMany({
      where: { accountId: acc.id, status: { in: ["simulated_filled", "filled"] } },
      select: { symbol: true, filledQty: true },
    });
    const holdings = deriveHoldings(fills);

    let basePrice: number | null = null;
    let leverPrice: number | null = null;
    let fxRate: number | null = null;
    try {
      const symbols = [acc.baseSymbol, acc.leverSymbol];
      const prices = await getPrices(symbols);
      basePrice = Number(prices.find((p) => p.symbol === acc.baseSymbol)?.lastPrice ?? 0) || null;
      leverPrice = Number(prices.find((p) => p.symbol === acc.leverSymbol)?.lastPrice ?? 0) || null;
      fxRate = (await getExchangeRate("USD", "KRW")) || null;
    } catch {
      // 시세·환율 실패는 화면에서 "—"로 표시한다
    }

    const currentDrawdownPct = basePrice != null ? drawdownPct(basePrice, acc.peakPrice) : null;
    const pick =
      basePrice != null
        ? pickSymbol({
            prevClose: basePrice,
            peak: acc.peakPrice,
            thresholdPct: acc.thresholdPct,
            baseSymbol: acc.baseSymbol,
            leverSymbol: acc.leverSymbol,
          })
        : null;
    const pickedPrice = pick == null ? null : pick.leveraged ? leverPrice : basePrice;

    const plan =
      pickedPrice != null && fxRate != null
        ? planBuy({
            cashKrw: acc.cashKrw,
            fxRate,
            price: pickedPrice,
            premiumPct: acc.premiumPct,
          })
        : null;
    const daysToOneShare =
      plan == null && pickedPrice != null && fxRate != null
        ? tradingDaysToOneShare({
            cashKrw: acc.cashKrw,
            dailyAmountKrw: acc.dailyAmountKrw,
            fxRate,
            price: pickedPrice,
            premiumPct: acc.premiumPct,
          })
        : null;

    let evalUsd: number | null = null;
    if (basePrice != null && leverPrice != null) {
      evalUsd =
        Math.round(
          ((holdings[acc.baseSymbol] ?? 0) * basePrice +
            (holdings[acc.leverSymbol] ?? 0) * leverPrice) *
            100,
        ) / 100;
    }

    views.push({
      id: acc.id,
      name: acc.name,
      baseSymbol: acc.baseSymbol,
      leverSymbol: acc.leverSymbol,
      thresholdPct: acc.thresholdPct,
      dailyAmountKrw: acc.dailyAmountKrw,
      premiumPct: acc.premiumPct,
      cashKrw: acc.cashKrw,
      peakPrice: acc.peakPrice,
      peakDate: acc.peakDate,
      status: acc.status,
      dryRun: acc.dryRun,
      note: acc.note,
      startDate: acc.startDate,
      lastRunDate: acc.lastRunDate,
      basePrice,
      currentDrawdownPct,
      pickedSymbol: pick?.symbol ?? null,
      leveraged: pick?.leveraged ?? false,
      pickedPrice,
      fxRate,
      plan,
      daysToOneShare,
      holdings,
      evalUsd,
    });
  }
  return views;
}

/** 계좌 생성 폼에서 peak 자동 시딩 값을 미리 보여주기 위한 조회. */
export async function previewSeedPeak(
  symbol: string,
): Promise<{ price: number; date: string; candles: number } | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  try {
    const candles = await getDailyCandles(sym, PEAK_SEED_COUNT);
    const seed = seedPeak(candles);
    return seed ? { ...seed, candles: candles.length } : null;
  } catch {
    return null;
  }
}

export interface CreateDcaInput {
  name: string;
  baseSymbol: string;
  leverSymbol: string;
  thresholdPct: number;
  dailyAmountKrw: number;
  premiumPct: number;
  /** 비우면 base 종목 일봉 최고 종가로 자동 시딩 */
  peakPrice: number | null;
  initialCashKrw: number;
}

export async function createDcaAccount(
  input: CreateDcaInput,
): Promise<{ ok: boolean; error?: string }> {
  const base = input.baseSymbol.trim().toUpperCase();
  const lever = input.leverSymbol.trim().toUpperCase();
  if (!base || !lever) return { ok: false, error: "기준·레버리지 종목을 모두 입력하세요" };
  if (base === lever) return { ok: false, error: "기준 종목과 레버리지 종목이 같습니다" };
  if (!(input.thresholdPct > 0) || input.thresholdPct >= 100) {
    return { ok: false, error: "하락 임계%는 0~100 사이여야 합니다" };
  }
  if (!(input.dailyAmountKrw > 0)) return { ok: false, error: "거래일당 적립액은 0보다 커야 합니다" };
  if (!(input.premiumPct >= 0) || input.premiumPct >= 100) {
    return { ok: false, error: "LOC 프리미엄%는 0~100 사이여야 합니다" };
  }
  if (input.initialCashKrw < 0) return { ok: false, error: "초기 잔액은 음수 불가" };

  const today = todayIso();
  let peakPrice = input.peakPrice;
  let peakDate = today;
  if (peakPrice == null || !(peakPrice > 0)) {
    const seed = await previewSeedPeak(base);
    if (!seed) {
      return { ok: false, error: `${base} 일봉을 받지 못했습니다 — 최고가를 직접 입력하세요` };
    }
    peakPrice = seed.price;
    peakDate = seed.date;
  }

  await db.dcaAccount.create({
    data: {
      name: input.name.trim() || `${base}·${lever} 적립식`,
      baseSymbol: base,
      leverSymbol: lever,
      thresholdPct: input.thresholdPct,
      dailyAmountKrw: input.dailyAmountKrw,
      premiumPct: input.premiumPct,
      cashKrw: input.initialCashKrw,
      peakPrice,
      peakDate,
      startDate: today,
      dryRun: true, // LIVE 전환은 생성 후 사용자가 직접
    },
  });
  revalidatePath(PAGE);
  return { ok: true };
}

export async function setDcaStatus(
  id: string,
  status: "active" | "paused" | "stopped",
): Promise<void> {
  await db.dcaAccount.update({ where: { id }, data: { status } });
  revalidatePath(PAGE);
}

export async function updateDcaSettings(
  id: string,
  patch: {
    thresholdPct?: number;
    dailyAmountKrw?: number;
    premiumPct?: number;
    cashKrw?: number;
    peakPrice?: number;
    dryRun?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (patch.thresholdPct !== undefined && (!(patch.thresholdPct > 0) || patch.thresholdPct >= 100)) {
    return { ok: false, error: "하락 임계%는 0~100 사이여야 합니다" };
  }
  if (patch.dailyAmountKrw !== undefined && !(patch.dailyAmountKrw > 0)) {
    return { ok: false, error: "거래일당 적립액은 0보다 커야 합니다" };
  }
  if (patch.premiumPct !== undefined && (!(patch.premiumPct >= 0) || patch.premiumPct >= 100)) {
    return { ok: false, error: "LOC 프리미엄%는 0~100 사이여야 합니다" };
  }
  if (patch.cashKrw !== undefined && patch.cashKrw < 0) {
    return { ok: false, error: "이월 잔액은 음수 불가" };
  }
  if (patch.peakPrice !== undefined && !(patch.peakPrice > 0)) {
    return { ok: false, error: "최고가는 0보다 커야 합니다" };
  }
  await db.dcaAccount.update({ where: { id }, data: patch });
  revalidatePath(PAGE);
  return { ok: true };
}

/** 현재 열린 US 정규장 세션의 거래일. 없으면 null. (worker/us-market.ts와 동일 판정) */
async function currentUsTradeDate(): Promise<string | null> {
  const cal = await getMarketCalendarUS();
  const now = Date.now();
  for (const day of [cal.previousBusinessDay, cal.today, cal.nextBusinessDay]) {
    const reg = day?.regularMarket as { startTime?: string; endTime?: string } | undefined;
    if (!reg?.startTime || !reg?.endTime) continue;
    const open = new Date(reg.startTime).getTime();
    const close = new Date(reg.endTime).getTime();
    if (now >= open && now < close) return day.date;
  }
  return null;
}

export async function runDcaNow(id: string): Promise<{ ok: boolean; message: string }> {
  const tradeDate = await currentUsTradeDate();
  if (!tradeDate) return { ok: false, message: "US 정규장이 열려있지 않습니다" };
  const r = await runDca(db, tossDcaDeps(), id, tradeDate, isDcaKilled());
  revalidatePath(PAGE);
  if (r.blocked) return { ok: false, message: `보류: ${r.blocked}` };
  const parts = [
    r.symbol ? `대상 ${r.symbol}` : null,
    r.drawdownPct != null ? `낙폭 ${r.drawdownPct}%` : null,
    r.accrued ? "적립 반영" : "적립 이미 완료",
    r.placed > 0 ? "실주문 1건 제출" : r.simulated > 0 ? "시뮬레이션 1건 기록" : "주문 없음(1주 미만)",
  ].filter(Boolean);
  return { ok: true, message: parts.join(" · ") };
}

export async function getDcaOrders(id: string, limit = 100) {
  return db.dcaOrder.findMany({
    where: { accountId: id },
    orderBy: [{ tradeDate: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}
```

- [ ] **Step 2: `getPrices` 반환 형태 확인**

위 코드는 `getPrices(symbols)`가 `symbol`·`lastPrice` 필드를 가진 배열을 준다고 가정한다.

Run: `cd apps/company-map && grep -n "export async function getPrices" -A20 src/lib/toss/client.ts`
Expected: 반환 원소에 `symbol`과 `lastPrice`가 있음. 필드명이 다르면 `listDcaAccounts`의 해당 부분을 실제 타입에 맞춰 고친다.

- [ ] **Step 3: 타입 체크**

Run: `cd apps/company-map && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/actions/dca|src/lib/dca" || echo "dca 타입 에러 없음"`
Expected: `dca 타입 에러 없음`

- [ ] **Step 4: lint 확인**

Run: `cd apps/company-map && npx eslint src/actions/dca.ts`
Expected: 출력 없음

- [ ] **Step 5: Commit (승인 후)**

```bash
git add apps/company-map/src/actions/dca.ts
git commit -m "feat(company-map): DCA Server Actions (조회·생성·설정·지금 실행)"
```

---

### Task 9: 화면 + 메뉴 항목

**Files:**
- Create: `apps/company-map/src/app/stocks/dca/page.tsx`
- Create: `apps/company-map/src/app/stocks/dca/DcaManager.tsx`
- Modify: `apps/company-map/src/components/layout/AppMenu.tsx` (lucide import + SERVICE 배열)

**Interfaces:**
- Consumes: Task 8의 `listDcaAccounts`, `DcaAccountView`, `createDcaAccount`, `CreateDcaInput`, `updateDcaSettings`, `setDcaStatus`, `runDcaNow`, `getDcaOrders`, `previewSeedPeak`
- Produces: `/stocks/dca` 페이지

- [ ] **Step 1: 페이지 진입점 작성**

`apps/company-map/src/app/stocks/dca/page.tsx`:

```tsx
import Link from "next/link";
import { listDcaAccounts } from "@/actions/dca";
import { DcaManager } from "./DcaManager";

export const dynamic = "force-dynamic";

export default async function DcaPage() {
  const accounts = await listDcaAccounts();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/stocks" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← 전종목 조회
      </Link>
      <h1 className="mt-4 mb-2 text-xl font-bold">QQQ·QLD 적립식</h1>
      <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
        기준 종목이 직전 최고 종가 대비 임계% 이상 하락한 거래일에는 레버리지 종목을, 그 외에는 기준
        종목을 매 거래일 설정 금액만큼 LOC(종가) 매수합니다. 1주 값에 못 미치는 날은 적립만 되고
        잔액은 다음 거래일로 이월됩니다.
      </p>
      <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
        ⚠ 계좌는 항상 dryRun으로 생성됩니다. 설정에서 dryRun을 끄면 <strong>실제 매수 주문이 제출됩니다</strong>.
      </p>
      <DcaManager accounts={accounts} />
    </main>
  );
}
```

- [ ] **Step 2: 클라이언트 컴포넌트 작성**

`apps/company-map/src/app/stocks/dca/DcaManager.tsx` — `src/app/stocks/vr/VrManager.tsx`의 구조(카드 + `Stat` + 버튼 행 + 설정 폼 + 이력 테이블)를 그대로 따른다. `useEffect` 안 동기 `setState`를 쓰지 않는다(lint 규칙).

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDcaAccount,
  getDcaOrders,
  previewSeedPeak,
  runDcaNow,
  setDcaStatus,
  updateDcaSettings,
  type CreateDcaInput,
  type DcaAccountView,
} from "@/actions/dca";

const inputCls = "w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900";

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });

const krw = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n).toLocaleString("ko-KR")}원`;

type OrderRow = Awaited<ReturnType<typeof getDcaOrders>>[number];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 px-2 py-1.5 dark:border-gray-700">
      <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

export function DcaManager({ accounts }: { accounts: DcaAccountView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const toggleDetail = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    startTransition(async () => {
      const o = await getDcaOrders(id, 100);
      setOrders(o);
      setOpenId(id);
    });
  };

  return (
    <div className="space-y-4">
      {message && <p className="text-xs text-blue-600 dark:text-blue-400">{message}</p>}

      {accounts.map((a) => (
        <div key={a.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{a.name}</span>
            <span className="text-xs text-gray-500">
              {a.baseSymbol} → {a.leverSymbol}
            </span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {krw(a.dailyAmountKrw)}/거래일 · 임계 −{a.thresholdPct}% · LOC +{a.premiumPct}%
            </span>
            {a.dryRun ? (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                dryRun
              </span>
            ) : (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                LIVE
              </span>
            )}
            {a.status !== "active" && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {a.status}
              </span>
            )}
            {a.note && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {a.note}
              </span>
            )}
            <span className="ml-auto text-xs text-gray-400">
              시작 {a.startDate} · 마지막 실행 {a.lastRunDate ?? "—"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-6">
            <Stat
              label={`${a.baseSymbol} 낙폭 (현재가 기준)`}
              value={a.currentDrawdownPct != null ? `${a.currentDrawdownPct}%` : "—"}
            />
            <Stat label="최고 종가" value={`$${fmt(a.peakPrice)} (${a.peakDate})`} />
            <Stat
              label="지금 매수 대상"
              value={a.pickedSymbol ? `${a.pickedSymbol}${a.leveraged ? " (레버리지)" : ""}` : "—"}
            />
            <Stat label="이월 잔액" value={krw(a.cashKrw)} />
            <Stat
              label="보유"
              value={`${a.baseSymbol} ${fmt(a.holdings[a.baseSymbol] ?? 0, 0)} / ${a.leverSymbol} ${fmt(a.holdings[a.leverSymbol] ?? 0, 0)}주`}
            />
            <Stat label="평가액" value={a.evalUsd != null ? `$${fmt(a.evalUsd)}` : "—"} />
          </div>

          <div className="mt-3 rounded border border-gray-200 p-2 text-xs dark:border-gray-700">
            <div className="mb-1 font-semibold text-gray-600 dark:text-gray-300">오늘 주문 미리보기</div>
            {a.plan ? (
              <div className="font-mono">
                {a.pickedSymbol} LOC 매수 · 지정가 ${fmt(a.plan.price)} × {a.plan.quantity}주 · 최대{" "}
                ${fmt(a.plan.estUsd)} ({krw(a.plan.estKrw)})
              </div>
            ) : (
              <div className="text-gray-500 dark:text-gray-400">
                1주 값에 못 미쳐 적립만 됩니다
                {a.daysToOneShare != null && ` — 이 속도면 약 ${a.daysToOneShare}거래일 후 1주 가능`}
                {a.pickedPrice != null && ` (1주 ≈ $${fmt(a.pickedPrice)})`}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <button
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              disabled={pending}
              onClick={() => toggleDetail(a.id)}
            >
              {openId === a.id ? "이력 닫기" : "주문 이력"}
            </button>
            <button
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await runDcaNow(a.id);
                  setMessage(r.message);
                  router.refresh();
                })
              }
            >
              지금 실행
            </button>
            <button
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setDcaStatus(a.id, a.status === "active" ? "paused" : "active");
                  router.refresh();
                })
              }
            >
              {a.status === "active" ? "일시정지" : "재개"}
            </button>
            <button
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              disabled={pending}
              onClick={() => setSettingsId(settingsId === a.id ? null : a.id)}
            >
              {settingsId === a.id ? "설정 닫기" : "설정"}
            </button>
          </div>

          {settingsId === a.id && (
            <SettingsForm
              account={a}
              onDone={(msg) => {
                setSettingsId(null);
                if (msg) setMessage(msg);
              }}
            />
          )}

          {openId === a.id && <OrderHistory orders={orders} />}
        </div>
      ))}

      <div>
        <button
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? "생성 폼 닫기" : "+ 계좌 추가"}
        </button>
      </div>

      {showCreate && (
        <CreateForm
          onDone={(msg) => {
            setShowCreate(false);
            if (msg) setMessage(msg);
          }}
        />
      )}
    </div>
  );
}

function OrderHistory({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">주문 이력이 없습니다.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-gray-500 dark:text-gray-400">
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-2 py-1 text-left">거래일</th>
            <th className="px-2 py-1 text-left">종목</th>
            <th className="px-2 py-1 text-right">낙폭</th>
            <th className="px-2 py-1 text-right">지정가</th>
            <th className="px-2 py-1 text-right">수량</th>
            <th className="px-2 py-1 text-left">상태</th>
            <th className="px-2 py-1 text-right">체결가</th>
            <th className="px-2 py-1 text-right">환율</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-gray-100 dark:border-gray-800">
              <td className="px-2 py-1">{o.tradeDate}</td>
              <td className="px-2 py-1">{o.symbol}</td>
              <td className="px-2 py-1 text-right">{o.drawdownPct}%</td>
              <td className="px-2 py-1 text-right">${fmt(o.price)}</td>
              <td className="px-2 py-1 text-right">{fmt(o.quantity, 0)}</td>
              <td className="px-2 py-1">
                {o.status}
                {o.error && <span className="ml-1 text-red-600 dark:text-red-400">({o.error})</span>}
              </td>
              <td className="px-2 py-1 text-right">{o.filledPrice != null ? `$${fmt(o.filledPrice)}` : "—"}</td>
              <td className="px-2 py-1 text-right">{fmt(o.fxRate, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsForm({
  account,
  onDone,
}: {
  account: DcaAccountView;
  onDone: (message?: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [thresholdPct, setThresholdPct] = useState(String(account.thresholdPct));
  const [dailyAmountKrw, setDailyAmountKrw] = useState(String(account.dailyAmountKrw));
  const [premiumPct, setPremiumPct] = useState(String(account.premiumPct));
  const [cashKrw, setCashKrw] = useState(String(account.cashKrw));
  const [peakPrice, setPeakPrice] = useState(String(account.peakPrice));
  const [dryRun, setDryRun] = useState(account.dryRun);

  return (
    <div className="mt-3 rounded border border-gray-200 p-3 dark:border-gray-700">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <label>
          하락 임계 %
          <input className={inputCls} value={thresholdPct} onChange={(e) => setThresholdPct(e.target.value)} />
        </label>
        <label>
          거래일당 적립액 (원)
          <input className={inputCls} value={dailyAmountKrw} onChange={(e) => setDailyAmountKrw(e.target.value)} />
        </label>
        <label>
          LOC 프리미엄 %
          <input className={inputCls} value={premiumPct} onChange={(e) => setPremiumPct(e.target.value)} />
        </label>
        <label>
          이월 잔액 (원) — 워커가 꺼져 있어 누락된 적립을 여기서 보정
          <input className={inputCls} value={cashKrw} onChange={(e) => setCashKrw(e.target.value)} />
        </label>
        <label>
          최고 종가 (USD)
          <input className={inputCls} value={peakPrice} onChange={(e) => setPeakPrice(e.target.value)} />
        </label>
        <label className="flex items-end gap-2">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          <span>dryRun (끄면 실주문 제출)</span>
        </label>
      </div>
      <div className="mt-2 flex gap-2 text-xs">
        <button
          className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              if (!dryRun && account.dryRun) {
                const ok = window.confirm(
                  "dryRun을 끄면 다음 실행부터 실제 매수 주문이 제출됩니다. 계속하시겠습니까?",
                );
                if (!ok) return;
              }
              const r = await updateDcaSettings(account.id, {
                thresholdPct: Number(thresholdPct),
                dailyAmountKrw: Number(dailyAmountKrw),
                premiumPct: Number(premiumPct),
                cashKrw: Number(cashKrw),
                peakPrice: Number(peakPrice),
                dryRun,
              });
              router.refresh();
              onDone(r.ok ? "설정을 저장했습니다" : r.error);
            })
          }
        >
          저장
        </button>
        <button
          className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          onClick={() => onDone()}
        >
          취소
        </button>
      </div>
    </div>
  );
}

function CreateForm({ onDone }: { onDone: (message?: string) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<CreateDcaInput>({
    name: "",
    baseSymbol: "QQQ",
    leverSymbol: "QLD",
    thresholdPct: 10,
    dailyAmountKrw: 50000,
    premiumPct: 5,
    peakPrice: null,
    initialCashKrw: 0,
  });
  const [seedInfo, setSeedInfo] = useState<string | null>(null);

  const set = <K extends keyof CreateDcaInput>(k: K, v: CreateDcaInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <label>
          이름
          <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="QQQ·QLD 적립식" />
        </label>
        <label>
          기준 종목
          <input className={inputCls} value={form.baseSymbol} onChange={(e) => set("baseSymbol", e.target.value)} />
        </label>
        <label>
          레버리지 종목
          <input className={inputCls} value={form.leverSymbol} onChange={(e) => set("leverSymbol", e.target.value)} />
        </label>
        <label>
          하락 임계 %
          <input className={inputCls} value={form.thresholdPct} onChange={(e) => set("thresholdPct", Number(e.target.value))} />
        </label>
        <label>
          거래일당 적립액 (원)
          <input className={inputCls} value={form.dailyAmountKrw} onChange={(e) => set("dailyAmountKrw", Number(e.target.value))} />
        </label>
        <label>
          LOC 프리미엄 %
          <input className={inputCls} value={form.premiumPct} onChange={(e) => set("premiumPct", Number(e.target.value))} />
        </label>
        <label>
          초기 이월 잔액 (원)
          <input className={inputCls} value={form.initialCashKrw} onChange={(e) => set("initialCashKrw", Number(e.target.value))} />
        </label>
        <label>
          최고 종가 (비우면 자동)
          <input
            className={inputCls}
            value={form.peakPrice ?? ""}
            onChange={(e) => set("peakPrice", e.target.value === "" ? null : Number(e.target.value))}
          />
        </label>
      </div>

      <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
        ⚠ 자동 시딩은 토스 일봉 상한(200봉 ≈ 10개월) 안의 최고 종가만 봅니다. 사상 최고가가 그보다
        오래됐다면 초기 낙폭이 과소평가되므로 직접 입력하세요.
      </p>
      {seedInfo && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{seedInfo}</p>}

      <div className="mt-2 flex gap-2 text-xs">
        <button
          className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const s = await previewSeedPeak(form.baseSymbol);
              setSeedInfo(
                s
                  ? `${form.baseSymbol.toUpperCase()} 일봉 ${s.candles}건 중 최고 종가 $${s.price} (${s.date})`
                  : `${form.baseSymbol.toUpperCase()} 일봉을 받지 못했습니다`,
              );
            })
          }
        >
          자동 시딩 값 확인
        </button>
        <button
          className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await createDcaAccount(form);
              router.refresh();
              onDone(r.ok ? "계좌를 생성했습니다 (dryRun)" : r.error);
            })
          }
        >
          생성
        </button>
        <button
          className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          onClick={() => onDone()}
        >
          취소
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 메뉴 항목 추가**

`apps/company-map/src/components/layout/AppMenu.tsx` 두 곳을 수정한다.

lucide import 블록에서 `Scale,` 다음 줄에 추가:
```ts
  CalendarClock,
```

SERVICE 배열의 `vr` 항목 **다음**(배열 닫는 `];` 바로 앞)에 추가:
```ts
  {
    key: "dca",
    name: "QQQ·QLD 적립식",
    description: "QQQ 낙폭 10% 이상이면 QLD, 아니면 QQQ 매일 적립",
    path: "/stocks/dca",
    icon: CalendarClock,
  },
```

- [ ] **Step 4: 타입 체크**

Run: `cd apps/company-map && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "stocks/dca|AppMenu" || echo "dca UI 타입 에러 없음"`
Expected: `dca UI 타입 에러 없음`

- [ ] **Step 5: lint 확인**

Run: `cd apps/company-map && npx eslint src/app/stocks/dca/page.tsx src/app/stocks/dca/DcaManager.tsx src/components/layout/AppMenu.tsx`
Expected: 출력 없음. `react-hooks/set-state-in-effect`가 나오면 해당 `setState`를 `await` 뒤로 옮긴다.

- [ ] **Step 6: 브라우저 수동 검증 (사용자에게 요청)**

가동 중인 dev 서버(`nps dev`, 포트 3004)에 HMR로 반영된다. 사용자에게 다음을 확인해 달라고 요청한다.
1. `http://localhost:3004/stocks/dca` 진입 — 헤더·경고문·"계좌 추가" 버튼이 보인다
2. AppMenu에서 "밸류리밸런싱 VR" **바로 아래**에 "QQQ·QLD 적립식"이 있고 링크가 동작한다
3. "계좌 추가" → "자동 시딩 값 확인" → `QQQ 일봉 200건 중 최고 종가 $746.16 (2026-06-02)` 형태로 표시된다
4. 기본값으로 "생성" → 카드가 생기고 낙폭·최고 종가·이월 잔액 0원·"1주 값에 못 미쳐 적립만 됩니다 — 이 속도면 약 21거래일 후 1주 가능"이 보인다
5. "지금 실행" → US 정규장이 열려 있으면 `대상 QQQ · 낙폭 -4.06% · 적립 반영 · 주문 없음(1주 미만)`, 닫혀 있으면 `보류: US 정규장이 열려있지 않습니다`
6. 정규장 중이라면 "지금 실행"을 한 번 더 눌러 `적립 이미 완료`가 나오고 이월 잔액이 5만원에서 늘지 않는다

- [ ] **Step 7: Commit (승인 후)**

```bash
git add apps/company-map/src/app/stocks/dca apps/company-map/src/components/layout/AppMenu.tsx
git commit -m "feat(company-map): QQQ·QLD 적립식 화면 + AppMenu 항목 추가"
```

---

### Task 10: 최종 검증 + 문서 갱신

**Files:**
- Modify: `apps/company-map/README.md` (기능 목록에 한 줄 추가 — 기존 markdown 파일이므로 형식 유지)
- Modify: `CLAUDE.md` (company-map 섹션에 DCA 한 줄 + 주의사항)

**Interfaces:**
- Consumes: Task 1~9 전부
- Produces: 없음 (검증·문서)

- [ ] **Step 1: 전체 테스트 실행**

Run: `yarn workspace company-map test`
Expected: 기존 테스트 + 신규 4개 파일(`peak.test.ts`, `sizing.test.ts`, `state.test.ts`, `toss-deps.test.ts`) 전부 통과. 실패가 있으면 고칠 것.

- [ ] **Step 2: 변경 파일 전체 lint**

Run:
```bash
cd apps/company-map && npx eslint \
  src/lib/dca/*.ts src/actions/dca.ts \
  src/app/stocks/dca/page.tsx src/app/stocks/dca/DcaManager.tsx \
  src/components/layout/AppMenu.tsx \
  worker/dca-loop.ts worker/index.ts scripts/dca-smoke.ts
```
Expected: 출력 없음

- [ ] **Step 3: 타입 체크 전체**

Run: `cd apps/company-map && npx tsc --noEmit -p tsconfig.json`
Expected: 신규 파일 관련 에러 0 (기존 파일의 pre-existing 에러가 있으면 건드리지 않고 보고만 한다)

- [ ] **Step 4: 멱등성 스모크 재실행**

Run: `cd apps/company-map && npx tsx scripts/dca-smoke.ts`
Expected: `✅ 중복 적립·중복 주문 없음` + `[smoke] 임시 계좌 삭제 완료`

- [ ] **Step 5: README에 한 줄 추가**

`apps/company-map/README.md`의 기능 목록에 아래 항목을 기존 형식에 맞춰 추가한다.

```markdown
- **QQQ·QLD 적립식** (`/stocks/dca`) — 기준 종목이 직전 최고 종가 대비 임계% 이상 하락한 거래일에는 레버리지 종목을, 그 외에는 기준 종목을 매 거래일 설정 원화만큼 LOC 매수. 1주 미만이면 적립만 되고 잔액 이월. 워커 `dca-loop`가 US 정규장 중 15분 폴로 거래일당 1회 실행.
```

- [ ] **Step 6: CLAUDE.md에 주의사항 추가**

`CLAUDE.md`의 company-map 앱 설명(worker 항목)에 아래를 반영한다.

`worker/` 설명 문장 뒤에 추가:
```
메인 루프와 별개로 가격 변동(`price-change-loop`)·ETF PDF(`etf-pdf-loop`)·무한매수(`infinite-buy-loop`)·VR(`vr-loop`)·적립식(`dca-loop`) 루프가 동시 실행됨.
```

"company-map 작업 시 주의사항" 목록에 추가:
```
- **QQQ·QLD 적립식(`/stocks/dca`)의 자금 상태는 `cashKrw` 하나에 모인다** — 적립은 `lastAccrualDate`, 체결 차감은 주문의 `stateApplied`, 주문 생성은 "당일 주문 존재" 카운트로 각각 독립 멱등을 보장한다. 세 가드 중 하나를 `lastRunDate`로 합치면 보류·재시도 시 중복 적립이나 이중 차감이 발생한다. 또 워커가 꺼져 있던 거래일은 적립이 누락되며 보정 로직이 없으므로 설정 폼에서 `cashKrw`를 수동으로 맞춘다.
```

- [ ] **Step 7: 스펙과 대조**

`docs/superpowers/specs/2026-08-27-qqq-qld-dca-design.html`의 13장 "검증 기준" 5개를 하나씩 확인하고 결과를 사용자에게 보고한다. 충족하지 못한 항목이 있으면 명시한다.

- [ ] **Step 8: Commit (승인 후)**

```bash
git add apps/company-map/README.md CLAUDE.md
git commit -m "docs(company-map): QQQ·QLD 적립식 기능 문서화"
```

---

## 부록: 기능이 실제로 어떻게 동작하는지 (검증 시 기대치)

2026-08-27 실측값 기준으로, 기본 설정(5만원/거래일, 임계 10%, 프리미엄 5%)의 예상 거동:

| 상황 | 동작 |
|---|---|
| QQQ 낙폭 −4.06% (현재) | 매수 대상 = QQQ |
| 잔액 5만원, QQQ 1주 ≈ $716 (LOC 상한 $751.66 ≈ 103.6만원) | 주문 없음 — 약 21거래일 적립 후 1주 |
| QQQ가 −10% 이하로 떨어진 뒤 | 매수 대상 = QLD ($90.07, LOC 상한 $94.57 ≈ 13.0만원) → 약 3거래일마다 1주 |
| QQQ가 신고가 갱신 | `peakPrice`가 따라 올라가 낙폭 기준선이 상향 |
| 워커가 꺼져 있던 거래일 | 적립 누락 (보정 없음) — 설정 폼에서 `cashKrw` 수동 조정 |

이 전략은 대부분의 거래일에 "적립만 하고 주문 없음"이 정상이다. 주문이 안 나온다고 버그로 판단하지 말 것.
