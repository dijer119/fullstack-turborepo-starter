# 3개월 주가변동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks` 표에 종목별 3개월 등락률 컬럼을 추가하고, 네이버 일별 시세 단일 호출로 데이터를 수집한다. RefreshMenu에 수동 트리거 + worker가 매일 18시 KST 이후 1회 자동 갱신.

**Architecture:** 신규 `PriceChange` 1:1 모델 + `refreshPriceChanges()` 함수가 자체적으로 RefreshState upsert. wrapper(`run-refresh-job.ts`)와 worker(`price-change-loop.ts`)가 동일 함수 호출. worker는 5분 간격 wake → `shouldRunNow()` 체크 (오늘 18시 이후 & finishedAt이 오늘 18시 이전).

**Tech Stack:** Next.js 16, Prisma 6 + SQLite, vitest 4, 네이버 비공식 일별 시세 API.

**Spec:** `docs/superpowers/specs/2026-05-23-price-change-3m-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` | `PriceChange` 모델 + `StockMaster.priceChange` relation |
| `src/lib/stocks/price-history.ts` | 네이버 fetcher `fetchPriceChange3M(code)` (단일 호출 → 3개월 전·현재 종가 + 등락률) |
| `src/lib/stocks/price-history.test.ts` | 네이버 응답 파싱 단위 테스트 |
| `tests/fixtures/naver-sise-3m.json` | 네이버 일별 시세 응답 fixture |
| `src/lib/stocks/refresh-price-changes.ts` | `refreshPriceChanges()` integration — 전종목 loop + RefreshState upsert |
| `scripts/refresh-price-changes.ts` | thin IIFE — `refreshPriceChanges()` 호출 |
| `worker/price-change-loop.ts` | 5분 간격 + 18시 KST 스케줄 |
| `worker/index.ts` | `priceChangeLoop()` 등록 |
| `scripts/run-refresh-job.ts` | kind `"price_changes"` 매핑 추가 |
| `src/actions/refresh-jobs.ts` | `RefreshKind` union 확장 |
| `src/actions/stocks-explorer.ts` | `pctChange3M` 필드 + include |
| `src/app/stocks/StocksExplorerClient.tsx` | "3M" 컬럼 (colSpan 11→12) |
| `src/app/stocks/RefreshMenu.tsx` | LABELS에 price_changes 추가 |

---

## Task 1: Prisma `PriceChange` 모델 + 마이그레이션

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma`
- Generated: `apps/company-map/prisma/migrations/<ts>_add_price_change/`

- [ ] **Step 1: relation 추가**

`StockMaster` 모델 안 relation 블록에 한 줄 추가 (마지막 relation 다음):
```prisma
  priceChange           PriceChange?
```

- [ ] **Step 2: 모델 추가**

`schema.prisma` 끝에:
```prisma
model PriceChange {
  code         String   @id
  currentPrice Float?   @map("current_price")
  pastPrice    Float?   @map("past_price")
  pastDate     DateTime? @map("past_date")
  pctChange    Float?   @map("pct_change")
  fetchedAt    DateTime @default(now()) @map("fetched_at")

  master  StockMaster @relation(fields: [code], references: [code], onDelete: Cascade)

  @@map("price_changes")
}
```

- [ ] **Step 3: 마이그레이션**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx prisma migrate dev --name add_price_change
cat prisma/migrations/*add_price_change*/migration.sql
sqlite3 data/company-map.db ".tables price_changes"
```
Expected: `CREATE TABLE "price_changes"` only, no ALTER on existing tables; sqlite shows the new table.

- [ ] **Step 4: tsc + tests**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0; 78 tests pass.

- [ ] **Step 5: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "$(cat <<'EOF'
feat(company-map): add PriceChange model for 3-month price tracking

1:1 with StockMaster, holds currentPrice, pastPrice (3M ago), pastDate,
pctChange. Cascade-deletes with the parent stock.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Naver fetcher `fetchPriceChange3M` (TDD)

