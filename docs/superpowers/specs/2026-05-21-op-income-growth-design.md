# 영업이익 성장 비교 (YoY / QoQ) — 전종목 조회 컬럼 추가

## Context

`/stocks` 전종목 조회 페이지는 현재 시가총액·PER/PBR·배당·안전마진·VIP 보유 정보를 보여준다. 사용자는 종목의 **수익성 추세** — 영업이익이 전년 동기·직전 보고 대비 얼마나 성장했는지 — 를 같은 표에서 한눈에 보고 싶어한다.

문제:
- 영업이익 절대값은 DART에서 fetch 가능하지만, 수동으로 각 종목 보고서를 열어 비교해야 함.
- 종목별 보고서 시점(분기/반기/3Q/사업)이 제각각이라 비교 base를 자동으로 맞춰야 함.
- 영업이익이 음수 ↔ 양수로 전환된 경우 단순 % 계산은 의미가 없어 별도 표기 필요.

해결:
- OpenDART `fnlttSinglAcnt.json`을 자동 보고서 탐지 로직(현재 → 직전 단계)으로 종목당 최대 2회 호출.
- 응답에 함께 오는 `thstrm_amount`(당기 누계) + `frmtrm_amount`(전년 동기 누계)로 YoY 즉시 계산.
- 매칭된 보고서의 한 단계 이전 보고서를 추가 호출해 QoQ 계산.
- `FinancialSnapshot` 모델에 raw 영업이익 3개 값 저장. 성장률(%)·흑전·적전 분기는 표시 시점에 `computeGrowth` 유틸이 계산.
- 전종목 조회 표에 "YoY" / "QoQ" 컬럼 2개 추가, 부호별 색상 + 흑전/적전 텍스트.

전제:
- DART_API_KEY는 `.env`에 있음.
- `StockMaster.corpCode`는 일부 종목만 채워져 있을 수 있음 → corpCode null인 종목은 skip.
- DART rate limit (분당 ~1,000회) 친절히 사용: 호출 간 100ms sleep → 분당 ~600 페이스.
- 대상 종목 약 2,800개 × 평균 2회 호출 → 10–20분 소요 예상.

## 사용자 결정사항 요약

- 대상: **전종목 조회 전체** (~2,800 stockMaster row)
- 비교: **YoY (전년 동기 누계) + QoQ (직전 보고 누계)** 모두
- 표시: 전종목 조회 **표에 2개 컬럼 추가** (별도 expand 없이)
- 갱신: **수동 트리거 스크립트** (`scripts/refresh-operating-income.ts`)

## 비교 의미와 한계 (사용자에게 명시)

- 라벨은 정확히 **"YoY (전년 동기 누계)"**, **"QoQ (직전 보고 누계)"**.
- 분기 단독 영업이익 비교가 아니라 **누계 기준**. 1Q 보고서면 1Q 단독이지만, 반기/3Q/사업 보고서는 누계.
- 4Q 단독 계산(= 사업 − 3Q)은 복잡도 대비 가치 낮아 YAGNI로 제외.
- 영업이익 음수 ↔ 양수 전환은 % 무의미 → "흑전" / "적전" / "적자↑" / "적자↓" 텍스트로 표기.

## 변경 파일 목록

| 영역 | 파일 | 상태 |
|---|---|---|
| Prisma | `apps/company-map/prisma/schema.prisma` | 수정 — `FinancialSnapshot` 모델 + `StockMaster.financialSnapshot` relation |
| Migration | `apps/company-map/prisma/migrations/<ts>_add_financial_snapshot/` | 신규 |
| DART fetcher | `apps/company-map/src/lib/dart/operating-income.ts` | 신규 |
| Fixture | `apps/company-map/tests/fixtures/dart-fnltt-op-income.json` | 신규 |
| Fetcher 테스트 | `apps/company-map/src/lib/dart/operating-income.test.ts` | 신규 |
| 성장률 유틸 | `apps/company-map/src/lib/format-growth.ts` | 신규 |
| 유틸 테스트 | `apps/company-map/src/lib/format-growth.test.ts` | 신규 |
| 트리거 스크립트 | `apps/company-map/scripts/refresh-operating-income.ts` | 신규 |
| Server Action | `apps/company-map/src/actions/stocks-explorer.ts` | 수정 — 4 필드 추가 + include |
| 페이지 클라이언트 | `apps/company-map/src/app/stocks/StocksExplorerClient.tsx` | 수정 — YoY/QoQ 컬럼, colSpan 12 |

## 단계별 설계

### 1. Prisma 스키마

`StockMaster`에 relation 추가:
```prisma
model StockMaster {
  // ... 기존 필드
  financialSnapshot FinancialSnapshot?
  // ... 기존 relations
}
```

신규 모델 (schema 끝부분에 추가):
```prisma
model FinancialSnapshot {
  code               String   @id
  latestBsnsYear     Int      @map("latest_bsns_year")
  latestReprtCode    String   @map("latest_reprt_code")     // "11011" | "11013" | "11012" | "11014"
  opIncome           BigInt?  @map("op_income")              // 당기 누계 영업이익 (원)
  opIncomeYoyBase    BigInt?  @map("op_income_yoy_base")     // 전년 동기 누계 (frmtrm)
  opIncomePrevReport BigInt?  @map("op_income_prev_report")  // 직전 보고서 thstrm
  fetchedAt          DateTime @default(now()) @map("fetched_at")

  master  StockMaster @relation(fields: [code], references: [code], onDelete: Cascade)

  @@map("financial_snapshots")
}
```

