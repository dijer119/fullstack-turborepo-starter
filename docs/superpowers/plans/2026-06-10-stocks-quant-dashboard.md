# 종목 상세 퀀트 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks/[code]` 상세 페이지 최상단에 기준가·시총 카드, 52주 위치·ROE·PBR 반원 게이지, 배당률·국채시가배당률·순이익 YoY·서준식 지수 세부 카드로 구성된 퀀트 대시보드 섹션을 추가한다.

**Architecture:** 서버 컴포넌트 통합(A안). `page.tsx`가 신규 캐시 헬퍼 2개(52주 고저 = 네이버 시세 1년 조회, 국채금리 = 한은 ECOS)를 기존 DB 조회와 병렬 실행하고, 계산은 순수 함수 모듈 `quant-metrics.ts`에 모은다. 게이지만 recharts 클라이언트 컴포넌트. 외부 API는 24h TTL DB 캐시 + stale 폴백으로 페이지 렌더를 절대 막지 않는다.

**Tech Stack:** Next.js 16 App Router(서버 컴포넌트) · Prisma(SQLite, `@prisma-clients/company-map`) · recharts · Vitest

**Spec:** `docs/superpowers/specs/2026-06-10-stocks-quant-dashboard-design.html`

**규약 주의:**
- 모든 명령은 리포 루트에서 `yarn workspace company-map …`으로 실행
- 이 앱은 Vitest 사용 (Jest 아님). 테스트는 소스 옆 `*.test.ts`
- `db`는 `@/lib/db`에서 import (서버 전용 Prisma 싱글턴)
- 외부 fetch에는 반드시 `AbortSignal.timeout(10_000)` + `User-Agent` 헤더
- Tailwind `dark:` 클래스로 라이트/다크 모두 지원

---

### Task 1: Prisma 모델 추가 (Week52Price, MarketRate)

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma`

- [ ] **Step 1: StockMaster에 역방향 관계 추가**

`model StockMaster` 블록의 `rating  StockRating?` 줄 아래에 추가:

```prisma
  week52Price           Week52Price?
```

- [ ] **Step 2: 파일 맨 끝에 신규 모델 2개 추가**

```prisma
model Week52Price {
  code      String   @id
  high      Float
  low       Float
  asOfDate  DateTime @map("as_of_date")
  fetchedAt DateTime @default(now()) @map("fetched_at")

  master StockMaster @relation(fields: [code], references: [code], onDelete: Cascade)

  @@map("week52_prices")
}

model MarketRate {
  kind      String   @id
  ratePct   Float    @map("rate_pct")
  fetchedAt DateTime @default(now()) @map("fetched_at")

  @@map("market_rates")
}
```

- [ ] **Step 3: 마이그레이션 실행 (generate 포함)**

Run: `yarn workspace company-map prisma migrate dev --name add_week52_and_market_rate`
Expected: 새 마이그레이션 생성, `week52_prices`·`market_rates` 테이블 생성, Prisma Client 재생성 완료 메시지

- [ ] **Step 4: 타입 확인**

Run: `cd apps/company-map && npx tsc --noEmit`
Expected: 에러 0

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/prisma
git commit -m "feat(company-map): add Week52Price and MarketRate models"
```

---

### Task 2: 지표 계산 순수 함수 (quant-metrics.ts, TDD)

