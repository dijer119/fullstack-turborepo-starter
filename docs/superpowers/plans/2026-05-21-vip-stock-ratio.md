# VIP 지분 증감 인라인 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `vip_holdings`에 보유 비율·증감·사유 컬럼을 추가하고, OpenDART `majorstock.json`에서 fetch한 데이터를 `refreshVipHoldings`에 통합해 expand row에 인라인 표시한다.

**Architecture:** 신규 `fetchMajorStockByCorp` fetcher가 corp_code별로 OpenDART API를 호출, `enrichVipHoldings`가 응답 rcept_no를 우리 vip_holdings rcpNo와 매칭해 update. 클라이언트는 `formatStockRatio` 헬퍼로 "5.12% (+0.34%p)" 형태 렌더링.

**Tech Stack:** Next.js 16, Prisma 6 + SQLite, vitest, lucide-react, Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-21-vip-stock-ratio-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` | `VipHolding`에 `stockRatio`, `stockRatioChange`, `reportResn` 컬럼 추가 |
| `src/lib/dart/major-stock.ts` | OpenDART `majorstock.json` fetcher (corp_code 단위) |
| `src/lib/dart/major-stock.test.ts` | fetcher 단위 테스트 (fixture 기반) |
| `tests/fixtures/dart-majorstock-sample.json` | 응답 fixture (정상 + "-" 케이스) |
| `src/lib/dart/vip-holdings.ts` | `enrichVipHoldings` 추가 + `refreshVipHoldings` 흐름 통합 |
| `src/lib/format-ratio.ts` | `formatStockRatio`, `ratioColorClass` 순수 함수 |
| `src/lib/format-ratio.test.ts` | 포맷 유틸 단위 테스트 |
| `src/actions/vip-holdings.ts` | `VipHoldingDetailRow`에 3개 필드 추가 |
| `src/app/stocks/StocksExplorerClient.tsx` | expand row `<li>`에 인라인 비율 셀 추가 |

---

## Task 1: Prisma 스키마 + 마이그레이션

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma`
- Generated: `apps/company-map/prisma/migrations/<ts>_add_vip_stock_ratio/`

- [ ] **Step 1: `VipHolding` 모델에 3개 컬럼 추가**

`apps/company-map/prisma/schema.prisma`의 `VipHolding` 모델을 다음과 같이 수정한다 (`rceptDt` 다음, `fetchedAt` 이전에 3개 컬럼 삽입):

```prisma
model VipHolding {
  rcpNo            String   @id @map("rcp_no")
  code             String?
  corpCode         String   @map("corp_code")
  corpName         String   @map("corp_name")
  reportNm         String   @map("report_nm")
  reportType       String   @map("report_type")
  flrNm            String   @map("flr_nm")
  rceptDt          DateTime @map("rcept_dt")
  stockRatio       Float?   @map("stock_ratio")
  stockRatioChange Float?   @map("stock_ratio_change")
  reportResn       String?  @map("report_resn")
  fetchedAt        DateTime @default(now()) @map("fetched_at")

  master           StockMaster? @relation(fields: [code], references: [code], onDelete: SetNull)

  @@index([code])
  @@index([rceptDt])
  @@map("vip_holdings")
}
```

- [ ] **Step 2: 마이그레이션 생성·적용**

Run:
```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx prisma migrate dev --name add_vip_stock_ratio
```

Expected output:
```
Applying migration `<timestamp>_add_vip_stock_ratio`
✔ Generated Prisma Client
```

- [ ] **Step 3: 마이그레이션 SQL 검증**

`prisma/migrations/<ts>_add_vip_stock_ratio/migration.sql`에는 다음만 있어야 한다:
```sql
ALTER TABLE "vip_holdings" ADD COLUMN "stock_ratio" REAL;
ALTER TABLE "vip_holdings" ADD COLUMN "stock_ratio_change" REAL;
ALTER TABLE "vip_holdings" ADD COLUMN "report_resn" TEXT;
```
다른 ALTER/DROP/INDEX 변경이 없어야 한다.

추가 검증:
```bash
sqlite3 data/company-map.db "PRAGMA table_info(vip_holdings);" | grep -E "stock_ratio|report_resn"
```
3줄 출력 (3개 새 컬럼).

- [ ] **Step 4: 기존 데이터 무손상 확인**

```bash
sqlite3 data/company-map.db "SELECT COUNT(*) FROM vip_holdings;"
```
Expected: `30` (이전 작업의 row 그대로). 새 컬럼은 모두 NULL.