**Files:**
- Create: `apps/company-map/tests/fixtures/naver-sise-3m.json`
- Create: `apps/company-map/src/lib/stocks/price-history.test.ts`
- Create: `apps/company-map/src/lib/stocks/price-history.ts`

- [ ] **Step 1: Fixture 작성**

`apps/company-map/tests/fixtures/naver-sise-3m.json`:

```json
[
  ["날짜","시가","고가","저가","종가","거래량","외국인소진율"],
  ["20260223",70000,71000,69500,70500,15000000,52.1],
  ["20260224",70500,71500,70000,71000,12000000,52.0],
  ["20260520",78000,79000,77500,78500,18000000,53.4],
  ["20260521",78500,79500,78000,79000,16000000,53.5]
]
```

(주의: 네이버 실제 응답은 single-quote 사용 — 우리 fetcher가 `replace(/'/g, '"')`로 변환. Fixture는 표준 JSON로 두고, 테스트에서 single-quote 시나리오는 별도 case로 검증.)

- [ ] **Step 2: 실패 테스트**

`apps/company-map/src/lib/stocks/price-history.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchPriceChange3M } from "./price-history";

const fixture = readFileSync(
  path.resolve(__dirname, "../../../tests/fixtures/naver-sise-3m.json"),
  "utf-8",
);

describe("fetchPriceChange3M", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses naver siseJson into current/past prices + pctChange", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => fixture,
    } as Response);

    const r = await fetchPriceChange3M("005930");
    expect(r).not.toBeNull();
    expect(r!.currentPrice).toBe(79000);
    expect(r!.pastPrice).toBe(70500);
    expect(r!.pctChange).toBeCloseTo(((79000 - 70500) / 70500) * 100, 5);
    expect(r!.pastDate.toISOString().slice(0, 10)).toBe("2026-02-23");
  });

  it("parses single-quote-style JSON (naver actual response)", async () => {
    const single = fixture.replace(/"/g, "'");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => single,
    } as Response);
    const r = await fetchPriceChange3M("005930");
    expect(r).not.toBeNull();
    expect(r!.currentPrice).toBe(79000);
  });

  it("returns null when response is empty array", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "[]",
    } as Response);
    expect(await fetchPriceChange3M("005930")).toBeNull();
  });

  it("returns null when only header row present", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '[["날짜","시가","고가","저가","종가","거래량","외국인소진율"]]',
    } as Response);
    expect(await fetchPriceChange3M("005930")).toBeNull();
  });

  it("returns null when http status not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "",
    } as Response);
    expect(await fetchPriceChange3M("005930")).toBeNull();
  });

  it("returns null when stockCode shape invalid", async () => {
    expect(await fetchPriceChange3M("ABC")).toBeNull();
  });

  it("returns null when pastPrice is 0 (would divide by zero)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '[["날짜","시가","고가","저가","종가","거래량","외국인소진율"],["20260223",0,0,0,0,0,0],["20260521",100,100,100,100,0,0]]',
    } as Response);
    expect(await fetchPriceChange3M("005930")).toBeNull();
  });
});
```

- [ ] **Step 3: Failure**
```bash
cd apps/company-map
npx vitest run src/lib/stocks/price-history.test.ts
```
Expected: FAIL — `Cannot find module './price-history'`.

- [ ] **Step 4: 구현**

`apps/company-map/src/lib/stocks/price-history.ts`:

