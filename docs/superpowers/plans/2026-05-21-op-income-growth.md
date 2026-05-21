# 영업이익 성장 (YoY/QoQ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks` 전종목 조회 표에 영업이익 YoY/QoQ 성장률 컬럼을 추가하고, OpenDART `fnlttSinglAcnt.json`에서 자동 보고서 탐지로 종목별 영업이익을 수집하는 수동 트리거 스크립트를 제공한다.

**Architecture:** 신규 `FinancialSnapshot` 1:1 모델에 raw bigint 3개(opIncome, opIncomeYoyBase, opIncomePrevReport)만 저장. 성장률(%)·흑전/적전 분기는 표시 시점에 `computeGrowth(curr, base)` 순수 함수가 GrowthCell discriminated union을 반환. 4단계 보고서 코드 fallback 매핑(11014→11012→11013→11011)으로 종목당 최대 2회 DART 호출.

**Tech Stack:** Next.js 16, Prisma 6 + SQLite, vitest 4, lucide-react, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-05-21-op-income-growth-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` | `FinancialSnapshot` 모델 + `StockMaster.financialSnapshot` relation |
| `src/lib/dart/operating-income.ts` | `extractOpIncome` 순수 함수 + `findLatestOpIncomeReport`/`fetchPrevOpIncomeReport` integration |
| `src/lib/dart/operating-income.test.ts` | `extractOpIncome` 단위 테스트 |
| `tests/fixtures/dart-fnltt-op-income.json` | DART 분기 응답 fixture |
| `src/lib/format-growth.ts` | `computeGrowth`/`formatGrowth`/`growthColorClass` 순수 함수 |
| `src/lib/format-growth.test.ts` | 성장률 유틸 테스트 (전 분기 커버) |
| `scripts/refresh-operating-income.ts` | 전종목 수동 트리거 + 진행률 로그 |
| `src/actions/stocks-explorer.ts` | `StocksExplorerRow`에 4 필드 추가 + `include` 확장 |
| `src/app/stocks/StocksExplorerClient.tsx` | YoY/QoQ 컬럼, colSpan 10 → 12, hover title |

---

## Task 1: Prisma 모델 + 마이그레이션

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma`
- Generated: `apps/company-map/prisma/migrations/<ts>_add_financial_snapshot/`

- [ ] **Step 1: `StockMaster`에 relation 추가**

`apps/company-map/prisma/schema.prisma`의 `StockMaster` 모델 안 relation 영역에 한 줄 추가 (기존 `vipHoldings VipHolding[]` 다음, `@@index` 직전):

```prisma
model StockMaster {
  code             String   @id
  name             String
  market           String?
  marcap           BigInt?
  corpCode         String?  @map("corp_code")
  updatedAt        DateTime @updatedAt @map("updated_at")

  analysis          StockAnalysis?
  ncavResult        NcavResult?
  vipHoldings       VipHolding[]
  financialSnapshot FinancialSnapshot?

  @@index([name])
  @@index([market])
  @@index([marcap])
  @@map("stock_masters")
}
```

- [ ] **Step 2: `FinancialSnapshot` 모델 추가**

`schema.prisma` 가장 끝에 새 모델 추가:

```prisma
model FinancialSnapshot {
  code               String   @id
  latestBsnsYear     Int      @map("latest_bsns_year")
  latestReprtCode    String   @map("latest_reprt_code")
  opIncome           BigInt?  @map("op_income")
  opIncomeYoyBase    BigInt?  @map("op_income_yoy_base")
  opIncomePrevReport BigInt?  @map("op_income_prev_report")
  fetchedAt          DateTime @default(now()) @map("fetched_at")

  master  StockMaster @relation(fields: [code], references: [code], onDelete: Cascade)

  @@map("financial_snapshots")
}
```

- [ ] **Step 3: 마이그레이션 생성·적용**

Run:
```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx prisma migrate dev --name add_financial_snapshot
```

Expected:
```
Applying migration `<timestamp>_add_financial_snapshot`
✔ Generated Prisma Client
```

- [ ] **Step 4: 마이그레이션 SQL 검증**

```bash
cat prisma/migrations/*add_financial_snapshot*/migration.sql
```

Expected: `CREATE TABLE "financial_snapshots" (...)` 한 블록만. 다른 ALTER/DROP/INDEX 변경 없음.

- [ ] **Step 5: 기존 테이블 무손상 확인**

```bash
sqlite3 data/company-map.db "SELECT COUNT(*) FROM vip_holdings;"
sqlite3 data/company-map.db "SELECT COUNT(*) FROM stock_masters;"
```
Expected: 41 (vip) 그대로, stock_masters 그대로.