- [ ] **Step 5: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "$(cat <<'EOF'
feat(company-map): add stock_ratio/stock_ratio_change/report_resn to VipHolding

Three nullable columns to capture OpenDART majorstock.json fields:
stkrt (보유 비율), stkrt_irds (증감), report_resn (사유).
EOF
)"
```

---

## Task 2: OpenDART majorstock.json fetcher (TDD)

**Files:**
- Create: `apps/company-map/tests/fixtures/dart-majorstock-sample.json`
- Create: `apps/company-map/src/lib/dart/major-stock.test.ts`
- Create: `apps/company-map/src/lib/dart/major-stock.ts`

- [ ] **Step 1: Fixture 생성**

`apps/company-map/tests/fixtures/dart-majorstock-sample.json`:

```json
{
  "status": "000",
  "message": "정상",
  "list": [
    {
      "rcept_no": "20260518000285",
      "rcept_dt": "20260518",
      "corp_code": "00567890",
      "corp_name": "한라IMS",
      "stkqy": "1200000",
      "stkqy_irds": "300000",
      "stkrt": "5.12",
      "stkrt_irds": "0.34",
      "ctr_stkqy": "0",
      "ctr_stkrt": "0",
      "report_resn": "신규보고"
    },
    {
      "rcept_no": "20260421000001",
      "rcept_dt": "20260421",
      "corp_code": "00567890",
      "corp_name": "한라IMS",
      "stkqy": "900000",
      "stkqy_irds": "0",
      "stkrt": "4.78",
      "stkrt_irds": "-",
      "ctr_stkqy": "0",
      "ctr_stkrt": "0",
      "report_resn": "신규보고"
    }
  ]
}
```

- [ ] **Step 2: 실패 테스트 작성**

`apps/company-map/src/lib/dart/major-stock.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchMajorStockByCorp } from "./major-stock";

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../tests/fixtures/dart-majorstock-sample.json"),
    "utf-8",
  ),
);

describe("fetchMajorStockByCorp", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.DART_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses majorstock.json into typed rows with numeric ratio", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    } as Response);

    const rows = await fetchMajorStockByCorp("00567890");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      rcpNo: "20260518000285",
      stockRatio: 5.12,
      stockRatioChange: 0.34,
      reportResn: "신규보고",
    });
    expect(rows[1].stockRatioChange).toBeNull();
  });

  it("returns [] on DART status 013 (no data)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "013", message: "조회된 데이타가 없습니다" }),
    } as Response);
    const rows = await fetchMajorStockByCorp("00111111");
    expect(rows).toEqual([]);
  });

  it("throws on other DART error status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "020", message: "인증 오류" }),
    } as Response);
    await expect(fetchMajorStockByCorp("00111111")).rejects.toThrow(/020/);
  });

  it("throws when DART_API_KEY is missing", async () => {
    delete process.env.DART_API_KEY;
    await expect(fetchMajorStockByCorp("00111111")).rejects.toThrow(/DART_API_KEY/);
  });
});
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

```bash
cd apps/company-map
npx vitest run src/lib/dart/major-stock.test.ts
```
Expected: FAIL with `Cannot find module './major-stock'`.

- [ ] **Step 4: fetcher 구현**

`apps/company-map/src/lib/dart/major-stock.ts`:

```ts
const MAJORSTOCK_URL = "https://opendart.fss.or.kr/api/majorstock.json";

export interface MajorStockRow {
  rcpNo: string;
  stockRatio: number | null;
  stockRatioChange: number | null;
  reportResn: string;
}

interface RawRow {
  rcept_no?: string;
  stkrt?: string;
  stkrt_irds?: string;
  report_resn?: string;
}

interface RawResponse {
  status: string;
  message?: string;
  list?: RawRow[];
}

/** OpenDART는 숫자를 string으로 반환. 빈값/"-"/공백만 → null. NaN → null. */
function parseNumeric(v: string | undefined): number | null {
  if (v == null) return null;
  const trimmed = v.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

export async function fetchMajorStockByCorp(
  corpCode: string,
): Promise<MajorStockRow[]> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY not set");

  const qs = new URLSearchParams({
    crtfc_key: apiKey,
    corp_code: corpCode,
  });

  const res = await fetch(`${MAJORSTOCK_URL}?${qs.toString()}`);
  if (!res.ok) throw new Error(`DART majorstock HTTP ${res.status}`);

  const data = (await res.json()) as RawResponse;

  if (data.status === "013") return [];
  if (data.status !== "000") {
    throw new Error(`DART status ${data.status}: ${data.message ?? "unknown"}`);
  }

  return (data.list ?? []).map<MajorStockRow>((r) => ({
    rcpNo: r.rcept_no ?? "",
    stockRatio: parseNumeric(r.stkrt),
    stockRatioChange: parseNumeric(r.stkrt_irds),
    reportResn: r.report_resn ?? "",
  }));
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run src/lib/dart/major-stock.test.ts
```
Expected: 4 tests passed.