```ts
const API = "https://api.finance.naver.com/siseJson.naver";

export interface PriceChange3M {
  currentPrice: number;
  pastPrice: number;
  pastDate: Date;
  pctChange: number;
}

function toYyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** 네이버 일별 시세에서 3개월 전 종가와 현재 종가 추출. */
export async function fetchPriceChange3M(code: string): Promise<PriceChange3M | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const now = new Date();
  const past = new Date(now);
  past.setMonth(past.getMonth() - 3);

  const qs = new URLSearchParams({
    symbol: code,
    requestType: "1",
    startTime: toYyyymmdd(past),
    endTime: toYyyymmdd(now),
    timeframe: "day",
  });

  const res = await fetch(`${API}?${qs.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  const text = await res.text();

  let rows: unknown[];
  try {
    rows = JSON.parse(text.replace(/'/g, '"'));
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length < 2) return null;

  const dataRows = rows.slice(1) as unknown[][];
  if (dataRows.length === 0) return null;
  const firstRow = dataRows[0];
  const lastRow = dataRows[dataRows.length - 1];

  const pastPrice = Number(firstRow[4]);
  const currentPrice = Number(lastRow[4]);
  if (!Number.isFinite(pastPrice) || !Number.isFinite(currentPrice) || pastPrice === 0) {
    return null;
  }

  const pastDateStr = String(firstRow[0]);
  if (!/^\d{8}$/.test(pastDateStr)) return null;
  const pastDate = new Date(
    `${pastDateStr.slice(0, 4)}-${pastDateStr.slice(4, 6)}-${pastDateStr.slice(6, 8)}T00:00:00Z`,
  );

  return {
    currentPrice,
    pastPrice,
    pastDate,
    pctChange: ((currentPrice - pastPrice) / pastPrice) * 100,
  };
}
```

- [ ] **Step 5: Tests pass**
```bash
npx vitest run src/lib/stocks/price-history.test.ts
npx vitest run
npx tsc --noEmit
```
Expected: 7 tests pass for this file; 85 total tests pass; tsc EXIT=0.

- [ ] **Step 6: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/lib/stocks/price-history.ts \
        apps/company-map/src/lib/stocks/price-history.test.ts \
        apps/company-map/tests/fixtures/naver-sise-3m.json
git commit -m "$(cat <<'EOF'
feat(company-map): add Naver fetchPriceChange3M (single-call 3M data)

Naver siseJson.naver returns single-quote JSON; we normalize to standard
JSON before parsing. Single network call yields first/last close + date,
guarding against empty / header-only / past=0 cases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `refreshPriceChanges()` integration

**Files:**
- Create: `apps/company-map/src/lib/stocks/refresh-price-changes.ts`

- [ ] **Step 1: 파일 작성**

`apps/company-map/src/lib/stocks/refresh-price-changes.ts`:

```ts
import { db } from "../../../worker/db";
import { fetchPriceChange3M } from "./price-history";

const KIND = "price_changes";
const CALL_DELAY_MS = 100;

export interface RefreshPriceChangesResult {
  total: number;
  upserted: number;
  skipped: number;
  failed: number;
}

export async function refreshPriceChanges(): Promise<RefreshPriceChangesResult> {
  const startedAt = new Date();
  await db.refreshState.upsert({
    where: { kind: KIND },
    create: { kind: KIND, status: "running", startedAt },
    update: { status: "running", startedAt, finishedAt: null, output: null },
  });

  const masters = await db.stockMaster.findMany({ select: { code: true } });
  const total = masters.length;
  let upserted = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < masters.length; i++) {
    const code = masters[i].code;
    try {
      const r = await fetchPriceChange3M(code);
      await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
      if (!r) {
        skipped++;
        continue;
      }
      await db.priceChange.upsert({
        where: { code },
        create: {
          code,
          currentPrice: r.currentPrice,
          pastPrice: r.pastPrice,
          pastDate: r.pastDate,
          pctChange: r.pctChange,
        },
        update: {
          currentPrice: r.currentPrice,
          pastPrice: r.pastPrice,
          pastDate: r.pastDate,
          pctChange: r.pctChange,
          fetchedAt: new Date(),
        },
      });
      upserted++;
    } catch (e) {
      failed++;
      if (failures.length < 5) failures.push(`${code}: ${String(e).slice(0, 100)}`);
    }
    if ((i + 1) % 200 === 0) {
      console.log(
        `[price-change] progress ${i + 1}/${total} (upserted=${upserted}, skipped=${skipped}, failed=${failed})`,
      );
    }
  }

  const outputLine = `total=${total} upserted=${upserted} skipped=${skipped} failed=${failed}`;
  const output =
    failed > 0 ? `${outputLine}\nsample failures:\n${failures.join("\n")}` : outputLine;
  await db.refreshState.update({
    where: { kind: KIND },
    data: {
      status: "done",
      finishedAt: new Date(),
      output: output.slice(-2000),
    },
  });

  return { total, upserted, skipped, failed };
}
```

비고: 함수는 worker db를 직접 사용 — 다른 server-only 경로(Server Action) 호출 없음. worker와 tsx 스크립트 양쪽에서 안전.

- [ ] **Step 2: tsc + tests**

```bash
cd apps/company-map
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0; 85 tests pass.

- [ ] **Step 3: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/lib/stocks/refresh-price-changes.ts
git commit -m "$(cat <<'EOF'
feat(company-map): add refreshPriceChanges integration (worker + wrapper)

Iterates every stock_master, calls fetchPriceChange3M with 100ms throttle,
upserts PriceChange, and writes RefreshState (running → done) so both
script and worker paths converge on the same status row.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Trigger 스크립트 + wrapper kind 등록

**Files:**
- Create: `apps/company-map/scripts/refresh-price-changes.ts`
- Modify: `apps/company-map/scripts/run-refresh-job.ts`

- [ ] **Step 1: 스크립트 작성**

`apps/company-map/scripts/refresh-price-changes.ts`:

```ts
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { refreshPriceChanges } from "@/lib/stocks/refresh-price-changes";

(async () => {
  const start = Date.now();
  const result = await refreshPriceChanges();
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`[price-change] done in ${elapsed}s`, result);
  process.exit(0);
})();
```

- [ ] **Step 2: wrapper SCRIPTS 매핑 + Kind union**

`apps/company-map/scripts/run-refresh-job.ts` 의 `Kind` type과 `SCRIPTS` 객체를 다음과 같이 수정:

```ts
type Kind = "krx_stocks" | "vip_holdings" | "operating_income" | "trade" | "price_changes";

const SCRIPTS: Record<Kind, string[]> = {
  krx_stocks: ["scripts/regenerate-krx-stocks.ts", "scripts/smoke-load-krx.ts"],
  vip_holdings: ["scripts/refresh-vip-holdings.ts"],
  operating_income: ["scripts/refresh-operating-income.ts"],
  trade: ["scripts/ingest-trade.ts"],
  price_changes: ["scripts/refresh-price-changes.ts"],
};
```

- [ ] **Step 3: tsc**

```bash
cd apps/company-map
npx tsc --noEmit
```
Expected: EXIT=0.

- [ ] **Step 4: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/scripts/refresh-price-changes.ts apps/company-map/scripts/run-refresh-job.ts
git commit -m "$(cat <<'EOF'
feat(company-map): wire price_changes into refresh wrapper

Adds the dedicated tsx script and maps the new kind in run-refresh-job
so the RefreshMenu dropdown can trigger it via the existing detached
spawn path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: worker loop + worker/index 등록

**Files:**
- Create: `apps/company-map/worker/price-change-loop.ts`
- Modify: `apps/company-map/worker/index.ts`

- [ ] **Step 1: loop 작성**

`apps/company-map/worker/price-change-loop.ts`:

```ts
import { db } from "./db";
import { refreshPriceChanges } from "@/lib/stocks/refresh-price-changes";

const KIND = "price_changes";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SCHEDULE_HOUR_KST = 18;

async function shouldRunNow(now: Date = new Date()): Promise<boolean> {
  const today6pm = new Date(now);
  today6pm.setHours(SCHEDULE_HOUR_KST, 0, 0, 0);
  if (now < today6pm) return false;
  const state = await db.refreshState.findUnique({ where: { kind: KIND } });
  if (!state?.finishedAt) return true;
  return state.finishedAt < today6pm;
}

export async function priceChangeLoop(): Promise<void> {
  console.log("[price-change-loop] starting (5min poll, schedule 18:00 KST)");
  while (true) {
    try {
      if (await shouldRunNow()) {
        console.log("[price-change-loop] running at", new Date().toISOString());
        await refreshPriceChanges();
      }
    } catch (e) {
      console.error("[price-change-loop] iteration failed:", e);
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  }
}
```

- [ ] **Step 2: worker/index에 등록**

`apps/company-map/worker/index.ts` 상단 import 영역에 추가:
```ts
import { priceChangeLoop } from "./price-change-loop";
```

`backgroundUpdate()`의 main entry point 옆에 fire-and-forget으로 시작 (`--once` 모드는 한 번만 실행).

기존 파일의 `if (process.argv.includes("--once")) { ... } else { backgroundUpdate(); }` 블록을 다음으로 교체:

```ts
if (process.argv.includes("--once")) {
  (async () => {
    await loadKrxStocks();
    await analyzeAllStocks({ shouldStop: () => false });
    await runNcavScreening();
    await tradeSyncTick();
    process.exit(0);
  })();
} else {
  backgroundUpdate();
  priceChangeLoop().catch((err) =>
    console.error("[worker] price-change loop crashed:", err),
  );
}
```

`--once` 모드에서는 price-change는 실행 안 함 (긴 작업이라 부적합). 정규 worker 실행 시에만.

- [ ] **Step 3: tsc**

```bash
cd apps/company-map
npx tsc --noEmit
```
Expected: EXIT=0.

- [ ] **Step 4: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/worker/price-change-loop.ts apps/company-map/worker/index.ts
git commit -m "$(cat <<'EOF'
feat(company-map): worker price-change loop (18:00 KST daily)

5-minute poll wakes the loop; runs refreshPriceChanges once per day
when current time is past today's 18:00 KST and RefreshState.finishedAt
predates that. Runs in parallel to the 2-min backgroundUpdate cycle so
neither blocks the other. --once mode skips it (~45min job not suitable
for one-shot runs).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Server Action — `RefreshKind` + `pctChange3M`

**Files:**
- Modify: `apps/company-map/src/actions/refresh-jobs.ts`
- Modify: `apps/company-map/src/actions/stocks-explorer.ts`

- [ ] **Step 1: refresh-jobs.ts — RefreshKind union**

```ts
export type RefreshKind = "krx_stocks" | "vip_holdings" | "operating_income" | "trade" | "price_changes";

const VALID_KINDS = new Set<RefreshKind>([
  "krx_stocks",
  "vip_holdings",
  "operating_income",
  "trade",
  "price_changes",
]);
```

다른 코드는 그대로.

- [ ] **Step 2: stocks-explorer.ts — Row 필드 추가**

`StocksExplorerRow` 끝에 추가 (tags 다음):
```ts
  pctChange3M: number | null;
```

- [ ] **Step 3: stocks-explorer.ts — include**

`include` 객체에 추가:
```ts
  priceChange: true,
```

전체 include는:
```ts
include: {
  analysis: true,
  vipHoldings: {
    orderBy: { rceptDt: "desc" },
    take: 1,
    select: { rceptDt: true },
  },
  _count: { select: { vipHoldings: true } },
  financialSnapshot: true,
  tags: { include: { tag: true } },
  priceChange: true,
},
```

- [ ] **Step 4: row 매핑**

`masters.map((m) => ({ ... }))` 안 끝에 (tags 다음):
```ts
  pctChange3M: m.priceChange?.pctChange ?? null,
```

- [ ] **Step 5: tsc + tests**

```bash
cd apps/company-map
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0; 85 tests pass.

- [ ] **Step 6: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/actions/refresh-jobs.ts apps/company-map/src/actions/stocks-explorer.ts
git commit -m "$(cat <<'EOF'
feat(company-map): expose pctChange3M + extend RefreshKind union

StocksExplorerRow now carries the 3-month pctChange from the PriceChange
relation. RefreshKind union and VALID_KINDS set both gain price_changes
so triggerRefresh accepts it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: UI — "3M" 컬럼 + RefreshMenu LABELS

**Files:**
- Modify: `apps/company-map/src/app/stocks/StocksExplorerClient.tsx`
- Modify: `apps/company-map/src/app/stocks/RefreshMenu.tsx`

- [ ] **Step 1: 표 헤더 추가**

`<th className="p-2 font-medium text-right">안전마진</th>` 다음에:
```tsx
<th className="p-2 font-medium text-right">3M</th>
```

- [ ] **Step 2: 표 셀 추가**

기존 safetyMargin `<td>` (`pct(r.safetyMargin)` 사용하는 td) 다음에 새 셀:
```tsx
<td
  className={`p-2 text-right ${
    r.pctChange3M == null
      ? "text-gray-400"
      : r.pctChange3M >= 0
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400"
  }`}
>
  {r.pctChange3M == null
    ? "—"
    : `${r.pctChange3M >= 0 ? "+" : ""}${r.pctChange3M.toFixed(1)}%`}
</td>
```

- [ ] **Step 3: colSpan 11 → 12**

`StocksExplorerClient.tsx`에 `colSpan={11}` 모든 occurrence를 `colSpan={12}`로 변경 (Edit replace_all).

- [ ] **Step 4: RefreshMenu LABELS**

`apps/company-map/src/app/stocks/RefreshMenu.tsx` 의 `LABELS` 객체에 추가:
```ts
const LABELS: Record<RefreshKind, { name: string; estimate: string }> = {
  krx_stocks: { name: "KRX 종목 마스터", estimate: "~2분" },
  vip_holdings: { name: "VIP 지분공시", estimate: "~6분" },
  operating_income: { name: "영업이익 시계열", estimate: "~60분" },
  trade: { name: "수출입 동향", estimate: "~3분" },
  price_changes: { name: "3개월 주가변동", estimate: "~45분" },
};
```

- [ ] **Step 5: tsc + lint + tests**

```bash
cd apps/company-map
npx tsc --noEmit
npx eslint src/app/stocks src/lib/stocks
npx vitest run
```
Expected: tsc EXIT=0; 85 tests pass; eslint clean (no new errors; existing AppMenu/WatchlistPanel warnings remain unrelated).

- [ ] **Step 6: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/app/stocks/StocksExplorerClient.tsx \
        apps/company-map/src/app/stocks/RefreshMenu.tsx
git commit -m "$(cat <<'EOF'
feat(company-map): render 3M column + RefreshMenu entry

New "3M" column right after 안전마진 shows "+12.3%" / "-8.7%" / "—"
with green/red/gray. RefreshMenu lists "3개월 주가변동 / ~45분".
colSpan 11 → 12 on empty/expand rows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 통합 검증

**Files:** 검증만 — 코드 변경 없음.

- [ ] **Step 1: dev 재시작 안내**

```
사용자 액션:
1) 기존 npm run dev 중지 (Ctrl+C)
2) cd apps/company-map && npm run dev 재실행
3) ready 메시지 확인
```

- [ ] **Step 2: 페이지 로드**

`http://localhost:3004/stocks` HTTP 200, 표에 "3M" 컬럼 노출 (모든 row "—" 상태 — 아직 데이터 없음).