- [ ] **Step 6: tsc + tests**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0; 49 tests pass.

- [ ] **Step 7: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "$(cat <<'EOF'
feat(company-map): add FinancialSnapshot model for op_income tracking

1:1 with StockMaster, holds raw bigint values (op_income, op_income_yoy_base,
op_income_prev_report) plus latest_bsns_year/latest_reprt_code. Growth %
computed at render time, not stored.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: extractOpIncome 순수 함수 (TDD)

**Files:**
- Create: `apps/company-map/tests/fixtures/dart-fnltt-op-income.json`
- Create: `apps/company-map/src/lib/dart/operating-income.test.ts`
- Create: `apps/company-map/src/lib/dart/operating-income.ts`

- [ ] **Step 1: fixture 생성**

`apps/company-map/tests/fixtures/dart-fnltt-op-income.json`:

```json
{
  "status": "000",
  "list": [
    {
      "rcept_no": "20260514000123",
      "sj_div": "IS",
      "sj_nm": "손익계산서",
      "fs_div": "CFS",
      "fs_nm": "연결재무제표",
      "account_nm": "영업이익",
      "thstrm_nm": "제 58 기 1분기",
      "thstrm_amount": "5,000,000,000",
      "frmtrm_nm": "제 57 기 1분기",
      "frmtrm_amount": "3,800,000,000",
      "bfefrmtrm_nm": "제 56 기 1분기",
      "bfefrmtrm_amount": "4,200,000,000"
    },
    {
      "rcept_no": "20260514000123",
      "sj_div": "IS",
      "fs_div": "OFS",
      "fs_nm": "재무제표",
      "account_nm": "영업이익",
      "thstrm_amount": "1,000,000,000",
      "frmtrm_amount": "900,000,000"
    },
    {
      "rcept_no": "20260514000123",
      "fs_div": "CFS",
      "fs_nm": "연결재무제표",
      "account_nm": "매출액",
      "thstrm_amount": "50,000,000,000"
    }
  ]
}
```

- [ ] **Step 2: 실패 테스트 작성**

`apps/company-map/src/lib/dart/operating-income.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractOpIncome } from "./operating-income";

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../tests/fixtures/dart-fnltt-op-income.json"),
    "utf-8",
  ),
);

describe("extractOpIncome", () => {
  it("returns 연결 영업이익 when available", () => {
    const r = extractOpIncome(fixture);
    expect(r).not.toBeNull();
    expect(r!.thstrm).toBe(5_000_000_000n);
    expect(r!.frmtrm).toBe(3_800_000_000n);
  });

  it("falls back to 별도/재무제표 when 연결 missing", () => {
    const onlyStandalone = {
      status: "000",
      list: fixture.list.filter(
        (x: { fs_nm: string }) => x.fs_nm === "재무제표",
      ),
    };
    const r = extractOpIncome(onlyStandalone);
    expect(r).not.toBeNull();
    expect(r!.thstrm).toBe(1_000_000_000n);
    expect(r!.frmtrm).toBe(900_000_000n);
  });

  it("returns null when status != '000'", () => {
    expect(extractOpIncome({ status: "013", list: [] })).toBeNull();
  });

  it("returns null when 영업이익 row absent", () => {
    expect(
      extractOpIncome({
        status: "000",
        list: [{ account_nm: "매출액", thstrm_amount: "1" }],
      }),
    ).toBeNull();
  });

  it("returns null when thstrm or frmtrm cannot be parsed", () => {
    expect(
      extractOpIncome({
        status: "000",
        list: [
          {
            account_nm: "영업이익",
            fs_nm: "연결재무제표",
            thstrm_amount: "-",
            frmtrm_amount: "-",
          },
        ],
      }),
    ).toBeNull();
  });

  it("parses negative amounts (loss) correctly", () => {
    expect(
      extractOpIncome({
        status: "000",
        list: [
          {
            account_nm: "영업이익",
            fs_nm: "연결재무제표",
            thstrm_amount: "-1,500,000,000",
            frmtrm_amount: "2,000,000,000",
          },
        ],
      }),
    ).toEqual({ thstrm: -1_500_000_000n, frmtrm: 2_000_000_000n });
  });
});
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

```bash
cd apps/company-map
npx vitest run src/lib/dart/operating-income.test.ts
```
Expected: FAIL — `Cannot find module './operating-income'`.

- [ ] **Step 4: 구현 (extractOpIncome만)**

`apps/company-map/src/lib/dart/operating-income.ts`:

```ts
export type ReprtCode = "11011" | "11013" | "11012" | "11014";

export interface OpIncomeReport {
  bsnsYear: number;
  reprtCode: ReprtCode;
  thstrm: bigint;
  frmtrm: bigint;
}