**Files:**
- Create: `apps/company-map/src/lib/stocks/quant-metrics.ts`
- Test: `apps/company-map/src/lib/stocks/quant-metrics.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
import { describe, it, expect } from "vitest";
import {
  resolveRoe,
  week52Position,
  bondDividendRatio,
  seoJunsikReturn,
  isFresh,
  reprtLabel,
} from "./quant-metrics";

describe("resolveRoe", () => {
  it("수동 ROE가 있으면 우선한다", () => {
    expect(resolveRoe(12.5, 10, 1.5)).toBe(12.5);
  });
  it("수동값이 없으면 PBR/PER×100", () => {
    expect(resolveRoe(null, 10, 2)).toBeCloseTo(20);
  });
  it("per/pbr가 0 이하이거나 null이면 null", () => {
    expect(resolveRoe(null, 0, 2)).toBeNull();
    expect(resolveRoe(null, 10, -1)).toBeNull();
    expect(resolveRoe(null, null, 2)).toBeNull();
  });
});

describe("week52Position", () => {
  it("이미지 검산: 현재가 72900, 저가 58000, 고가 88200 → 49.3%", () => {
    expect(week52Position(72900, 58000, 88200)).toBeCloseTo(49.34, 1);
  });
  it("저가/고가 경계에서 0과 100", () => {
    expect(week52Position(58000, 58000, 88200)).toBe(0);
    expect(week52Position(88200, 58000, 88200)).toBe(100);
  });
  it("범위를 벗어나면 0~100으로 클램프", () => {
    expect(week52Position(90000, 58000, 88200)).toBe(100);
    expect(week52Position(50000, 58000, 88200)).toBe(0);
  });
  it("high<=low 또는 값 누락이면 null", () => {
    expect(week52Position(100, 200, 200)).toBeNull();
    expect(week52Position(null, 100, 200)).toBeNull();
  });
});

describe("bondDividendRatio", () => {
  it("배당수익률 ÷ 국채금리", () => {
    expect(bondDividendRatio(4.12, 3.7)).toBeCloseTo(1.11, 2);
  });
  it("금리가 0 이하 또는 null이면 null", () => {
    expect(bondDividendRatio(4, 0)).toBeNull();
    expect(bondDividendRatio(4, null)).toBeNull();
    expect(bondDividendRatio(null, 3)).toBeNull();
  });
});

describe("seoJunsikReturn", () => {
  it("PBR 1.0, ROE 10% → 기대수익률 정확히 10%", () => {
    expect(seoJunsikReturn(1.0, 10)).toBeCloseTo(10, 6);
  });
  it("이미지 유사값 검산: PBR 1.23, ROE 21.97% → 약 19.5%", () => {
    expect(seoJunsikReturn(1.23, 21.97)).toBeCloseTo(19.47, 1);
  });
  it("PBR이 0 이하이거나 null이면 null", () => {
    expect(seoJunsikReturn(0, 10)).toBeNull();
    expect(seoJunsikReturn(null, 10)).toBeNull();
  });
  it("ROE가 -100% 이하이거나 null이면 null", () => {
    expect(seoJunsikReturn(1, -100)).toBeNull();
    expect(seoJunsikReturn(1, null)).toBeNull();
  });
});

describe("isFresh", () => {
  const ttl = 24 * 60 * 60 * 1000;
  it("TTL 이내면 true", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    expect(isFresh(new Date("2026-06-10T00:00:00Z"), now, ttl)).toBe(true);
  });
  it("TTL 경과면 false", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    expect(isFresh(new Date("2026-06-09T11:59:00Z"), now, ttl)).toBe(false);
  });
});

describe("reprtLabel", () => {
  it("DART 보고서 코드를 분기 라벨로 변환", () => {
    expect(reprtLabel("11013")).toBe("1Q");
    expect(reprtLabel("11012")).toBe("2Q");
    expect(reprtLabel("11014")).toBe("3Q");
    expect(reprtLabel("11011")).toBe("FY");
  });
  it("알 수 없는 코드는 그대로 반환", () => {
    expect(reprtLabel("99999")).toBe("99999");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/stocks/quant-metrics.test.ts`
Expected: FAIL — "Failed to resolve import ./quant-metrics"

- [ ] **Step 3: 구현 작성**