마이그레이션: `npx prisma migrate dev --name add_financial_snapshot`. 새 테이블만 — 기존 데이터 영향 없음.

### 2. DART fetcher — `src/lib/dart/operating-income.ts`

```ts
import { fetchDartFinancial } from "./financial";

export type ReprtCode = "11011" | "11013" | "11012" | "11014";

export interface OpIncomeReport {
  bsnsYear: number;
  reprtCode: ReprtCode;
  thstrm: bigint;
  frmtrm: bigint;
}

/** "영업이익" account 추출. 우선순위: 연결 → 별도. */
export function extractOpIncome(
  response: unknown,
): { thstrm: bigint; frmtrm: bigint } | null;

/** 시도 순서: 올해 11014 → 11012 → 11013 → 작년 11011. 첫 매칭에서 멈춤. */
export async function findLatestOpIncomeReport(
  corpCode: string,
  now?: Date,
): Promise<OpIncomeReport | null>;

/** 매칭된 보고서의 한 단계 이전. QoQ용. */
export async function fetchPrevOpIncomeReport(
  corpCode: string,
  latest: OpIncomeReport,
): Promise<OpIncomeReport | null>;
```

`extractOpIncome` 로직:
- DART `fnlttSinglAcnt.json` 응답 `list[]`에서 `account_nm === "영업이익"` row 찾기.
- `fs_div` 또는 `fs_nm`이 "연결" 우선, 없으면 별도/개별.
- `thstrm_amount`, `frmtrm_amount` 콤마 제거 후 BigInt 변환. 빈값/"-" → null로 외부 처리.
- 매칭되는 row 없으면 null 반환.

직전 보고서 매핑 (`fetchPrevOpIncomeReport`):
- 11014 → 11012 (같은 해)
- 11012 → 11013 (같은 해)
- 11013 → 11011 (직전년도)
- 11011 → 11014 (직전년도)

### 3. Fetcher 테스트

`tests/fixtures/dart-fnltt-op-income.json`: 영업이익 row가 있는 분기 보고서 응답.

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

`operating-income.test.ts` — extractOpIncome 단위 테스트:

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
});
```

`findLatestOpIncomeReport`/`fetchPrevOpIncomeReport`는 실 DART 호출 통합 → 단위 테스트 생략, refresh 스크립트로 검증.

### 4. 성장률 유틸 — `src/lib/format-growth.ts`

```ts
export type GrowthCell =
  | { kind: "pct"; value: number }
  | { kind: "turnaround_positive" }
  | { kind: "turnaround_negative" }
  | { kind: "loss_widened" }
  | { kind: "loss_narrowed" }
  | { kind: "unavailable" };

/** curr/base 의미: 현재값 / 기준값. 둘 다 bigint(원) 또는 null. */
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

테스트는 모든 분기를 커버:

```ts
describe("computeGrowth", () => {
  it("returns pct for positive base and positive curr", () => {
    const g = computeGrowth(1200n, 1000n);
    expect(g).toEqual({ kind: "pct", value: 20 });
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
});

describe("formatGrowth", () => {
  it("formats positive pct with +", () => {
    expect(formatGrowth({ kind: "pct", value: 12.34 })).toBe("+12.3%");
  });
  it("formats negative pct with native -", () => {
    expect(formatGrowth({ kind: "pct", value: -8.7 })).toBe("-8.7%");
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
  it("green for positive pct, red for negative, gray for zero/unavail", () => {
    expect(growthColorClass({ kind: "pct", value: 1 })).toContain("green");
    expect(growthColorClass({ kind: "pct", value: -1 })).toContain("red");
    expect(growthColorClass({ kind: "pct", value: 0 })).toContain("gray");
    expect(growthColorClass({ kind: "unavailable" })).toContain("gray");
  });
  it("turnaround uses font-semibold for emphasis", () => {
    expect(growthColorClass({ kind: "turnaround_positive" })).toContain("font-semibold");
    expect(growthColorClass({ kind: "turnaround_negative" })).toContain("font-semibold");
  });
});
```

### 5. 수동 트리거 — `scripts/refresh-operating-income.ts`

```ts
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

  let upserted = 0, skipped = 0, failed = 0;
  for (let i = 0; i < masters.length; i++) {
    const m = masters[i];
    if (!m.corpCode) { skipped++; continue; }
    try {
      const latest = await findLatestOpIncomeReport(m.corpCode);
      await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
      if (!latest) { skipped++; continue; }
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
      console.log(`[op] progress ${i + 1}/${masters.length} (upserted=${upserted}, skipped=${skipped}, failed=${failed})`);
    }
  }
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`[op] done in ${elapsed}s { upserted: ${upserted}, skipped: ${skipped}, failed: ${failed} }`);
  process.exit(0);
})();
```