interface DartListItem {
  account_nm?: string;
  fs_nm?: string;
  fs_div?: string;
  thstrm_amount?: string;
  frmtrm_amount?: string;
}

interface DartResponse {
  status?: string;
  list?: DartListItem[];
}

function parseAmount(raw: string | undefined): bigint | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

/** 영업이익 row를 연결 → 별도 순서로 선택. thstrm/frmtrm 모두 파싱돼야 row 유효. */
export function extractOpIncome(
  response: unknown,
): { thstrm: bigint; frmtrm: bigint } | null {
  const r = response as DartResponse;
  if (r.status !== "000") return null;
  const list = r.list ?? [];

  const candidates = list
    .filter((item) => item.account_nm === "영업이익")
    .map((item) => {
      const isConsolidated = item.fs_nm === "연결재무제표" || item.fs_div === "CFS";
      return {
        priority: isConsolidated ? 0 : 1,
        thstrm: parseAmount(item.thstrm_amount),
        frmtrm: parseAmount(item.frmtrm_amount),
      };
    })
    .filter((c) => c.thstrm !== null && c.frmtrm !== null)
    .sort((a, b) => a.priority - b.priority);

  if (candidates.length === 0) return null;
  const c = candidates[0];
  return { thstrm: c.thstrm!, frmtrm: c.frmtrm! };
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run src/lib/dart/operating-income.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 6: 전체 suite + tsc**

```bash
npx vitest run
npx tsc --noEmit
```
Expected: 49 + 6 = 55 tests pass; tsc EXIT=0.

- [ ] **Step 7: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/lib/dart/operating-income.ts \
        apps/company-map/src/lib/dart/operating-income.test.ts \
        apps/company-map/tests/fixtures/dart-fnltt-op-income.json
git commit -m "$(cat <<'EOF'
feat(company-map): extract 영업이익 (연결 우선) from DART fnlttSinglAcnt response

Pure function reused by report-discovery logic in Task 3. Connected
financials take priority over standalone; rows with unparseable thstrm
or frmtrm are skipped.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: findLatestOpIncomeReport + fetchPrevOpIncomeReport (integration)

**Files:**
- Modify: `apps/company-map/src/lib/dart/operating-income.ts` (append integration functions)

- [ ] **Step 1: 기존 fetcher 재사용 import 추가**

`operating-income.ts` 상단(`import` 영역)에 추가:

```ts
import { fetchDartFinancial } from "./financial";
```

`fetchDartFinancial(corpCode, bsnsYear, reprtCode)`는 이미 retry + timeout 처리됨. 응답 또는 null 반환.

- [ ] **Step 2: `findLatestOpIncomeReport` 구현**

`operating-income.ts` 끝에 추가:

```ts
/** 시도 순서: 올해 11014 → 11012 → 11013 → 작년 11011. 첫 매칭에서 멈춤. */
export async function findLatestOpIncomeReport(
  corpCode: string,
  now: Date = new Date(),
): Promise<OpIncomeReport | null> {
  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;
  const candidates: Array<{ year: number; code: ReprtCode }> = [
    { year: thisYear, code: "11014" },
    { year: thisYear, code: "11012" },
    { year: thisYear, code: "11013" },
    { year: lastYear, code: "11011" },
  ];

  for (const { year, code } of candidates) {
    const resp = await fetchDartFinancial(corpCode, year, code);
    if (!resp) continue;
    const op = extractOpIncome(resp);
    if (!op) continue;
    return { bsnsYear: year, reprtCode: code, thstrm: op.thstrm, frmtrm: op.frmtrm };
  }
  return null;
}
```

- [ ] **Step 3: `fetchPrevOpIncomeReport` 구현**

같은 파일에 추가:

```ts
/** 매칭된 보고서의 한 단계 이전 보고서 fetch. QoQ 비교용. */
export async function fetchPrevOpIncomeReport(
  corpCode: string,
  latest: OpIncomeReport,
): Promise<OpIncomeReport | null> {
  const prev = prevReportFor(latest);
  if (!prev) return null;
  const resp = await fetchDartFinancial(corpCode, prev.year, prev.code);
  if (!resp) return null;
  const op = extractOpIncome(resp);
  if (!op) return null;
  return { bsnsYear: prev.year, reprtCode: prev.code, thstrm: op.thstrm, frmtrm: op.frmtrm };
}

function prevReportFor(
  latest: OpIncomeReport,
): { year: number; code: ReprtCode } | null {
  switch (latest.reprtCode) {
    case "11014": return { year: latest.bsnsYear, code: "11012" };
    case "11012": return { year: latest.bsnsYear, code: "11013" };
    case "11013": return { year: latest.bsnsYear - 1, code: "11011" };
    case "11011": return { year: latest.bsnsYear - 1, code: "11014" };
  }
}
```

- [ ] **Step 4: 컴파일 + 기존 테스트 확인**

```bash
cd apps/company-map
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0; 55 tests pass.

(통합 함수는 단위 테스트 없음 — Task 6의 live run으로 검증.)

- [ ] **Step 5: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/lib/dart/operating-income.ts
git commit -m "$(cat <<'EOF'
feat(company-map): add findLatestOpIncomeReport + fetchPrevOpIncomeReport

findLatest tries 11014→11012→11013→11011(prev year) in order, returning
on first match. fetchPrev maps the matched report to the previous-step
report (11014→11012, 11012→11013, 11013→prev 11011, 11011→prev 11014)
for QoQ comparison.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: format-growth 유틸 (TDD)

**Files:**
- Create: `apps/company-map/src/lib/format-growth.test.ts`
- Create: `apps/company-map/src/lib/format-growth.ts`

- [ ] **Step 1: 실패 테스트 작성**

`apps/company-map/src/lib/format-growth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  computeGrowth,
  formatGrowth,
  growthColorClass,
} from "./format-growth";