- [ ] **Step 6: 전체 suite + tsc**

```bash
npx vitest run
npx tsc --noEmit
```
Expected: 35 (이전) + 4 (신규) = 39 tests passed; tsc EXIT=0.

- [ ] **Step 7: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/lib/dart/major-stock.ts \
        apps/company-map/src/lib/dart/major-stock.test.ts \
        apps/company-map/tests/fixtures/dart-majorstock-sample.json
git commit -m "$(cat <<'EOF'
feat(company-map): add OpenDART majorstock.json fetcher

Returns per-rcept_no stock_ratio (stkrt), stock_ratio_change (stkrt_irds),
and report_resn. Numeric fields arrive as strings; "-"/empty → null.
EOF
)"
```

---

## Task 3: Format utilities (TDD)

**Files:**
- Create: `apps/company-map/src/lib/format-ratio.test.ts`
- Create: `apps/company-map/src/lib/format-ratio.ts`

- [ ] **Step 1: 실패 테스트 작성**

`apps/company-map/src/lib/format-ratio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatStockRatio, ratioColorClass } from "./format-ratio";

describe("formatStockRatio", () => {
  it("returns dash when ratio is null (no enrichment yet)", () => {
    expect(formatStockRatio(null, 0.34, null)).toBe("—");
  });

  it("formats ratio + positive change", () => {
    expect(formatStockRatio(5.12, 0.34, null)).toBe("5.12% (+0.34%p)");
  });

  it("formats ratio + negative change", () => {
    expect(formatStockRatio(6.21, -0.5, null)).toBe("6.21% (-0.50%p)");
  });

  it("marks 신규 when change is null and report_resn contains 신규", () => {
    expect(formatStockRatio(4.78, null, "신규보고")).toBe("4.78% (신규)");
  });

  it("returns ratio alone when change is 0 and not 신규", () => {
    expect(formatStockRatio(5.0, 0, "변동보고")).toBe("5.00%");
  });

  it("returns ratio alone when change is null and report_resn lacks 신규", () => {
    expect(formatStockRatio(5.0, null, "변동보고")).toBe("5.00%");
  });
});