- [ ] **Step 3: 단일 종목 fetch 검증**

probe로 005930 한 종목만 호출해 fetcher가 실 데이터에서 동작하는지 확인:

```bash
cd apps/company-map
cat > /tmp/probe-pc.ts <<'EOF'
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve("apps/company-map/.env.local") });
config({ path: path.resolve("apps/company-map/.env") });
import { fetchPriceChange3M } from "../src/lib/stocks/price-history";
fetchPriceChange3M("005930").then((r) => { console.log(r); process.exit(0); });
EOF
cp /tmp/probe-pc.ts scripts/_probe-pc.ts
npx tsx scripts/_probe-pc.ts
rm scripts/_probe-pc.ts
```
Expected: `{ currentPrice: <num>, pastPrice: <num>, pastDate: <Date>, pctChange: <num> }`.

만약 `null` → 네이버 응답 형식이 spec 가정과 다름. 응답 raw text를 출력해서 진단 필요.

- [ ] **Step 4: 수동 trigger (RefreshMenu)**

브라우저에서 헤더 `데이터 업데이트` → `3개월 주가변동` → [실행]. 즉시 "실행 중 (N초)" 표시. 30-60분 후 완료.

또는 시간을 줄이기 위해 wrapper를 직접 백그라운드 실행:
```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
nohup npx tsx scripts/run-refresh-job.ts price_changes > /tmp/pc.log 2>&1 &
tail -f /tmp/pc.log
```