```typescript
/** 종목 상세 퀀트 대시보드 지표 계산 — 모두 순수 함수. */

/** 수동 ROE 우선, 없으면 PBR/PER×100 (단위 %). StockDetailHeader·탐색기와 공유. */
export function resolveRoe(
  manualRoe: number | null,
  per: number | null,
  pbr: number | null,
): number | null {
  if (manualRoe != null) return manualRoe;
  if (per != null && pbr != null && per > 0 && pbr > 0) return (pbr / per) * 100;
  return null;
}

/** 52주 저가 대비 현재가 위치(0~100%). 범위 밖 값은 클램프. */
export function week52Position(
  current: number | null,
  low: number | null,
  high: number | null,
): number | null {
  if (current == null || low == null || high == null) return null;
  if (!(high > low)) return null;
  const pct = ((current - low) / (high - low)) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** 국채시가배당률 = 예상 시가배당률 ÷ 국채금리 (배). */
export function bondDividendRatio(
  divYieldPct: number | null,
  treasuryYieldPct: number | null,
): number | null {
  if (divYieldPct == null || treasuryYieldPct == null || treasuryYieldPct <= 0) {
    return null;
  }
  return divYieldPct / treasuryYieldPct;
}

/**
 * 서준식 채권형 주식 기대수익률(연복리 %).
 * BPS = 현재가÷PBR, 10년 후 BPS = BPS×(1+ROE)^10,
 * 기대수익률 = (10년 후 BPS ÷ 현재가)^(1/10) − 1 = ((1+ROE)^10 ÷ PBR)^(1/10) − 1
 */
export function seoJunsikReturn(
  pbr: number | null,
  roePct: number | null,
): number | null {
  if (pbr == null || pbr <= 0 || roePct == null) return null;
  const roe = roePct / 100;
  if (roe <= -1) return null;
  const ratio = Math.pow(1 + roe, 10) / pbr;
  if (ratio <= 0) return null;
  return (Math.pow(ratio, 1 / 10) - 1) * 100;
}

/** 캐시 신선도 판정. */
export function isFresh(fetchedAt: Date, now: Date, ttlMs: number): boolean {
  return now.getTime() - fetchedAt.getTime() < ttlMs;
}

const REPRT_LABELS: Record<string, string> = {
  "11013": "1Q",
  "11012": "2Q",
  "11014": "3Q",
  "11011": "FY",
};

/** DART reprt_code → 분기 라벨. */
export function reprtLabel(code: string): string {
  return REPRT_LABELS[code] ?? code;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/stocks/quant-metrics.test.ts`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/lib/stocks/quant-metrics.ts apps/company-map/src/lib/stocks/quant-metrics.test.ts
git commit -m "feat(company-map): quant metric pure functions (ROE, 52w position, bond-dividend, Seo Junsik)"
```

---

### Task 3: 기존 ROE 로직을 resolveRoe로 통일

**Files:**
- Modify: `apps/company-map/src/app/stocks/[code]/StockDetailHeader.tsx:15-23` (로컬 함수 제거)
- Modify: `apps/company-map/src/app/stocks/StocksExplorerClient.tsx:598-603` (인라인 계산 교체)

- [ ] **Step 1: StockDetailHeader의 로컬 effectiveRoePct 제거 후 import로 교체**

`StockDetailHeader.tsx` 상단 import에 추가:

```typescript
import { resolveRoe } from "@/lib/stocks/quant-metrics";
```

`function effectiveRoePct(...) {...}` 블록(15~23행) 전체 삭제 후, 본문의 호출을 교체:

```typescript
  const roe = resolveRoe(manualRoe, per, pbr);