describe("ratioColorClass", () => {
  it("green for positive change", () => {
    expect(ratioColorClass(0.34)).toContain("green");
  });

  it("red for negative change", () => {
    expect(ratioColorClass(-0.5)).toContain("red");
  });

  it("gray for null", () => {
    expect(ratioColorClass(null)).toContain("gray");
  });

  it("gray for zero", () => {
    expect(ratioColorClass(0)).toContain("gray");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/lib/format-ratio.test.ts
```
Expected: FAIL — `Cannot find module './format-ratio'`.

- [ ] **Step 3: 구현**

`apps/company-map/src/lib/format-ratio.ts`:

```ts
/** "5.12% (+0.34%p)" 형식. 입력별 분기 명세는 spec 참조. */
export function formatStockRatio(
  ratio: number | null,
  change: number | null,
  reportResn: string | null,
): string {
  if (ratio == null) return "—";
  const ratioStr = `${ratio.toFixed(2)}%`;
  if (change == null || change === 0) {
    if (reportResn && reportResn.includes("신규")) return `${ratioStr} (신규)`;
    return ratioStr;
  }
  const sign = change > 0 ? "+" : "";
  return `${ratioStr} (${sign}${change.toFixed(2)}%p)`;
}

/** Tailwind class 반환. 0/null = gray, +=green, -=red. */
export function ratioColorClass(change: number | null): string {
  if (change == null || change === 0) return "text-gray-500 dark:text-gray-400";
  if (change > 0) return "text-green-600 dark:text-green-400";
  return "text-red-600 dark:text-red-400";
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/format-ratio.test.ts
```
Expected: 10 tests passed (6 formatStockRatio + 4 ratioColorClass).

- [ ] **Step 5: 전체 suite + tsc**

```bash
npx vitest run
npx tsc --noEmit
```
Expected: 39 + 10 = 49 tests passed; tsc EXIT=0.

- [ ] **Step 6: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/lib/format-ratio.ts apps/company-map/src/lib/format-ratio.test.ts
git commit -m "$(cat <<'EOF'
feat(company-map): add formatStockRatio + ratioColorClass helpers

Pure utilities for rendering "5.12% (+0.34%p)" with sign-based color and
신규 detection.
EOF
)"
```

---

## Task 4: enrichVipHoldings + refresh integration

**Files:**
- Modify: `apps/company-map/src/lib/dart/vip-holdings.ts`

- [ ] **Step 1: import + 새 함수 추가**

`apps/company-map/src/lib/dart/vip-holdings.ts` 파일 상단 import 영역에 추가:

```ts
import { fetchMajorStockByCorp } from "./major-stock";
```

기존 `refreshVipHoldings` 함수 위(또는 아래)에 새 함수 추가:

```ts
const ENRICH_DELAY_MS = 150;

/** 주어진 corp_code들에 대해 majorstock.json으로 보유율/증감/사유를 update.
 *  rcpNo가 vip_holdings에 없으면 그 row는 skip (다른 보고자 row). */
export async function enrichVipHoldings(
  corpCodes: Iterable<string>,
): Promise<{ enriched: number }> {
  const uniqueCodes = [...new Set(corpCodes)];
  let enriched = 0;
  for (let i = 0; i < uniqueCodes.length; i++) {
    const corpCode = uniqueCodes[i];
    let rows;
    try {
      rows = await fetchMajorStockByCorp(corpCode);
    } catch (e) {
      console.error(`[vip] majorstock fetch failed for ${corpCode}:`, e);
      continue;
    }
    for (const r of rows) {
      const result = await db.vipHolding.updateMany({
        where: { rcpNo: r.rcpNo },
        data: {
          stockRatio: r.stockRatio,
          stockRatioChange: r.stockRatioChange,
          reportResn: r.reportResn,
        },
      });
      enriched += result.count;
    }
    if (i < uniqueCodes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, ENRICH_DELAY_MS));
    }
  }
  return { enriched };
}
```

- [ ] **Step 2: `RefreshVipHoldingsResult`에 `enriched` 필드 추가**

```ts
export interface RefreshVipHoldingsResult {
  fetched: number;
  matchedVip: number;
  mapped: number;
  upserted: number;
  pruned: number;
  enriched: number;
}
```

- [ ] **Step 3: `refreshVipHoldings` 흐름 수정**

upsert된 row의 `corp_code`를 모으고, 모든 chunk 처리 후 enrichment 호출. 함수의 `let upserted = 0;` 옆에 추가:

```ts
const upsertedCorpCodes = new Set<string>();
```

upsert 직후에:
```ts
upserted++;
upsertedCorpCodes.add(input.corpCode);
```

`pruneResult` 줄 다음에 추가:

```ts
const enrichResult = await enrichVipHoldings(upsertedCorpCodes);
```

`return` 줄 갱신:
```ts
return {
  fetched,
  matchedVip,
  mapped,
  upserted,
  pruned: pruneResult.count,
  enriched: enrichResult.enriched,
};
```

- [ ] **Step 4: 컴파일 + 기존 테스트 영향 확인**

```bash
cd apps/company-map
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0. 49 tests pass (변경된 vip-holdings는 통합 로직이라 단위 테스트 없음 — refresh 스크립트 실행으로 검증).

- [ ] **Step 5: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/lib/dart/vip-holdings.ts
git commit -m "$(cat <<'EOF'
feat(company-map): enrich VIP holdings with stock_ratio via majorstock.json

After upsert, collect distinct corp_codes and call enrichVipHoldings,
which fetches majorstock.json per corp_code and updateMany by rcpNo.
Result now includes `enriched` count.
EOF
)"
```

---

## Task 5: Refresh 실행 + DB 검증

**Files:** 실행만, 코드 변경 없음.

- [ ] **Step 1: refresh 스크립트 실행**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx tsx scripts/refresh-vip-holdings.ts
```
Expected (대략):
```
[vip] refresh started
[krx] corp_code map loaded: <number> listed companies
[vip] done in <60-120>s { fetched: <thousands>, matchedVip: 30, mapped: 30, upserted: 30, pruned: 0, enriched: 30 }
```

`enriched`가 0이면 매칭 실패 — fetcher나 rcpNo 매칭 로직 디버깅 필요.

- [ ] **Step 2: 사용자 예시 검증**

```bash
sqlite3 data/company-map.db "SELECT rcp_no, corp_name, stock_ratio, stock_ratio_change, report_resn FROM vip_holdings WHERE rcp_no='20260518000285';"
```
Expected: 한라IMS row, `stock_ratio`와 `stock_ratio_change`가 숫자 (NULL 아님), `report_resn`이 의미 있는 문자열.

- [ ] **Step 3: enrichment 커버리지**

```bash
sqlite3 data/company-map.db "SELECT SUM(stock_ratio IS NOT NULL) AS with_ratio, COUNT(*) AS total FROM vip_holdings;"
```
Expected: `with_ratio` == `total` 또는 거의 같음 (95%+).

- [ ] **Step 4: 부호별 분포**

```bash
sqlite3 data/company-map.db "SELECT
  SUM(stock_ratio_change > 0) AS up,
  SUM(stock_ratio_change < 0) AS down,
  SUM(stock_ratio_change = 0 OR stock_ratio_change IS NULL) AS flat_or_null
FROM vip_holdings;"
```
실제 시장 데이터 기반이므로 정확한 값 예측 불가. up/down/flat 분포만 출력해서 합리적인지 눈으로 확인.

이 task는 외부 데이터 변동에 의존해 검증 — 커밋 없음. 후속 task 진행.

---

## Task 6: Server Action 확장

**Files:**
- Modify: `apps/company-map/src/actions/vip-holdings.ts`

- [ ] **Step 1: `VipHoldingDetailRow` 확장**

`apps/company-map/src/actions/vip-holdings.ts`의 interface에 세 필드 추가:

```ts
export interface VipHoldingDetailRow {
  rcpNo: string;
  reportNm: string;
  reportType: string;
  rceptDt: string;
  stockRatio: number | null;
  stockRatioChange: number | null;
  reportResn: string | null;
  dartUrl: string;
}
```

- [ ] **Step 2: 매핑에 새 필드 채우기**

`getVipHoldingsByCode` 함수 내부의 `rows.map((r) => (...))` 블록을 다음과 같이 변경:

```ts
return rows.map((r) => ({
  rcpNo: r.rcpNo,
  reportNm: r.reportNm,
  reportType: r.reportType,
  rceptDt: r.rceptDt.toISOString(),
  stockRatio: r.stockRatio,
  stockRatioChange: r.stockRatioChange,
  reportResn: r.reportResn,
  dartUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcpNo}`,
}));
```

`findMany`는 기본 select(모든 필드)를 사용하므로 query 변경 불필요.

- [ ] **Step 3: 컴파일 + 테스트**

```bash
cd apps/company-map
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0. 49 tests pass.

- [ ] **Step 4: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/actions/vip-holdings.ts
git commit -m "$(cat <<'EOF'
feat(company-map): expose stock_ratio fields via getVipHoldingsByCode

VipHoldingDetailRow now carries stockRatio, stockRatioChange, and
reportResn for inline rendering in the expand row.
EOF
)"
```

---

## Task 7: 클라이언트 UI — 인라인 비율 표시

**Files:**
- Modify: `apps/company-map/src/app/stocks/StocksExplorerClient.tsx`

- [ ] **Step 1: import 추가**

`StocksExplorerClient.tsx` 상단 import 영역에 추가 (기존 `formatMarcap` import 아래):

```ts
import { formatStockRatio, ratioColorClass } from "@/lib/format-ratio";
```

- [ ] **Step 2: expand row `<li>` JSX 교체**

기존 expand row의 각 공시 `<li>`를 다음으로 교체. 위치: `vipDetails[r.code] ?? []).map((d) => ( ... ))` 안.

기존 형태 (참고):
```tsx
<li key={d.rcpNo} className="flex items-center gap-3">
  <span className="font-mono text-gray-500 w-24">{d.rceptDt.slice(0, 10)}</span>
  <span className="flex-1">{d.reportNm}</span>
  <a href={d.dartUrl} ...>공시 보기 <ExternalLink size={12} /></a>
</li>
```

새 형태:
```tsx
<li key={d.rcpNo} className="flex items-center gap-3">
  <span className="font-mono text-gray-500 w-24">{d.rceptDt.slice(0, 10)}</span>
  <span className="flex-1 min-w-0 truncate">{d.reportNm}</span>
  <span className={`w-36 text-right font-mono ${ratioColorClass(d.stockRatioChange)}`}>
    {formatStockRatio(d.stockRatio, d.stockRatioChange, d.reportResn)}
  </span>
  <a
    href={d.dartUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
  >
    공시 보기 <ExternalLink size={12} />
  </a>
</li>
```

변경점:
- `flex-1`에 `min-w-0 truncate` 추가 — 긴 보고서명이 ratio 영역을 침범 안 함
- ratio `<span>` 신규 — `w-36 text-right font-mono` 폭 고정 + 우측 정렬 + 등폭 폰트

- [ ] **Step 3: 컴파일 + lint + 테스트**

```bash
cd apps/company-map
npx tsc --noEmit
npx eslint src/app/stocks src/lib/format-ratio.ts src/actions/vip-holdings.ts
npx vitest run
```
Expected:
- tsc EXIT=0
- eslint는 사전에 존재하던 `AppMenu.tsx` 경고 1건만 (무관). 새 에러 없음.
- vitest 49 tests pass

- [ ] **Step 4: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/app/stocks/StocksExplorerClient.tsx
git commit -m "$(cat <<'EOF'
feat(company-map): render inline stock ratio in VIP expand row

Each disclosure row now shows "5.12% (+0.34%p)" with sign-based color
(green up / red down / gray flat or 신규). Width fixed via w-36 so rows
align cleanly even with mixed enrichment state.
EOF
)"
```

---

## Task 8: 통합 검증

**Files:** 검증만 — 코드 변경 없음.

- [ ] **Step 1: dev 서버 재시작 (사용자 액션 필요)**

Prisma client schema가 바뀌었으므로 사용자가 띄운 dev 서버를 재시작해야 한다. 사용자에게:

```
사용자 액션 필요:
1) 기존 npm run dev 중지 (Ctrl+C)
2) cd apps/company-map && npm run dev 재실행
3) ready 메시지 확인 후 진행
```

- [ ] **Step 2: 페이지 로드**

브라우저: `http://localhost:3004/stocks?vip=1`
- 페이지 정상 로드 (500 없음)
- VIP 보유 30개 종목 표시

- [ ] **Step 3: Expand row 확인**

임의 종목의 'N건' 클릭:
- expand row 펼침
- 각 공시 항목: 날짜 + 보고서명 + **"5.12% (+0.34%p)" 인라인 비율** + 공시 보기
- 부호별 색상:
  - 증가 항목 → 초록
  - 감소 항목 → 빨강
  - 신규/0 → 회색
- 폭 고정으로 행 정렬 흐트러지지 않음

- [ ] **Step 4: 한라IMS expand 검증**

종목명/코드 검색에 "한라IMS" 또는 "092460" → 행 expand → 2026-05-18 공시 row에 보유율/증감 표시 확인. "공시 보기" → DART 새 탭 정상 동작.

- [ ] **Step 5: 회귀 확인**

다음 페이지 모두 정상 로드:
- `/stocks` (vip 필터 없이)
- `/stocks?vip=0`
- `/companies`, `/top-stocks`, `/ncav`, `/trade`, `/calculator`

- [ ] **Step 6: 전체 테스트**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx vitest run
```
Expected: 49 tests pass across 8 files.

검증만 — 별도 커밋 없음. plan 완료.

---

## Self-Review Notes

**Spec coverage:**
- `VipHolding` 3 컬럼 → Task 1 ✓
- `majorstock.json` fetcher → Task 2 ✓
- `formatStockRatio` + `ratioColorClass` → Task 3 ✓
- `enrichVipHoldings` + `refreshVipHoldings` 통합 → Task 4 ✓
- 실 데이터 수집 + DB 검증 → Task 5 ✓
- `getVipHoldingsByCode`에 3 필드 → Task 6 ✓
- expand row 인라인 표시 → Task 7 ✓
- 통합 검증 + 회귀 → Task 8 ✓

**Type consistency:**
- `MajorStockRow.stockRatio: number | null` (Task 2) ↔ Prisma `stockRatio: Float?` (Task 1) ↔ `VipHoldingDetailRow.stockRatio: number | null` (Task 6) ↔ `formatStockRatio(ratio, ...)` 첫 인자 (Task 3) — 일치
- `RefreshVipHoldingsResult.enriched` (Task 4) ↔ `enrichVipHoldings(): { enriched }` (Task 4) — 일치
- `parseNumeric` 정책 (Task 2: "-"/빈문자열 → null) ↔ `formatStockRatio`의 null 분기 (Task 3) — 일치

**Placeholder scan:** 없음. 각 step에 실제 코드 + 명령 + 예상 출력 포함. `<ts>_add_vip_stock_ratio`는 Prisma 자동 생성 placeholder.
