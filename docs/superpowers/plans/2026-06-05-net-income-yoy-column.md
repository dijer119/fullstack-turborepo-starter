# 순이익(당기순이익) YoY 컬럼 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks` 리스트에 당기순이익 전년동기 대비(YoY) 컬럼을 추가한다(기존 영업이익 YoY 옆).

**Architecture:** 순이익은 영업이익을 가져오는 동일한 DART `fnlttSinglAcnt` 응답에 `당기순이익(손실)`로 들어있다. `refresh-operating-income` 루프에서 같은 응답을 한 번 더 파싱해 `FinancialSnapshot`에 순이익 3필드를 저장하고(추가 DART 호출 0), 액션→UI로 노출한다.

**Tech Stack:** Next.js App Router, Prisma(SQLite, `@prisma-clients/company-map`), Vitest, Tailwind, DART OpenAPI.

**Spec:** `apps/company-map/docs/superpowers/specs/2026-06-05-net-income-yoy-column.html`

> 모든 명령은 `apps/company-map/`에서 실행. 커밋은 사용자가 자동 커밋을 허용한 경우에만(각 Task 끝 commit). `.env`의 `DATABASE_URL`(=`file:../data/company-map.db`)을 **오버라이드하지 말 것** — 그래야 실제 DB에 마이그레이션이 적용된다.

---

## File Structure

| 파일 | 변경 |
|------|------|
| `prisma/schema.prisma` | `FinancialSnapshot`에 `netIncome`/`netIncomeYoyBase`/`netIncomeYoyPct` 추가 |
| `src/lib/dart/operating-income.ts` | `extractNetIncome()` 추가 (extractOpIncome 패턴) |
| `src/lib/dart/operating-income.test.ts` | `extractNetIncome` 테스트 추가 |
| `scripts/refresh-operating-income.ts` | 같은 응답에서 순이익도 수집 → snapshot upsert |
| `src/actions/stocks-explorer.ts` | row에 `netIncome`/`netIncomeYoyBase` 노출 |
| `src/app/stocks/StocksExplorerClient.tsx` | "YoY"→"영업이익 YoY", "순이익 YoY" 컬럼 추가, colSpan +1 |

---

## Task 1: 스키마 — FinancialSnapshot에 순이익 필드 추가

**Files:**
- Modify: `prisma/schema.prisma` (model FinancialSnapshot)

- [ ] **Step 1: 필드 추가**

`prisma/schema.prisma`의 `model FinancialSnapshot`에서 `opIncomeYoyPct` 줄 다음에 3줄을 추가한다:

```prisma
  opIncomeYoyPct     Float?   @map("op_income_yoy_pct")
  netIncome          BigInt?  @map("net_income")
  netIncomeYoyBase   BigInt?  @map("net_income_yoy_base")
  netIncomeYoyPct    Float?   @map("net_income_yoy_pct")
  fetchedAt          DateTime @default(now()) @map("fetched_at")
```
(즉 기존 `opIncomeYoyPct`와 `fetchedAt` 사이에 net income 3줄 삽입.)

- [ ] **Step 2: 마이그레이션 생성·적용**

Run: `npx prisma migrate dev --name add_net_income_to_financial_snapshot`
Expected: 마이그레이션 생성·적용 + Prisma Client 재생성. (major-version 경고는 무시.)

- [ ] **Step 3: 컬럼 확인**

Run: `sqlite3 data/company-map.db "SELECT name FROM pragma_table_info('financial_snapshots') WHERE name LIKE 'net_income%';"`
Expected 출력:
```
net_income
net_income_yoy_base
net_income_yoy_pct
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (스키마/클라이언트만 바뀜; 아직 사용처 없음).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(company-map): add net income fields to FinancialSnapshot"
```

---

## Task 2: extractNetIncome (순수 함수, TDD)