describe("computeGrowth", () => {
  it("returns pct for positive base and positive curr", () => {
    expect(computeGrowth(1200n, 1000n)).toEqual({ kind: "pct", value: 20 });
  });

  it("returns negative pct for shrinkage", () => {
    expect(computeGrowth(800n, 1000n)).toEqual({ kind: "pct", value: -20 });
  });

  it("turnaround_positive when base < 0 and curr > 0", () => {
    expect(computeGrowth(100n, -50n)).toEqual({ kind: "turnaround_positive" });
  });

  it("turnaround_negative when base > 0 and curr < 0", () => {
    expect(computeGrowth(-100n, 50n)).toEqual({ kind: "turnaround_negative" });
  });

  it("loss_widened when both negative and curr more negative", () => {
    expect(computeGrowth(-200n, -100n)).toEqual({ kind: "loss_widened" });
  });

  it("loss_narrowed when both negative and curr less negative", () => {
    expect(computeGrowth(-50n, -100n)).toEqual({ kind: "loss_narrowed" });
  });

  it("unavailable for null inputs", () => {
    expect(computeGrowth(null, 100n)).toEqual({ kind: "unavailable" });
    expect(computeGrowth(100n, null)).toEqual({ kind: "unavailable" });
  });

  it("unavailable when both zero", () => {
    expect(computeGrowth(0n, 0n)).toEqual({ kind: "unavailable" });
  });

  it("infinity pct when base is 0 and curr positive", () => {
    expect(computeGrowth(100n, 0n)).toEqual({ kind: "pct", value: Infinity });
  });

  it("accepts number inputs as well as bigint", () => {
    expect(computeGrowth(1200, 1000)).toEqual({ kind: "pct", value: 20 });
  });
});

describe("formatGrowth", () => {
  it("formats positive pct with + sign and 1 decimal", () => {
    expect(formatGrowth({ kind: "pct", value: 12.34 })).toBe("+12.3%");
  });

  it("formats negative pct with native -", () => {
    expect(formatGrowth({ kind: "pct", value: -8.7 })).toBe("-8.7%");
  });

  it("formats infinity as +∞%", () => {
    expect(formatGrowth({ kind: "pct", value: Infinity })).toBe("+∞%");
  });

  it("returns 흑전 / 적전 / 적자↑ / 적자↓ / — for each kind", () => {
    expect(formatGrowth({ kind: "turnaround_positive" })).toBe("흑전");
    expect(formatGrowth({ kind: "turnaround_negative" })).toBe("적전");
    expect(formatGrowth({ kind: "loss_widened" })).toBe("적자↑");
    expect(formatGrowth({ kind: "loss_narrowed" })).toBe("적자↓");
    expect(formatGrowth({ kind: "unavailable" })).toBe("—");
  });
});