- [ ] **Step 5: DB 검증**

```bash
sqlite3 data/company-map.db "SELECT COUNT(*) AS total, COUNT(pct_change) AS with_pct, MIN(pct_change), MAX(pct_change) FROM price_changes;"
sqlite3 data/company-map.db "SELECT code, current_price, past_price, ROUND(pct_change, 2) FROM price_changes WHERE code IN ('005930','000660','035420') ORDER BY code;"
sqlite3 data/company-map.db "SELECT kind, status, datetime(started_at/1000, 'unixepoch'), datetime(finished_at/1000, 'unixepoch') FROM refresh_states WHERE kind='price_changes';"
```
Expected: 수천 row, with_pct ≈ total, 대표 종목들에 합리적 등락률, RefreshState done.

- [ ] **Step 6: UI 확인**

`/stocks` 새로고침:
- 표 "3M" 컬럼에 등락률 노출
- 양수는 초록, 음수는 빨강, 데이터 없는 (시드 누락) 종목은 "—"

- [ ] **Step 7: worker 자동 스케줄 sanity (선택)**

worker가 떠 있다면 정상. 18시 지난 시각에 worker 로그 확인:
```
[price-change-loop] starting (5min poll, schedule 18:00 KST)
[price-change-loop] running at <ISO>   ← 오늘 첫 실행 시점
```
이미 RefreshState.finishedAt이 오늘 18시 이후라면 다음 18시까지 실행 안 함.