dotenv 로드는 worker/db가 어떻게 처리하는지 따라가되, 필요 시 기존 `refresh-vip-holdings.ts` 패턴 (`import "../worker/setup-env"` 또는 인라인 dotenv) 그대로 사용.

### 6. Server Action 확장

`StocksExplorerRow`에 4 필드 추가:
```ts
opIncome: number | null;
opIncomeYoyBase: number | null;
opIncomePrevReport: number | null;
latestReprtCode: string | null;
```

`findMany`의 `include`에 추가:
```ts
include: {
  analysis: true,
  vipHoldings: { orderBy: { rceptDt: "desc" }, take: 1, select: { rceptDt: true } },
  _count: { select: { vipHoldings: true } },
  financialSnapshot: true,
},
```

매핑:
```ts
opIncome: m.financialSnapshot?.opIncome != null ? Number(m.financialSnapshot.opIncome) : null,
opIncomeYoyBase: m.financialSnapshot?.opIncomeYoyBase != null ? Number(m.financialSnapshot.opIncomeYoyBase) : null,
opIncomePrevReport: m.financialSnapshot?.opIncomePrevReport != null ? Number(m.financialSnapshot.opIncomePrevReport) : null,
latestReprtCode: m.financialSnapshot?.latestReprtCode ?? null,
```

### 7. 클라이언트 UI 변경

import 추가:
```ts
import { computeGrowth, formatGrowth, growthColorClass } from "@/lib/format-growth";
```

`<thead>`에 컬럼 2개 추가 (VIP 컬럼 다음, 또는 안전마진 다음 — VIP 다음이 자연스러움):
```tsx
<th className="p-2 font-medium text-right">YoY</th>
<th className="p-2 font-medium text-right">QoQ</th>
```

각 row의 셀 (VIP 셀 다음):
```tsx
{(() => {
  const yoy = computeGrowth(r.opIncome, r.opIncomeYoyBase);
  return (
    <td className={`p-2 text-right font-mono ${growthColorClass(yoy)}`} title={titleFor(r, "yoy")}>
      {formatGrowth(yoy)}
    </td>
  );
})()}
{(() => {
  const qoq = computeGrowth(r.opIncome, r.opIncomePrevReport);
  return (
    <td className={`p-2 text-right font-mono ${growthColorClass(qoq)}`} title={titleFor(r, "qoq")}>
      {formatGrowth(qoq)}
    </td>
  );
})()}
```

`titleFor`는 컴포넌트 안 인라인 함수:
```ts
function titleFor(r: StocksExplorerRow, kind: "yoy" | "qoq"): string {
  const yearStr = r.latestReprtCode ? `${r.latestReprtCode}` : "";
  const base = kind === "yoy" ? "전년 동기 누계" : "직전 보고 누계";
  return `${base} 기준 (보고: ${yearStr})`;
}
```

`colSpan` 변경: empty state + expand row 모두 `colSpan={10}` → `colSpan={12}`.

`<tr ...>` 자체 hover는 그대로. ratio 셀과 동일하게 `font-mono`로 숫자 가독성.

## Verification

### 1. 마이그레이션
```bash
cd apps/company-map
npx prisma migrate dev --name add_financial_snapshot
```
→ `financial_snapshots` 테이블만 생성 (`ALTER TABLE` 없음).

### 2. 트리거 스크립트 (live)
```bash
npx tsx scripts/refresh-operating-income.ts
```
예상 출력:
```
[op] 2820 candidates
[op] progress 100/2820 ...
...
[op] done in 900s { upserted: ~2000, skipped: ~700, failed: ~120 }
```
- skipped: corpCode 없거나 보고서 없음 (비상장 자회사 등)
- failed: DART 일시 오류 — 재실행 시 보충

### 3. DB 검증
```sql
-- 커버리지
SELECT COUNT(*) FROM financial_snapshots;

-- 영업이익 있는 종목 분포
SELECT latest_reprt_code, COUNT(*) FROM financial_snapshots GROUP BY latest_reprt_code;

-- 삼성전자 검증
SELECT code, latest_bsns_year, latest_reprt_code,
       op_income, op_income_yoy_base, op_income_prev_report
FROM financial_snapshots WHERE code='005930';
```

### 4. UI 동작 (dev 재시작 후)
- `/stocks` → 표 마지막 두 컬럼 "YoY" / "QoQ" 노출
- 시가총액 상위 종목들에 % 수치 표시 (초록/빨강)
- 적자 종목 또는 흑전/적전 종목에 "흑전" / "적전" / "적자↑" / "적자↓" 텍스트
- 데이터 없는 종목은 "—" (회색)
- 셀 hover 시 title: "전년 동기 누계 기준 (보고: 11013)" 등

### 5. 회귀
- `/stocks?vip=1` 정상 동작 (VIP 컬럼 + 새 컬럼 둘 다 표시)
- 다른 페이지 (`/companies`, `/top-stocks`, `/ncav`, `/trade`, `/calculator`) 정상 로드
- `npm run worker` (NCAV worker) 정상 — financialSnapshot 모델 추가가 기존 쿼리에 영향 없음