**Files:**
- Modify: `src/lib/dart/operating-income.ts`
- Test: `src/lib/dart/operating-income.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`src/lib/dart/operating-income.test.ts` 끝(마지막 `});` 다음)에 추가. 먼저 import 줄을 수정한다:

기존:
```ts
import { extractOpIncome } from "./operating-income";
```
변경:
```ts
import { extractOpIncome, extractNetIncome } from "./operating-income";
```

파일 끝에 describe 블록 추가:
```ts
describe("extractNetIncome", () => {
  it("returns 연결 당기순이익(손실), 별도/세전이익/포괄손익은 제외", () => {
    const r = extractNetIncome({
      status: "000",
      list: [
        { account_nm: "영업이익", fs_nm: "연결재무제표", thstrm_amount: "5,000,000,000", frmtrm_amount: "3,800,000,000" },
        { account_nm: "법인세차감전 순이익", fs_nm: "연결재무제표", thstrm_amount: "13,545,563,000,000", frmtrm_amount: "10,320,412,000,000" },
        { account_nm: "당기순이익(손실)", fs_nm: "재무제표", thstrm_amount: "10,668,573,000,000", frmtrm_amount: "5,694,610,000,000" },
        { account_nm: "당기순이익(손실)", fs_nm: "연결재무제표", thstrm_amount: "12,225,747,000,000", frmtrm_amount: "10,100,904,000,000" },
        { account_nm: "총포괄손익", fs_nm: "연결재무제표", thstrm_amount: "999", frmtrm_amount: "999" },
      ],
    });
    expect(r).toEqual({ thstrm: 12_225_747_000_000n, frmtrm: 10_100_904_000_000n });
  });

  it("연결이 없으면 별도(재무제표)로 폴백", () => {
    const r = extractNetIncome({
      status: "000",
      list: [
        { account_nm: "당기순이익(손실)", fs_nm: "재무제표", thstrm_amount: "1,000,000,000", frmtrm_amount: "900,000,000" },
      ],
    });
    expect(r).toEqual({ thstrm: 1_000_000_000n, frmtrm: 900_000_000n });
  });

  it("'당기순이익' (괄호 없음) 표기도 매칭", () => {
    const r = extractNetIncome({
      status: "000",
      list: [
        { account_nm: "당기순이익", fs_nm: "연결재무제표", thstrm_amount: "-1,500", frmtrm_amount: "2,000" },
      ],
    });
    expect(r).toEqual({ thstrm: -1_500n, frmtrm: 2_000n });
  });

  it("당기순이익 행이 없으면 null", () => {
    expect(
      extractNetIncome({ status: "000", list: [{ account_nm: "영업이익", thstrm_amount: "1", frmtrm_amount: "1" }] }),
    ).toBeNull();
  });

  it("status != '000'이면 null", () => {
    expect(extractNetIncome({ status: "013", list: [] })).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/dart/operating-income.test.ts`
Expected: FAIL — `extractNetIncome` is not exported / not a function.

- [ ] **Step 3: 구현 추가**

`src/lib/dart/operating-income.ts`에서 `extractOpIncome` 함수 정의 **바로 다음**에 추가(같은 파일의 private `parseAmount`/`DartResponse`/`DartListItem` 재사용):

```ts
/** 당기순이익 row 추출. extractOpIncome과 동일 규칙(연결 우선).
 *  "법인세차감전 순이익"·"총포괄손익"은 이름 집합에 없으므로 제외된다. */
export function extractNetIncome(
  response: unknown,
): { thstrm: bigint; frmtrm: bigint } | null {
  const r = response as DartResponse;
  if (r.status !== "000") return null;
  const list = r.list ?? [];

  const NET_INCOME_NAMES = new Set(["당기순이익", "당기순이익(손실)"]);
  const candidates = list
    .filter((item) => NET_INCOME_NAMES.has(item.account_nm ?? ""))
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

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/dart/operating-income.test.ts`
Expected: PASS (기존 extractOpIncome 테스트 + 신규 extractNetIncome 5개 모두 통과).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dart/operating-income.ts src/lib/dart/operating-income.test.ts
git commit -m "feat(company-map): extract net income from DART financial response"
```

---

## Task 3: 수집 — refresh-operating-income.ts에서 순이익도 저장

**Files:**
- Modify: `scripts/refresh-operating-income.ts`

- [ ] **Step 1: import + collected 타입에 순이익 추가**

import 줄 수정:
```ts
import { extractOpIncome, type ReprtCode } from "@/lib/dart/operating-income";
```
→
```ts
import { extractOpIncome, extractNetIncome, type ReprtCode } from "@/lib/dart/operating-income";
```

`collected` 선언을 다음으로 변경:
```ts
    const collected: Array<{
      bsnsYear: number;
      reprtCode: ReprtCode;
      thstrm: bigint;
      frmtrm: bigint;
      niThstrm: bigint | null;
      niFrmtrm: bigint | null;
    }> = [];
```

- [ ] **Step 2: 같은 응답에서 순이익 추출해 push**

기존 push 블록:
```ts
          const op = extractOpIncome(resp);
          if (!op) continue;
          collected.push({
            bsnsYear: year,
            reprtCode: code,
            thstrm: op.thstrm,
            frmtrm: op.frmtrm,
          });
```
변경:
```ts
          const op = extractOpIncome(resp);
          if (!op) continue;
          const ni = extractNetIncome(resp); // 같은 응답 재사용 (추가 DART 호출 없음)
          collected.push({
            bsnsYear: year,
            reprtCode: code,
            thstrm: op.thstrm,
            frmtrm: op.frmtrm,
            niThstrm: ni?.thstrm ?? null,
            niFrmtrm: ni?.frmtrm ?? null,
          });
```

- [ ] **Step 3: 스냅샷 upsert에 순이익 3필드 추가**

기존 yoyPct 계산 블록 다음(`const yoyPct = ...;` 줄 뒤)에 순이익 YoY 계산 추가:
```ts
      const niBase = latest.niFrmtrm != null ? Number(latest.niFrmtrm) : NaN;
      const niCurr = latest.niThstrm != null ? Number(latest.niThstrm) : NaN;
      const netIncomeYoyPct =
        Number.isFinite(niBase) && niBase !== 0 && Number.isFinite(niCurr)
          ? ((niCurr - niBase) / Math.abs(niBase)) * 100
          : null;
```

그리고 `db.financialSnapshot.upsert`의 `create`와 `update` 객체 **양쪽 모두**에 3줄씩 추가한다.

`create`: 기존
```ts
          opIncome: latest.thstrm,
          opIncomeYoyBase: latest.frmtrm,
          opIncomePrevReport: prev?.thstrm ?? null,
          opIncomeYoyPct: yoyPct,
```
→ 다음을 이어서 추가:
```ts
          opIncome: latest.thstrm,
          opIncomeYoyBase: latest.frmtrm,
          opIncomePrevReport: prev?.thstrm ?? null,
          opIncomeYoyPct: yoyPct,
          netIncome: latest.niThstrm,
          netIncomeYoyBase: latest.niFrmtrm,
          netIncomeYoyPct,
```

`update`: 기존
```ts
          opIncome: latest.thstrm,
          opIncomeYoyBase: latest.frmtrm,
          opIncomePrevReport: prev?.thstrm ?? null,
          opIncomeYoyPct: yoyPct,
          fetchedAt: new Date(),
```
→
```ts
          opIncome: latest.thstrm,
          opIncomeYoyBase: latest.frmtrm,
          opIncomePrevReport: prev?.thstrm ?? null,
          opIncomeYoyPct: yoyPct,
          netIncome: latest.niThstrm,
          netIncomeYoyBase: latest.niFrmtrm,
          netIncomeYoyPct,
          fetchedAt: new Date(),
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (Task 1 마이그레이션으로 net income 필드가 클라이언트 타입에 존재).

- [ ] **Step 5: Commit**

```bash
git add scripts/refresh-operating-income.ts
git commit -m "feat(company-map): collect net income YoY in financial refresh"
```

---

## Task 4: 액션 — StocksExplorerRow에 순이익 노출

**Files:**
- Modify: `src/actions/stocks-explorer.ts`

- [ ] **Step 1: row 인터페이스에 필드 추가**

`StocksExplorerRow` 인터페이스에서 `opIncomePrevReport: number | null;` 줄 다음에 추가:
```ts
  opIncomePrevReport: number | null;
  netIncome: number | null;
  netIncomeYoyBase: number | null;
  latestReprtCode: string | null;
```
(즉 `opIncomePrevReport`와 `latestReprtCode` 사이에 2줄 삽입.)

- [ ] **Step 2: row 매핑에 추가**

row를 만드는 `.map((m) => ({ ... }))`에서 `opIncomeYoyBase: ...` 줄 다음에 추가:
```ts
    opIncomeYoyBase: m.financialSnapshot?.opIncomeYoyBase != null ? Number(m.financialSnapshot.opIncomeYoyBase) : null,
    netIncome: m.financialSnapshot?.netIncome != null ? Number(m.financialSnapshot.netIncome) : null,
    netIncomeYoyBase: m.financialSnapshot?.netIncomeYoyBase != null ? Number(m.financialSnapshot.netIncomeYoyBase) : null,
```
(`include: { financialSnapshot: true }`이므로 새 스칼라 필드는 자동 포함됨 — 별도 include 변경 불필요.)

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/actions/stocks-explorer.ts
git commit -m "feat(company-map): expose net income YoY in stocks explorer row"
```

---

## Task 5: UI — "순이익 YoY" 컬럼 추가

**Files:**
- Modify: `src/app/stocks/StocksExplorerClient.tsx`

- [ ] **Step 1: YoY 헤더 라벨 변경 + 순이익 헤더 추가**

기존 YoY `<th>`:
```tsx
              <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 text-right font-medium dark:border-gray-700 dark:bg-gray-900">YoY</th>
```
변경(라벨 변경 + 바로 뒤에 순이익 헤더 1개 추가):
```tsx
              <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 text-right font-medium dark:border-gray-700 dark:bg-gray-900">영업이익 YoY</th>
              <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 text-right font-medium dark:border-gray-700 dark:bg-gray-900">순이익 YoY</th>
```

- [ ] **Step 2: 순이익 YoY 셀 추가**

기존 영업이익 YoY 셀 IIFE:
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
```
바로 **다음에** 순이익 셀 IIFE 추가:
```tsx
                  {(() => {
                    const niYoy = computeGrowth(r.netIncome, r.netIncomeYoyBase);
                    return (
                      <td
                        className={`p-2 text-right font-mono ${growthColorClass(niYoy)}`}
                        title={titleForGrowth(r.latestReprtCode, "yoy")}
                      >
                        {formatGrowth(niYoy)}
                      </td>
                    );
                  })()}
```

- [ ] **Step 3: colSpan 보정 (15 → 16)**

이 파일의 `colSpan={15}` **2곳**(VIP 확장 행, "조건에 맞는 종목이 없습니다" 빈 상태 행)을 모두 `colSpan={16}`으로 변경.

Run(확인): `grep -n "colSpan=" src/app/stocks/StocksExplorerClient.tsx`
Expected: 변경 후 `colSpan={16}` 2곳, `colSpan={15}` 0곳.

- [ ] **Step 4: 타입체크 + lint**

Run: `npx tsc --noEmit && yarn lint 2>&1 | grep -i "StocksExplorerClient" || echo "no lint errors in file"`
Expected: tsc 에러 없음, 해당 파일 lint 에러 없음(기존 다른 파일의 사전 존재 에러는 무관).

- [ ] **Step 5: Commit**

```bash
git add "src/app/stocks/StocksExplorerClient.tsx"
git commit -m "feat(company-map): add 순이익 YoY column to stocks list"
```

---

## Task 6: 검증 + 백필 안내

**Files:** (없음 — 실행/문서)

- [ ] **Step 1: 전체 타입체크 + 관련 테스트**

Run: `npx tsc --noEmit && npx vitest run src/lib/dart/operating-income.test.ts`
Expected: tsc 클린, op-income 테스트 전부 통과.

- [ ] **Step 2: 백필 안내 (실행은 사용자 판단)**

기존 `FinancialSnapshot` 행에는 순이익 필드가 비어 있어, UI에서 순이익 YoY가 "—"로 보인다. 채우려면 **수동 잡 `operating_income`("데이터 업데이트")을 1회 재실행**해야 한다(전종목 DART 호출 → 일일 한도 소비, CLAUDE.md 주의 사항). 이 plan에서는 자동 실행하지 않는다.

- [ ] **Step 3: (백필 후) 화면 확인**

`operating_income` 재실행 후 `/stocks`에서 "영업이익 YoY"·"순이익 YoY" 두 컬럼이 값(또는 흑전/적전/적자↑↓)으로 표시되는지 확인. company-map dev 서버는 Prisma 스키마 변경 반영을 위해 재시작 필요.

---

## Self-Review 결과

- **Spec coverage:** 스키마(T1)·extractNetIncome(T2)·수집 재사용(T3)·액션 노출(T4)·UI 라벨+컬럼+colSpan(T5)·테스트(T2)·백필 안내(T6) 모두 매핑됨.
- **Placeholder scan:** 모든 step에 실제 코드/명령 포함. 미해결 placeholder 없음.
- **Type consistency:** `netIncome`/`netIncomeYoyBase`/`netIncomeYoyPct`(스키마=T1) ↔ `extractNetIncome`(T2) ↔ `niThstrm`/`niFrmtrm`→스냅샷(T3) ↔ row `netIncome`/`netIncomeYoyBase`(T4) ↔ UI `computeGrowth(r.netIncome, r.netIncomeYoyBase)`(T5) 일치. `computeGrowth`는 `bigint|number|null` 허용(확인됨).