- [ ] **Step 8: 회귀**

다른 페이지 모두 정상:
```bash
for u in "stocks" "stocks?vip=1" "stocks?tags=1" "companies" "top-stocks" "ncav" "trade" "calculator"; do
  echo "/$u → $(curl -sS -o /dev/null -w "%{http_code}" http://localhost:3004/$u)"
done
```
Expected: 모두 200.

전체 테스트:
```bash
cd apps/company-map
npx vitest run
```
Expected: 85 tests pass.

검증만 — 별도 커밋 없음. plan 완료.

---

## Self-Review Notes

**Spec coverage:**
- `PriceChange` 모델 → Task 1 ✓
- 네이버 fetcher `fetchPriceChange3M` + 7 tests → Task 2 ✓
- `refreshPriceChanges()` + RefreshState upsert → Task 3 ✓
- Trigger 스크립트 + wrapper kind 매핑 → Task 4 ✓
- worker loop (5분 + 18시 KST 스케줄) + worker/index 등록 → Task 5 ✓
- Server Action `RefreshKind` 확장 + `pctChange3M` 필드 → Task 6 ✓
- UI "3M" 컬럼 + colSpan 12 + RefreshMenu LABELS → Task 7 ✓
- 통합 검증 (live fetch, 수동 trigger, DB, UI, 회귀) → Task 8 ✓

**Type consistency:**
- `RefreshKind = "krx_stocks" | "vip_holdings" | "operating_income" | "trade" | "price_changes"` — wrapper Kind, Server Action RefreshKind, RefreshMenu LABELS 모두 5개 케이스 ✓
- `PriceChange3M { currentPrice, pastPrice, pastDate, pctChange }` — fetcher 반환, refreshPriceChanges 사용 동일 ✓
- `StocksExplorerRow.pctChange3M: number | null` — Server Action 매핑, UI 셀 사용 동일 ✓
- `KIND = "price_changes"` 상수 — refreshPriceChanges와 price-change-loop 양쪽 동일 문자열 ✓
- `shouldRunNow()` — 함수 시그니처와 호출 일치, optional `now` param ✓

**Placeholder scan:** 없음. 각 step에 실제 코드/명령어/예상 출력 포함. `<ts>_add_price_change`는 Prisma 자동 생성.