```

- [ ] **Step 2: StocksExplorerClient의 인라인 autoRoe 계산 교체**

`StocksExplorerClient.tsx` 상단 import에 추가 (파일은 `"use client"`지만 resolveRoe는 순수 함수라 문제 없음):

```typescript
import { resolveRoe } from "@/lib/stocks/quant-metrics";
```

599행 부근의 기존 코드:

```typescript
                  {(() => {
                    const autoRoe =
                      r.per != null && r.pbr != null && r.per > 0 && r.pbr > 0
                        ? (r.pbr / r.per) * 100
                        : null;
```

다음으로 교체 (manualRoe는 RoeCell이 우선 처리하므로 여기선 auto 부분만 — `resolveRoe(null, …)` 호출):

```typescript
                  {(() => {
                    const autoRoe = resolveRoe(null, r.per, r.pbr);
```

- [ ] **Step 3: 타입·테스트 확인**

Run: `cd apps/company-map && npx tsc --noEmit && cd ../.. && yarn workspace company-map test`
Expected: tsc 에러 0, 기존 테스트 전체 PASS

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/src/app/stocks/\[code\]/StockDetailHeader.tsx apps/company-map/src/app/stocks/StocksExplorerClient.tsx
git commit -m "refactor(company-map): unify ROE calculation via resolveRoe"
```

---

### Task 4: 52주 고저 수집 (week52.ts, TDD)

**Files:**
- Modify: `apps/company-map/src/lib/stocks/price-history.ts:33` (`toYyyymmdd`에 export 추가)
- Create: `apps/company-map/src/lib/stocks/week52.ts`
- Test: `apps/company-map/src/lib/stocks/week52.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 (순수 파서 대상)**

네이버 `siseJson` 응답은 작은따옴표 JS 배열 텍스트이고, 컬럼은 `[날짜, 시가, 고가, 저가, 종가, 거래량, 외국인소진율]`이다 (기존 `fetchPriceChange3M`이 종가=index 4를 쓰는 것과 동일한 형식).

```typescript
import { describe, it, expect } from "vitest";
import { parseWeek52 } from "./week52";

const FIXTURE = `[['날짜', '시가', '고가', '저가', '종가', '거래량', '외국인소진율'],
['20250611', 70000, 71500, 69000, 70500, 1000, 30.1],
['20250912', 80000, 88200, 79500, 87000, 2000, 30.5],
['20260203', 60000, 61000, 58000, 60500, 1500, 29.8],
['20260610', 72000, 73500, 71800, 72900, 1200, 30.0]]`;

describe("parseWeek52", () => {
  it("1년 일봉에서 고가 최대·저가 최소·마지막 일자를 추출한다", () => {
    const r = parseWeek52(FIXTURE);
    expect(r).not.toBeNull();
    expect(r!.high).toBe(88200);
    expect(r!.low).toBe(58000);
    expect(r!.asOfDate.toISOString().slice(0, 10)).toBe("2026-06-10");
  });

  it("헤더만 있거나 빈 응답이면 null", () => {
    expect(parseWeek52("[['날짜','시가','고가','저가','종가','거래량','외국인소진율']]")).toBeNull();
    expect(parseWeek52("")).toBeNull();
    expect(parseWeek52("not json")).toBeNull();
  });

  it("숫자가 아닌 행은 건너뛴다", () => {
    const r = parseWeek52(
      `[['날짜','시가','고가','저가','종가','거래량','외국인소진율'],
['20260101', null, null, null, null, 0, 0],
['20260610', 72000, 73500, 71800, 72900, 1200, 30.0]]`,
    );
    expect(r!.high).toBe(73500);
    expect(r!.low).toBe(71800);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/stocks/week52.test.ts`
Expected: FAIL — "Failed to resolve import ./week52"

- [ ] **Step 3: price-history.ts의 toYyyymmdd를 export로 변경**

33행의 `function toYyyymmdd(d: Date): string {` 을 `export function toYyyymmdd(d: Date): string {` 으로 변경. 다른 수정 없음.

- [ ] **Step 4: week52.ts 구현**

```typescript
import { db } from "@/lib/db";
import { isFresh } from "./quant-metrics";
import { toYyyymmdd } from "./price-history";

const API = "https://api.finance.naver.com/siseJson.naver";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface Week52Range {
  high: number;
  low: number;
  asOfDate: Date;
}

/** siseJson 텍스트(작은따옴표 JS 배열)에서 52주 고가/저가/기준일 추출. */
export function parseWeek52(text: string): Week52Range | null {
  let rows: unknown[];
  try {
    rows = JSON.parse(text.replace(/'/g, '"'));
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length < 2) return null;

  const dataRows = (rows.slice(1) as unknown[][]).filter(
    (r) => Array.isArray(r) && /^\d{8}$/.test(String(r[0])),
  );
  if (dataRows.length === 0) return null;

  let high = -Infinity;
  let low = Infinity;
  for (const r of dataRows) {
    const h = Number(r[2]);
    const l = Number(r[3]);
    if (Number.isFinite(h) && h > 0 && h > high) high = h;
    if (Number.isFinite(l) && l > 0 && l < low) low = l;
  }
  if (high <= 0 || low === Infinity) return null;

  const last = String(dataRows[dataRows.length - 1][0]);
  const asOfDate = new Date(
    `${last.slice(0, 4)}-${last.slice(4, 6)}-${last.slice(6, 8)}T00:00:00Z`,
  );
  return { high, low, asOfDate };
}

/** 네이버 일별 시세 1년 범위 조회 → 52주 고저. 실패 시 null. */
export async function fetchWeek52Range(code: string): Promise<Week52Range | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const now = new Date();
  const past = new Date(now);
  past.setFullYear(past.getFullYear() - 1);

  const qs = new URLSearchParams({
    symbol: code,
    requestType: "1",
    startTime: toYyyymmdd(past),
    endTime: toYyyymmdd(now),
    timeframe: "day",
  });

  const res = await fetch(`${API}?${qs.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return parseWeek52(await res.text());
}

/** 24h TTL 캐시. 미스 시 fetch 후 upsert, fetch 실패 시 stale 레코드 폴백. */
export async function getWeek52Price(code: string) {
  const cached = await db.week52Price.findUnique({ where: { code } });
  if (cached && isFresh(cached.fetchedAt, new Date(), TTL_MS)) return cached;

  try {
    const fresh = await fetchWeek52Range(code);
    if (fresh) {
      return await db.week52Price.upsert({
        where: { code },
        create: { code, ...fresh },
        update: { ...fresh, fetchedAt: new Date() },
      });
    }
  } catch {
    // 네트워크 실패 → stale 폴백
  }
  return cached;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/stocks/week52.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/company-map/src/lib/stocks/week52.ts apps/company-map/src/lib/stocks/week52.test.ts apps/company-map/src/lib/stocks/price-history.ts
git commit -m "feat(company-map): 52-week high/low fetcher with 24h cache"
```

---

### Task 5: 국채금리 (rates/ecos.ts, TDD)

**Files:**
- Create: `apps/company-map/src/lib/rates/ecos.ts`
- Test: `apps/company-map/src/lib/rates/ecos.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 (순수 파서 대상)**

ECOS `StatisticSearch` 응답 형식: `{ StatisticSearch: { row: [{ TIME, DATA_VALUE, ... }] } }`. row는 날짜 오름차순이므로 마지막 행이 최신.

```typescript
import { describe, it, expect } from "vitest";
import { parseEcosYield } from "./ecos";

describe("parseEcosYield", () => {
  it("마지막 행의 DATA_VALUE를 숫자로 반환", () => {
    const json = {
      StatisticSearch: {
        row: [
          { TIME: "20260608", DATA_VALUE: "3.65" },
          { TIME: "20260609", DATA_VALUE: "3.72" },
        ],
      },
    };
    expect(parseEcosYield(json)).toBeCloseTo(3.72);
  });

  it("row가 없거나 비어 있으면 null", () => {
    expect(parseEcosYield({})).toBeNull();
    expect(parseEcosYield({ StatisticSearch: { row: [] } })).toBeNull();
    expect(parseEcosYield(null)).toBeNull();
  });

  it("DATA_VALUE가 숫자가 아니거나 0 이하면 null", () => {
    expect(
      parseEcosYield({ StatisticSearch: { row: [{ DATA_VALUE: "abc" }] } }),
    ).toBeNull();
    expect(
      parseEcosYield({ StatisticSearch: { row: [{ DATA_VALUE: "0" }] } }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/rates/ecos.test.ts`
Expected: FAIL — "Failed to resolve import ./ecos"

- [ ] **Step 3: 구현 작성**

```typescript
import { db } from "@/lib/db";
import { isFresh } from "@/lib/stocks/quant-metrics";
import { toYyyymmdd } from "@/lib/stocks/price-history";

const BASE = "https://ecos.bok.or.kr/api/StatisticSearch";
// 시장금리(일별) 통계표. 항목 기본값은 국고채(10년) — Step 5에서 실호출로 검증.
const STAT_CODE = process.env.ECOS_TREASURY_STAT_CODE ?? "817Y002";
const ITEM_CODE = process.env.ECOS_TREASURY_ITEM_CODE ?? "010210000";
const RATE_KIND = "treasury_10y";
const TTL_MS = 24 * 60 * 60 * 1000;

/** ECOS StatisticSearch 응답에서 최신 수익률(%) 추출. */
export function parseEcosYield(data: unknown): number | null {
  const rows = (
    data as {
      StatisticSearch?: { row?: Array<{ DATA_VALUE?: string }> };
    } | null
  )?.StatisticSearch?.row;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const v = Number(rows[rows.length - 1]?.DATA_VALUE);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** ECOS에서 최근 14일 구간의 국고채 수익률 조회. 키 미설정·실패 시 null. */
export async function fetchTreasuryYield(): Promise<number | null> {
  const key = process.env.ECOS_API_KEY;
  if (!key) return null;

  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 14);
  const url = `${BASE}/${key}/json/kr/1/100/${STAT_CODE}/D/${toYyyymmdd(past)}/${toYyyymmdd(now)}/${ITEM_CODE}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  return parseEcosYield(data);
}

/** 24h TTL 캐시(MarketRate). 미스 시 fetch 후 upsert, 실패 시 stale 폴백. */
export async function getTreasuryYield(): Promise<number | null> {
  const cached = await db.marketRate.findUnique({ where: { kind: RATE_KIND } });
  if (cached && isFresh(cached.fetchedAt, new Date(), TTL_MS)) {
    return cached.ratePct;
  }

  try {
    const fresh = await fetchTreasuryYield();
    if (fresh != null) {
      await db.marketRate.upsert({
        where: { kind: RATE_KIND },
        create: { kind: RATE_KIND, ratePct: fresh },
        update: { ratePct: fresh, fetchedAt: new Date() },
      });
      return fresh;
    }
  } catch {
    // 네트워크 실패 → stale 폴백
  }
  return cached?.ratePct ?? null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/rates/ecos.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: ECOS 항목코드 실호출 검증 (키가 있을 때만)**

`apps/company-map/.env`에 `ECOS_API_KEY`가 설정돼 있으면:

```bash
source apps/company-map/.env 2>/dev/null; curl -s "https://ecos.bok.or.kr/api/StatisticSearch/${ECOS_API_KEY}/json/kr/1/5/817Y002/D/20260601/20260610/010210000" | head -c 600
```

Expected: `ITEM_NAME1`이 "국고채(10년)"인 row 반환. 다른 항목이 나오면 같은 통계표의 항목 목록을 조회해(`StatisticItemList/.../817Y002`) 국고채(10년) 코드를 찾아 `ITEM_CODE` 기본값을 수정한다.
키가 없으면 이 단계는 건너뛰고 작업 보고에 "ECOS_API_KEY 발급·설정 필요 (https://ecos.bok.or.kr 회원가입 → 인증키 발급)"를 명시한다. 키가 없어도 대시보드는 국채 관련 2개 항목만 "—"로 표시되고 정상 동작한다.

- [ ] **Step 6: Commit**

```bash
git add apps/company-map/src/lib/rates
git commit -m "feat(company-map): ECOS treasury yield fetcher with 24h cache"
```

---

### Task 6: GaugeChart 클라이언트 컴포넌트

**Files:**
- Create: `apps/company-map/src/app/stocks/[code]/GaugeChart.tsx`

- [ ] **Step 1: 컴포넌트 작성**

recharts `PieChart` 반원(startAngle 180→0). 값은 min~max로 정규화해 클램프하되 표기는 실제 값.

```tsx
"use client";

import { PieChart, Pie, Cell } from "recharts";

interface Props {
  /** 실제 값 (null이면 빈 게이지 + "—") */
  value: number | null;
  min: number;
  max: number;
  /** 중앙에 표시할 포맷된 값 텍스트 (예: "21.97%", "1.23x") */
  display: string;
  /** Tailwind가 아닌 실제 색상값 (SVG fill용) */
  color: string;
  /** 좌측 하단 보조 텍스트 (예: "저가: 58,000") */
  subLeft?: string;
  /** 우측 하단 보조 텍스트 (예: "고가: 88,200") */
  subRight?: string;
}

export function GaugeChart({
  value,
  min,
  max,
  display,
  color,
  subLeft,
  subRight,
}: Props) {
  const ratio =
    value == null ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const data = [{ v: ratio }, { v: 1 - ratio }];

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[120px] w-[220px]">
        <PieChart width={220} height={120}>
          <Pie
            data={data}
            dataKey="v"
            startAngle={180}
            endAngle={0}
            cx="50%"
            cy="100%"
            innerRadius={72}
            outerRadius={86}
            stroke="none"
            cornerRadius={6}
            isAnimationActive={false}
          >
            <Cell fill={color} />
            <Cell fill="rgba(128, 128, 128, 0.18)" />
          </Pie>
        </PieChart>
        <div className="absolute inset-x-0 bottom-1 text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
          {value != null ? display : "—"}
        </div>
        <div className="absolute bottom-1 left-0 text-[10px] text-gray-400">
          {min}
        </div>
        <div className="absolute bottom-1 right-0 text-[10px] text-gray-400">
          {max}
        </div>
      </div>
      {(subLeft || subRight) && (
        <div className="mt-1 flex w-full justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{subLeft}</span>
          <span>{subRight}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입 확인**

Run: `cd apps/company-map && npx tsc --noEmit`
Expected: 에러 0

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/src/app/stocks/\[code\]/GaugeChart.tsx
git commit -m "feat(company-map): semi-circle gauge chart component"
```

---

### Task 7: QuantDashboard 섹션 + page.tsx 연결 + SectionNav

**Files:**
- Create: `apps/company-map/src/app/stocks/[code]/QuantDashboard.tsx`
- Modify: `apps/company-map/src/app/stocks/[code]/page.tsx` (import, 병렬 조회, 렌더 위치)
- Modify: `apps/company-map/src/app/stocks/[code]/SectionNav.tsx:11-21` (ITEMS에 항목 추가)

- [ ] **Step 1: QuantDashboard.tsx 작성 (서버 컴포넌트)**

```tsx
import { formatMarcap } from "@/lib/format-marcap";
import {
  resolveRoe,
  week52Position,
  bondDividendRatio,
  seoJunsikReturn,
  reprtLabel,
} from "@/lib/stocks/quant-metrics";
import { GaugeChart } from "./GaugeChart";

interface Props {
  currentPrice: number | null;
  marcap: number | null;
  per: number | null;
  pbr: number | null;
  manualRoe: number | null;
  dividendYield: number | null;
  week52: { low: number; high: number; asOfDate: Date } | null;
  treasuryYieldPct: number | null;
  yoy: { pct: number | null; year: number; reprtCode: string } | null;
}

function StatCard({
  title,
  value,
  sub,
  accent = false,
}: {
  title: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-4 dark:bg-gray-900 ${
        accent
          ? "border-emerald-400 dark:border-emerald-600"
          : "border-gray-200 dark:border-gray-700"
      }`}
    >
      <div className="text-xs text-gray-500 dark:text-gray-400">{title}</div>
      <div className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</div>
      )}
    </div>
  );
}

const fmt = (v: number | null, digits = 2, suffix = "") =>
  v != null ? `${v.toFixed(digits)}${suffix}` : "—";

export function QuantDashboard({
  currentPrice,
  marcap,
  per,
  pbr,
  manualRoe,
  dividendYield,
  week52,
  treasuryYieldPct,
  yoy,
}: Props) {
  const roe = resolveRoe(manualRoe, per, pbr);
  const position = week52Position(
    currentPrice,
    week52?.low ?? null,
    week52?.high ?? null,
  );
  const bondDiv = bondDividendRatio(dividendYield, treasuryYieldPct);
  const seo = seoJunsikReturn(pbr, roe);
  const seoVsBond =
    seo != null && treasuryYieldPct != null && treasuryYieldPct > 0
      ? seo / treasuryYieldPct
      : null;

  return (
    <section id="dashboard" className="space-y-4">
      <h2 className="text-lg font-bold">퀀트 대시보드</h2>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          title="기준가"
          value={currentPrice != null ? `${currentPrice.toLocaleString()}원` : "—"}
        />
        <StatCard title="시가총액" value={formatMarcap(marcap)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm font-semibold">
            52주 저가 대비 위치{" "}
            {week52 && (
              <span className="text-xs font-normal text-gray-400">
                ({week52.asOfDate.toISOString().slice(0, 10)})
              </span>
            )}
          </div>
          <GaugeChart
            value={position}
            min={0}
            max={100}
            display={fmt(position, 1, "%")}
            color="#8b5cf6"
            subLeft={week52 ? `저가: ${week52.low.toLocaleString()}` : undefined}
            subRight={week52 ? `고가: ${week52.high.toLocaleString()}` : undefined}
          />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm font-semibold">ROE (자기자본이익률)</div>
          <GaugeChart
            value={roe}
            min={-10}
            max={40}
            display={fmt(roe, 2, "%")}
            color="#34d399"
          />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm font-semibold">PBR (주가순자산비율)</div>
          <GaugeChart
            value={pbr}
            min={0}
            max={3}
            display={fmt(pbr, 2, "x")}
            color="#f59e0b"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="예상 시가배당률" value={fmt(dividendYield, 2, "%")} />
        <StatCard
          title="국채시가배당률"
          value={fmt(bondDiv, 2, "배")}
          sub={treasuryYieldPct != null ? `국채금리 ${treasuryYieldPct}%` : "국채금리 미설정"}
        />
        <StatCard
          title={
            yoy
              ? `YoY (순이익, ${yoy.year}.${reprtLabel(yoy.reprtCode)})`
              : "YoY (순이익)"
          }
          value={fmt(yoy?.pct ?? null, 1, "%")}
        />
        <StatCard
          title="서준식 지수 (기대수익률)"
          value={fmt(seo, 2, "%")}
          sub={seoVsBond != null ? `국채금리 대비 ${seoVsBond.toFixed(2)}배` : undefined}
          accent={seoVsBond != null && seoVsBond >= 2}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: page.tsx 수정 — import 추가**

`apps/company-map/src/app/stocks/[code]/page.tsx` 상단 import 블록에 추가:

```typescript
import { QuantDashboard } from "./QuantDashboard";
import { getWeek52Price } from "@/lib/stocks/week52";
import { getTreasuryYield } from "@/lib/rates/ecos";
```

- [ ] **Step 3: page.tsx 수정 — master 조회에 financialSnapshot 포함**

기존:

```typescript
  const master = await db.stockMaster.findUnique({
    where: { code },
    include: { analysis: true, priceChange: true, override: true },
  });
```

교체:

```typescript
  const master = await db.stockMaster.findUnique({
    where: { code },
    include: {
      analysis: true,
      priceChange: true,
      override: true,
      financialSnapshot: true,
    },
  });
```

- [ ] **Step 4: page.tsx 수정 — 외부 데이터 병렬 조회**

`if (!master) notFound();` 바로 다음 줄에 추가:

```typescript
  const [week52, treasuryYieldPct] = await Promise.all([
    getWeek52Price(code),
    getTreasuryYield(),
  ]);
```

- [ ] **Step 5: page.tsx 수정 — 렌더 위치**

`<StockDetailHeader …/>` 닫는 태그와 `<RelatedLinksCard …/>` 사이에 추가:

```tsx
          <QuantDashboard
            currentPrice={
              master.priceChange?.currentPrice ?? master.analysis?.currentPrice ?? null
            }
            marcap={
              master.priceChange?.marcap != null
                ? Number(master.priceChange.marcap)
                : master.marcap != null
                  ? Number(master.marcap)
                  : null
            }
            per={master.analysis?.per ?? null}
            pbr={master.analysis?.pbr ?? null}
            manualRoe={master.override?.manualRoe ?? null}
            dividendYield={master.analysis?.dividendYield ?? null}
            week52={
              week52
                ? { low: week52.low, high: week52.high, asOfDate: week52.asOfDate }
                : null
            }
            treasuryYieldPct={treasuryYieldPct}
            yoy={
              master.financialSnapshot
                ? {
                    pct: master.financialSnapshot.netIncomeYoyPct,
                    year: master.financialSnapshot.latestBsnsYear,
                    reprtCode: master.financialSnapshot.latestReprtCode,
                  }
                : null
            }
          />
```

- [ ] **Step 6: SectionNav ITEMS 맨 앞에 대시보드 항목 추가**

`SectionNav.tsx`의 `const ITEMS: Item[] = [` 첫 항목으로 추가:

```typescript
  { id: "dashboard", label: "대시보드", dotClass: "bg-sky-500" },
```

- [ ] **Step 7: 타입 확인**

Run: `cd apps/company-map && npx tsc --noEmit`
Expected: 에러 0

- [ ] **Step 8: Commit**

```bash
git add apps/company-map/src/app/stocks/\[code\]
git commit -m "feat(company-map): quant dashboard section on stock detail page"
```

---

### Task 8: 통합 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트**

Run: `yarn workspace company-map test`
Expected: 기존 + 신규(quant-metrics 18, week52 3, ecos 3) 전체 PASS

- [ ] **Step 2: 린트**

Run: `yarn workspace company-map lint`
Expected: 신규/수정 파일에 에러 0 (기존 파일의 기존 에러는 무시)

- [ ] **Step 3: 실제 페이지 확인**

dev 서버가 3004에서 실행 중인지 확인(`lsof -nP -iTCP:3004 -sTCP:LISTEN`), 없으면 `yarn workspace company-map dev`를 백그라운드로 시작 후:

Run: `curl -s http://localhost:3004/stocks/383220 | grep -o "퀀트 대시보드\|서준식 지수\|52주 저가 대비 위치" | sort -u`
Expected: 세 문자열 모두 출력. 이어서 브라우저에서 게이지 렌더·다크 모드·"—" 폴백(ECOS 키 없는 경우) 수동 확인.

- [ ] **Step 4: 마지막 Commit (잔여 변경이 있으면)**

```bash
git status --short
```

Expected: 계획 외 변경 없음. 있으면 원인 확인 후 정리.

---

## 자기 검증 노트 (작성 시 확인 완료)

- 스펙 10개 표시 항목 ↔ Task 7 QuantDashboard에 모두 존재 (기준가·시총·게이지3·세부4+보조줄)
- `resolveRoe`/`isFresh`/`toYyyymmdd` 시그니처가 Task 2·4·5·7에서 일관됨
- `Week52Price`/`MarketRate` 필드명이 Task 1 스키마 ↔ Task 4·5 코드에서 일치 (`asOfDate`, `ratePct`, `fetchedAt`)
- ECOS 키 미설정 시 동작: `fetchTreasuryYield`가 null → 캐시 폴백 → 카드 "—" (스펙 7절 충족)