describe("growthColorClass", () => {
  it("green for positive pct", () => {
    expect(growthColorClass({ kind: "pct", value: 1 })).toContain("green");
  });

  it("red for negative pct", () => {
    expect(growthColorClass({ kind: "pct", value: -1 })).toContain("red");
  });

  it("gray for zero pct", () => {
    expect(growthColorClass({ kind: "pct", value: 0 })).toContain("gray");
  });

  it("turnaround_positive uses font-semibold green", () => {
    const c = growthColorClass({ kind: "turnaround_positive" });
    expect(c).toContain("green");
    expect(c).toContain("font-semibold");
  });

  it("turnaround_negative uses font-semibold red", () => {
    const c = growthColorClass({ kind: "turnaround_negative" });
    expect(c).toContain("red");
    expect(c).toContain("font-semibold");
  });

  it("loss_widened uses red", () => {
    expect(growthColorClass({ kind: "loss_widened" })).toContain("red");
  });

  it("loss_narrowed uses gray", () => {
    expect(growthColorClass({ kind: "loss_narrowed" })).toContain("gray");
  });

  it("unavailable uses gray", () => {
    expect(growthColorClass({ kind: "unavailable" })).toContain("gray");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/lib/format-growth.test.ts
```
Expected: FAIL — `Cannot find module './format-growth'`.

- [ ] **Step 3: 구현**

`apps/company-map/src/lib/format-growth.ts`:

```ts
export type GrowthCell =
  | { kind: "pct"; value: number }
  | { kind: "turnaround_positive" }
  | { kind: "turnaround_negative" }
  | { kind: "loss_widened" }
  | { kind: "loss_narrowed" }
  | { kind: "unavailable" };

export function computeGrowth(
  curr: bigint | number | null,
  base: bigint | number | null,
): GrowthCell {
  if (curr == null || base == null) return { kind: "unavailable" };
  const c = typeof curr === "bigint" ? Number(curr) : curr;
  const b = typeof base === "bigint" ? Number(base) : base;
  if (!Number.isFinite(c) || !Number.isFinite(b)) return { kind: "unavailable" };
  if (b === 0 && c === 0) return { kind: "unavailable" };
  if (b < 0 && c > 0) return { kind: "turnaround_positive" };
  if (b > 0 && c < 0) return { kind: "turnaround_negative" };
  if (b < 0 && c < 0) {
    return c < b ? { kind: "loss_widened" } : { kind: "loss_narrowed" };
  }
  if (b === 0) return { kind: "pct", value: c > 0 ? Infinity : -Infinity };
  return { kind: "pct", value: ((c - b) / Math.abs(b)) * 100 };
}

export function formatGrowth(g: GrowthCell): string {
  switch (g.kind) {
    case "pct":
      if (!Number.isFinite(g.value)) return g.value > 0 ? "+∞%" : "-∞%";
      return `${g.value >= 0 ? "+" : ""}${g.value.toFixed(1)}%`;
    case "turnaround_positive": return "흑전";
    case "turnaround_negative": return "적전";
    case "loss_widened":        return "적자↑";
    case "loss_narrowed":       return "적자↓";
    case "unavailable":         return "—";
  }
}

export function growthColorClass(g: GrowthCell): string {
  switch (g.kind) {
    case "turnaround_positive": return "text-green-700 dark:text-green-400 font-semibold";
    case "turnaround_negative": return "text-red-700 dark:text-red-400 font-semibold";
    case "loss_widened":        return "text-red-600 dark:text-red-400";
    case "loss_narrowed":       return "text-gray-500 dark:text-gray-400";
    case "pct":
      if (g.value > 0) return "text-green-600 dark:text-green-400";
      if (g.value < 0) return "text-red-600 dark:text-red-400";
      return "text-gray-500 dark:text-gray-400";
    case "unavailable":         return "text-gray-400 dark:text-gray-600";
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/format-growth.test.ts
```
Expected: 25 tests pass (10 computeGrowth + 6 formatGrowth + 9 growthColorClass).

- [ ] **Step 5: 전체 suite + tsc**

```bash
npx vitest run
npx tsc --noEmit
```
Expected: 55 + 25 = 80 tests pass; tsc EXIT=0.

- [ ] **Step 6: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/lib/format-growth.ts apps/company-map/src/lib/format-growth.test.ts
git commit -m "$(cat <<'EOF'
feat(company-map): add computeGrowth / formatGrowth / growthColorClass

Discriminated union covers 6 cases: pct, turnaround_positive,
turnaround_negative, loss_widened, loss_narrowed, unavailable.
Pure functions, no I/O.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 수동 트리거 스크립트

**Files:**
- Create: `apps/company-map/scripts/refresh-operating-income.ts`

- [ ] **Step 1: 스크립트 작성**

`apps/company-map/scripts/refresh-operating-income.ts`:

```ts
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { db } from "../worker/db";
import {
  findLatestOpIncomeReport,
  fetchPrevOpIncomeReport,
} from "@/lib/dart/operating-income";

const CALL_DELAY_MS = 100;

(async () => {
  const start = Date.now();
  const masters = await db.stockMaster.findMany({
    where: { corpCode: { not: null } },
    select: { code: true, corpCode: true },
  });
  console.log(`[op] ${masters.length} candidates`);

  let upserted = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < masters.length; i++) {
    const m = masters[i];
    if (!m.corpCode) {
      skipped++;
      continue;
    }
    try {
      const latest = await findLatestOpIncomeReport(m.corpCode);
      await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
      if (!latest) {
        skipped++;
        continue;
      }
      const prev = await fetchPrevOpIncomeReport(m.corpCode, latest);
      await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
      await db.financialSnapshot.upsert({
        where: { code: m.code },
        create: {
          code: m.code,
          latestBsnsYear: latest.bsnsYear,
          latestReprtCode: latest.reprtCode,
          opIncome: latest.thstrm,
          opIncomeYoyBase: latest.frmtrm,
          opIncomePrevReport: prev?.thstrm ?? null,
        },
        update: {
          latestBsnsYear: latest.bsnsYear,
          latestReprtCode: latest.reprtCode,
          opIncome: latest.thstrm,
          opIncomeYoyBase: latest.frmtrm,
          opIncomePrevReport: prev?.thstrm ?? null,
          fetchedAt: new Date(),
        },
      });
      upserted++;
    } catch (e) {
      failed++;
      console.error(`[op] ${m.code} failed:`, e);
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[op] progress ${i + 1}/${masters.length} (upserted=${upserted}, skipped=${skipped}, failed=${failed})`,
      );
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(
    `[op] done in ${elapsed}s { upserted: ${upserted}, skipped: ${skipped}, failed: ${failed} }`,
  );
  process.exit(0);
})();
```

- [ ] **Step 2: 컴파일 확인**

```bash
cd apps/company-map
npx tsc --noEmit
```
Expected: EXIT=0.

- [ ] **Step 3: 커밋 (실행은 Task 6에서)**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/scripts/refresh-operating-income.ts
git commit -m "$(cat <<'EOF'
feat(company-map): add refresh-operating-income manual trigger

Iterates corpCode-bearing stock_masters, calls findLatest + fetchPrev
per corp with 100ms inter-call delay, upserts FinancialSnapshot. Logs
progress every 100 stocks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 실 DART 호출 + DB 검증

**Files:** 실행만 — 코드 변경 없음. 커밋도 없음.

- [ ] **Step 1: 트리거 실행**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx tsx scripts/refresh-operating-income.ts
```

Expected (대략 10-20분, 진행 로그 다수):
```
[op] <number> candidates
[op] progress 100/<n> (upserted=..., skipped=..., failed=...)
...
[op] done in <600-1200>s { upserted: ~2000, skipped: ~200-700, failed: <100 }
```

failed가 너무 많으면 (>10%) 일시 네트워크 문제 가능 — 재실행으로 보충.

- [ ] **Step 2: DB 커버리지 검증**

```bash
sqlite3 data/company-map.db "SELECT COUNT(*) AS total FROM financial_snapshots;"
sqlite3 data/company-map.db "SELECT latest_reprt_code, COUNT(*) FROM financial_snapshots GROUP BY latest_reprt_code ORDER BY 2 DESC;"
```

Expected: 1,500+ snapshots, 보고서 코드 분포(11014/11012/11013/11011).

- [ ] **Step 3: 대표 종목 sanity**

```bash
sqlite3 data/company-map.db "SELECT code, latest_bsns_year, latest_reprt_code, op_income, op_income_yoy_base, op_income_prev_report FROM financial_snapshots WHERE code IN ('005930', '000660', '035420');"
```
삼성전자(005930), SK하이닉스(000660), NAVER(035420) — 3개 모두 row 존재 + 영업이익 양수 기대 (단, 손실 분기면 음수도 가능).

- [ ] **Step 4: VIP 보유 종목 sanity**

```bash
sqlite3 data/company-map.db "
SELECT v.code, v.corp_name, f.op_income, f.op_income_yoy_base
FROM vip_holdings v
LEFT JOIN financial_snapshots f ON v.code = f.code
WHERE f.op_income IS NOT NULL
LIMIT 10;"
```
VIP 보유 종목 중 영업이익 fetched된 row 확인.

검증만 — 커밋 없음.

---

## Task 7: Server Action `getStocksExplorer` 확장

**Files:**
- Modify: `apps/company-map/src/actions/stocks-explorer.ts`

- [ ] **Step 1: `StocksExplorerRow`에 4 필드 추가**

기존 `StocksExplorerRow` interface 끝(`vipLatestRceptDt: string | null;` 다음)에:
```ts
  opIncome: number | null;
  opIncomeYoyBase: number | null;
  opIncomePrevReport: number | null;
  latestReprtCode: string | null;
```

- [ ] **Step 2: `include`에 `financialSnapshot: true` 추가**

기존 `findMany` 호출의 `include` 객체 끝에:
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
},
```

- [ ] **Step 3: row 매핑에 4 필드 채우기**

`masters.map((m) => (...))` 객체 끝에 (기존 `vipLatestRceptDt` 다음):
```ts
  opIncome: m.financialSnapshot?.opIncome != null ? Number(m.financialSnapshot.opIncome) : null,
  opIncomeYoyBase: m.financialSnapshot?.opIncomeYoyBase != null ? Number(m.financialSnapshot.opIncomeYoyBase) : null,
  opIncomePrevReport: m.financialSnapshot?.opIncomePrevReport != null ? Number(m.financialSnapshot.opIncomePrevReport) : null,
  latestReprtCode: m.financialSnapshot?.latestReprtCode ?? null,
```

- [ ] **Step 4: 컴파일 + 테스트**

```bash
cd apps/company-map
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0; 80 tests pass.

- [ ] **Step 5: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/actions/stocks-explorer.ts
git commit -m "$(cat <<'EOF'
feat(company-map): expose op_income fields via getStocksExplorer

StocksExplorerRow now carries opIncome, opIncomeYoyBase,
opIncomePrevReport, and latestReprtCode for the new growth columns.
BigInt → Number safe (max ~조 < 2^53).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 클라이언트 UI — YoY/QoQ 컬럼

**Files:**
- Modify: `apps/company-map/src/app/stocks/StocksExplorerClient.tsx`

- [ ] **Step 1: import 추가**

`StocksExplorerClient.tsx` 상단 import 영역(`formatStockRatio` import 다음 또는 옆)에:
```ts
import { computeGrowth, formatGrowth, growthColorClass } from "@/lib/format-growth";
```

- [ ] **Step 2: `titleFor` 헬퍼 추가**

컴포넌트 함수 안 (state 선언 옆) 또는 컴포넌트 외부 모듈 스코프에 추가. 외부 스코프가 깔끔:

```ts
function titleForGrowth(
  latestReprtCode: string | null,
  kind: "yoy" | "qoq",
): string {
  const base = kind === "yoy" ? "전년 동기 누계" : "직전 보고 누계";
  const reportLabel = latestReprtCode
    ? ({ "11011": "사업", "11013": "1분기", "11012": "반기", "11014": "3분기" } as Record<string, string>)[latestReprtCode] ?? latestReprtCode
    : "?";
  return `${base} 기준 (최신: ${reportLabel})`;
}
```

`MARKET_OPTIONS`/`SORT_OPTIONS` 같은 모듈 스코프 상수 옆이 자연스러움.

- [ ] **Step 3: 헤더에 YoY/QoQ 컬럼 추가**

기존 `<th>VIP</th>` 다음에:

```tsx
<th className="p-2 font-medium text-right">YoY</th>
<th className="p-2 font-medium text-right">QoQ</th>
```

- [ ] **Step 4: 각 row의 VIP 셀 다음에 두 셀 추가**

기존 VIP `<td>` 다음에:

```tsx
{(() => {
  const yoy = computeGrowth(r.opIncome, r.opIncomeYoyBase);
  return (
    <td
      className={`p-2 text-right font-mono ${growthColorClass(yoy)}`}
      title={titleForGrowth(r.latestReprtCode, "yoy")}
    >
      {formatGrowth(yoy)}
    </td>
  );
})()}
{(() => {
  const qoq = computeGrowth(r.opIncome, r.opIncomePrevReport);
  return (
    <td
      className={`p-2 text-right font-mono ${growthColorClass(qoq)}`}
      title={titleForGrowth(r.latestReprtCode, "qoq")}
    >
      {formatGrowth(qoq)}
    </td>
  );
})()}
```

- [ ] **Step 5: `colSpan` 갱신**

빈 상태 row + expand row 모두 `colSpan={10}` → `colSpan={12}`:

Find:
```tsx
<td colSpan={10} className="p-6 text-center text-gray-500">
  조건에 맞는 종목이 없습니다.
</td>
```
Change `colSpan={10}` → `colSpan={12}`.

Find expand row:
```tsx
<td colSpan={10} className="p-3">
  <div className="text-xs font-semibold ...">
    브이아이피자산운용 보유 공시 (최근 6개월)
  </div>
  ...
</td>
```
Change `colSpan={10}` → `colSpan={12}`.

- [ ] **Step 6: 컴파일 + lint + 테스트**

```bash
cd apps/company-map
npx tsc --noEmit
npx eslint src/app/stocks src/lib/format-growth.ts src/actions/stocks-explorer.ts
npx vitest run
```
Expected: tsc EXIT=0; 새 eslint 에러 없음(기존 AppMenu.tsx 경고만 유지); 80 tests pass.

- [ ] **Step 7: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/app/stocks/StocksExplorerClient.tsx
git commit -m "$(cat <<'EOF'
feat(company-map): render YoY/QoQ growth columns in stocks table

Two new columns after VIP: computeGrowth(opIncome, opIncomeYoyBase) and
computeGrowth(opIncome, opIncomePrevReport). Sign-based color, hover
title shows base/latest report code. colSpan 10 → 12 on empty + expand
rows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 통합 검증

**Files:** 검증만 — 코드 변경 없음.

- [ ] **Step 1: dev 서버 재시작 (사용자 액션 필요)**

Prisma client schema가 바뀌었으므로 사용자가 띄운 dev 서버를 재시작해야 한다:
```
사용자 액션 필요:
1) 기존 npm run dev 중지 (Ctrl+C)
2) cd apps/company-map && npm run dev 재실행
3) ready 메시지 확인 후 진행
```

- [ ] **Step 2: 페이지 기본 동작**

브라우저: `http://localhost:3004/stocks`
- HTTP 200 정상 로드
- 표 마지막 두 컬럼 "YoY" / "QoQ" 노출
- 시총 상위 종목들에 % 수치 표시 (+/−)
- 색상: + 초록, − 빨강, 흑전/적전은 진한 색 + 굵게

- [ ] **Step 3: 대표 종목 확인**

검색에 "삼성전자" → 005930 row 확인:
- YoY/QoQ 둘 다 % 표시 (또는 적자 분기면 흑전/적전/적자 텍스트)
- 셀 hover 시 title "전년 동기 누계 기준 (최신: 3분기)" 등 노출

- [ ] **Step 4: 비분석 종목 확인**

DART corpCode 없는 종목(예: 우선주, 비상장 자회사) → YoY/QoQ "—" 회색.

- [ ] **Step 5: VIP 필터 호환**

`http://localhost:3004/stocks?vip=1`
- VIP 보유 종목 표시 + 새 컬럼 정상
- 한라IMS expand 클릭 → expand row colSpan 12로 펼쳐짐 (레이아웃 깨지지 않음)

- [ ] **Step 6: 회귀**

다음 페이지 모두 정상 로드:
- `/stocks` (필터 없이)
- `/companies`, `/top-stocks`, `/ncav`, `/trade`, `/calculator`

NCAV worker 정상 동작:
```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx tsx scripts/smoke-load-krx.ts 2>&1 | tail -5
```
Expected: 정상 종료, 새 financialSnapshot relation 추가가 stock_masters upsert에 영향 없음.

- [ ] **Step 7: 전체 테스트**

```bash
cd apps/company-map
npx vitest run
```
Expected: 80 tests pass across 9 files.

검증만 — 별도 커밋 없음. plan 완료.

---

## Self-Review Notes

**Spec coverage:**
- `FinancialSnapshot` 모델 → Task 1 ✓
- DART `extractOpIncome` 연결 우선 → Task 2 ✓
- 자동 보고서 탐지 (11014→11012→11013→11011) → Task 3 ✓
- 직전 보고서 매핑 (11014→11012, 11012→11013, 11013→prev 11011, 11011→prev 11014) → Task 3 ✓
- `computeGrowth`/`formatGrowth`/`growthColorClass` (6 kinds) → Task 4 ✓
- 수동 트리거 스크립트 + 진행률 로그 → Task 5 ✓
- 실 DART 호출 + DB 검증 → Task 6 ✓
- Server Action 4 필드 노출 → Task 7 ✓
- UI YoY/QoQ 컬럼 + hover title + colSpan 12 → Task 8 ✓
- 통합 검증 + 회귀 → Task 9 ✓

**Type consistency:**
- `OpIncomeReport { bsnsYear, reprtCode, thstrm, frmtrm }` (Task 2) ↔ Task 3·5에서 동일 shape 사용 ✓
- `GrowthCell` discriminated union 6 kinds (Task 4) ↔ `formatGrowth`/`growthColorClass` switch 6 case 일치 ✓
- `StocksExplorerRow.opIncome / opIncomeYoyBase / opIncomePrevReport / latestReprtCode` (Task 7) ↔ UI `computeGrowth(r.opIncome, r.opIncomeYoyBase)` (Task 8) 일치 ✓
- Prisma 컬럼 (op_income, op_income_yoy_base, op_income_prev_report) ↔ Task 7 매핑의 camelCase (opIncome 등) 일치 ✓
- `prevReportFor(latest)` (Task 3) ↔ spec 매핑 표 모든 path 정의 ✓

**Placeholder scan:** 없음. 각 step에 실제 코드 + 명령 + 예상 출력. `<ts>_add_financial_snapshot`는 Prisma 자동 생성 명명.
