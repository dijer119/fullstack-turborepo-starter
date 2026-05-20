# VIP 자산운용 지분공시 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks` "전종목 조회" 페이지에 브이아이피자산운용(VIP)이 제출한 최근 6개월 지분공시 정보를 통합한다. 새 컬럼·필터·expand row를 추가하고, OpenDART list.json을 호출해 데이터를 수집하는 수동 트리거 스크립트를 제공한다.

**Architecture:** 새 `VipHolding` 테이블에 6개월치 D001/D002 공시를 upsert. OpenDART `list.json`을 corp_code 없이 `pblntf_ty=D`로 호출 후 `flr_nm` 매칭. 기존 `loadCorpCodeMap()`을 재사용해 corp_code → stock_code로 매핑. Server Action에서 `_count` + 최신 1건 include로 표 컬럼 채우고, 클릭 시 별도 Server Action으로 전체 이력 lazy load.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 6 + SQLite, vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-05-21-vip-holdings-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` | `VipHolding` 모델 + `StockMaster.vipHoldings` relation |
| `src/lib/dart/corp-code.ts` | corp_code 역방향 맵 추가 |
| `src/lib/dart/corp-code.test.ts` | reverse map 단위 테스트 (신규) |
| `src/lib/dart/disclosure-list.ts` | OpenDART list.json fetcher + 페이지네이션 |
| `src/lib/dart/disclosure-list.test.ts` | fetch mock 테스트 (신규) |
| `src/lib/dart/vip-holdings.ts` | 분류·변환·DB upsert·prune |
| `src/lib/dart/vip-holdings.test.ts` | 분류·변환 순수 함수 테스트 |
| `scripts/refresh-vip-holdings.ts` | 수동 트리거 |
| `src/actions/stocks-explorer.ts` | `vipOnly`, `vipHoldingsCount`, `vipLatestRceptDt` 확장 |
| `src/actions/vip-holdings.ts` | `getVipHoldingsByCode(code)` Server Action |
| `src/app/stocks/page.tsx` | `vipOnly` 파싱 |
| `src/app/stocks/StocksExplorerClient.tsx` | VIP 컬럼·필터·expand UI |
| `tests/fixtures/dart-disclosure-list-vip.json` | OpenDART 응답 fixture |

---

## Task 1: Prisma 스키마 + 마이그레이션

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma`
- Generated: `apps/company-map/prisma/migrations/<ts>_add_vip_holdings/`

- [ ] **Step 1: `StockMaster` 모델에 relation 추가**

`apps/company-map/prisma/schema.prisma`의 `StockMaster` 모델을 다음과 같이 수정한다 (기존 `vipHoldings` 줄이 없어야 함 — 새로 추가):

```prisma
model StockMaster {
  code      String   @id
  name      String
  market    String?
  marcap    BigInt?
  corpCode  String?  @map("corp_code")
  updatedAt DateTime @updatedAt @map("updated_at")

  analysis     StockAnalysis?
  ncavResult   NcavResult?
  vipHoldings  VipHolding[]

  @@index([name])
  @@index([market])
  @@index([marcap])
  @@map("stock_masters")
}
```

- [ ] **Step 2: 새 `VipHolding` 모델 추가**

`schema.prisma` 끝부분 (`TradeStat` 모델 뒤)에 추가:

```prisma
model VipHolding {
  rcpNo       String   @id
  code        String
  corpCode    String   @map("corp_code")
  corpName    String   @map("corp_name")
  reportNm    String   @map("report_nm")
  reportType  String   @map("report_type")
  flrNm       String   @map("flr_nm")
  rceptDt     DateTime @map("rcept_dt")
  fetchedAt   DateTime @default(now()) @map("fetched_at")

  master      StockMaster? @relation(fields: [code], references: [code], onDelete: SetNull)

  @@index([code])
  @@index([rceptDt])
  @@index([flrNm])
  @@map("vip_holdings")
}
```

- [ ] **Step 3: 마이그레이션 생성·적용**

Run:
```bash
cd apps/company-map
npx prisma migrate dev --name add_vip_holdings
```

Expected output:
```
Applying migration `<timestamp>_add_vip_holdings`
The following migration(s) have been created and applied
✔ Generated Prisma Client
```

- [ ] **Step 4: 마이그레이션 SQL 확인**

`apps/company-map/prisma/migrations/<ts>_add_vip_holdings/migration.sql` 내용 검토 — `CREATE TABLE vip_holdings` + 3개 인덱스만 있어야 한다. 다른 테이블 변경 없음.

- [ ] **Step 5: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "feat(company-map): add VipHolding model for 5%-disclosure tracking"
```

---

## Task 2: corp-code reverse map (TDD)

**Files:**
- Modify: `apps/company-map/src/lib/dart/corp-code.ts`
- Create: `apps/company-map/src/lib/dart/corp-code.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`apps/company-map/src/lib/dart/corp-code.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as corpCode from "./corp-code";

describe("loadCorpCodeReverseMap", () => {
  beforeEach(() => {
    // 내부 캐시 초기화: vitest는 module level 변수 격리 안 함 → 별도 reset 필요.
    // 캐시는 함수 내부에 있어 직접 접근 불가 → 첫 호출 결과를 비교.
  });

  it("inverts forward map (stock_code → corp_code) to (corp_code → stock_code)", async () => {
    const fakeForward = new Map<string, string>([
      ["005930", "00126380"],
      ["000660", "00164779"],
    ]);
    const spy = vi
      .spyOn(corpCode, "loadCorpCodeMap")
      .mockResolvedValue(fakeForward);

    const reverse = await corpCode.loadCorpCodeReverseMap();
    expect(reverse.get("00126380")).toBe("005930");
    expect(reverse.get("00164779")).toBe("000660");
    expect(reverse.size).toBe(2);

    spy.mockRestore();
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run:
```bash
cd apps/company-map
npx vitest run src/lib/dart/corp-code.test.ts
```

Expected: FAIL — `loadCorpCodeReverseMap is not a function`.

- [ ] **Step 3: 함수 구현**

`apps/company-map/src/lib/dart/corp-code.ts` 끝에 추가:

```ts
let cachedReverseMap: Map<string, string> | null = null;

/** corp_code → stock_code 매핑. loadCorpCodeMap()을 invert. */
export async function loadCorpCodeReverseMap(): Promise<Map<string, string>> {
  if (cachedReverseMap) return cachedReverseMap;
  const forward = await loadCorpCodeMap();
  const reverse = new Map<string, string>();
  for (const [stock, corp] of forward) reverse.set(corp, stock);
  cachedReverseMap = reverse;
  return reverse;
}
```

**중요**: 모듈 상단의 `cachedMap` 변수도 그대로 두기 (기존 동작 보존).

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
npx vitest run src/lib/dart/corp-code.test.ts
```

Expected: PASS — 1 test passed.

⚠️ vitest의 모듈 캐싱 때문에 spy가 module-internal 호출에는 안 먹힐 수 있음. 그 경우 spy가 호출되지 않고 실제 fetch가 시도돼 실패한다. 그 때는 테스트를 다음과 같이 바꾼다:

```ts
it("inverts forward map (stock_code → corp_code) to (corp_code → stock_code)", async () => {
  // 모듈 내부 cachedMap을 직접 prime: dynamic import + 임시 expose
  const { loadCorpCodeReverseMap } = await import("./corp-code");
  // forward map 캐시를 prime하기 위해 별도 fetch mock
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => fixtureZipBuffer,  // 적당한 corp_code.xml.zip
  });
  // ...
});
```

위 방법이 복잡하면 테스트를 **순수 invert 함수**로 리팩터:

```ts
// corp-code.ts
export function invertMap(forward: Map<string, string>): Map<string, string> {
  const reverse = new Map<string, string>();
  for (const [k, v] of forward) reverse.set(v, k);
  return reverse;
}

// loadCorpCodeReverseMap은 invertMap을 사용
```

테스트는 `invertMap`만 단위 테스트. 권장 — 단순함.

테스트 코드를 다음으로 교체:

```ts
import { describe, it, expect } from "vitest";
import { invertMap } from "./corp-code";

describe("invertMap", () => {
  it("inverts (stock_code → corp_code) to (corp_code → stock_code)", () => {
    const forward = new Map([
      ["005930", "00126380"],
      ["000660", "00164779"],
    ]);
    const reverse = invertMap(forward);
    expect(reverse.get("00126380")).toBe("005930");
    expect(reverse.get("00164779")).toBe("000660");
    expect(reverse.size).toBe(2);
  });

  it("returns empty map for empty input", () => {
    expect(invertMap(new Map()).size).toBe(0);
  });
});
```

`corp-code.ts`의 `loadCorpCodeReverseMap`는:

```ts
export async function loadCorpCodeReverseMap(): Promise<Map<string, string>> {
  if (cachedReverseMap) return cachedReverseMap;
  cachedReverseMap = invertMap(await loadCorpCodeMap());
  return cachedReverseMap;
}
```

다시 테스트 실행:

```bash
npx vitest run src/lib/dart/corp-code.test.ts
```

Expected: PASS — 2 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add apps/company-map/src/lib/dart/corp-code.ts apps/company-map/src/lib/dart/corp-code.test.ts
git commit -m "feat(company-map): add corp_code reverse map for DART filer lookup"
```

---

## Task 3: OpenDART list.json fetcher

**Files:**
- Create: `apps/company-map/src/lib/dart/disclosure-list.ts`
- Create: `apps/company-map/src/lib/dart/disclosure-list.test.ts`
- Create: `apps/company-map/tests/fixtures/dart-disclosure-list-vip.json`

- [ ] **Step 1: fixture 생성**

`apps/company-map/tests/fixtures/dart-disclosure-list-vip.json`:

```json
{
  "status": "000",
  "message": "정상",
  "page_no": 1,
  "page_count": 100,
  "total_count": 2,
  "total_page": 1,
  "list": [
    {
      "corp_cls": "K",
      "corp_name": "한라IMS",
      "corp_code": "00567890",
      "stock_code": "017250",
      "report_nm": "주식등의대량보유상황보고서(약식)",
      "rcept_no": "20260518000285",
      "flr_nm": "브이아이피자산운용",
      "rcept_dt": "20260518",
      "rm": ""
    },
    {
      "corp_cls": "Y",
      "corp_name": "다른회사",
      "corp_code": "00111111",
      "stock_code": "012345",
      "report_nm": "분기보고서",
      "rcept_no": "20260101000001",
      "flr_nm": "다른제출인",
      "rcept_dt": "20260101",
      "rm": ""
    }
  ]
}
```

- [ ] **Step 2: 실패 테스트 작성**

`apps/company-map/src/lib/dart/disclosure-list.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchDisclosurePage } from "./disclosure-list";

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../tests/fixtures/dart-disclosure-list-vip.json"),
    "utf-8",
  ),
);

describe("fetchDisclosurePage", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.DART_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses DART list.json response into typed rows", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    } as Response);

    const result = await fetchDisclosurePage({
      bgnDe: "20251121",
      endDe: "20260521",
      pblntfTy: "D",
      pageNo: 1,
      pageCount: 100,
    });

    expect(result.totalPage).toBe(1);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      corpCode: "00567890",
      corpName: "한라IMS",
      reportNm: "주식등의대량보유상황보고서(약식)",
      rcpNo: "20260518000285",
      flrNm: "브이아이피자산운용",
      rceptDt: "20260518",
      stockCode: "017250",
    });
  });

  it("returns empty rows when DART status is '013' (no data)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "013", message: "조회된 데이타가 없습니다" }),
    } as Response);

    const result = await fetchDisclosurePage({
      bgnDe: "20251121",
      endDe: "20260521",
      pblntfTy: "D",
      pageNo: 1,
      pageCount: 100,
    });

    expect(result.totalPage).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it("throws when DART status is unexpected error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "020", message: "인증 오류" }),
    } as Response);

    await expect(
      fetchDisclosurePage({
        bgnDe: "20251121",
        endDe: "20260521",
        pblntfTy: "D",
        pageNo: 1,
        pageCount: 100,
      }),
    ).rejects.toThrow(/020/);
  });

  it("throws when DART_API_KEY is missing", async () => {
    delete process.env.DART_API_KEY;
    await expect(
      fetchDisclosurePage({
        bgnDe: "20251121",
        endDe: "20260521",
        pblntfTy: "D",
        pageNo: 1,
        pageCount: 100,
      }),
    ).rejects.toThrow(/DART_API_KEY/);
  });
});
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run:
```bash
npx vitest run src/lib/dart/disclosure-list.test.ts
```

Expected: FAIL — `Cannot find module './disclosure-list'`.

- [ ] **Step 4: fetcher 구현**

`apps/company-map/src/lib/dart/disclosure-list.ts`:

```ts
const DART_LIST_URL = "https://opendart.fss.or.kr/api/list.json";

export interface DartDisclosureRow {
  corpCode: string;
  corpName: string;
  reportNm: string;
  rcpNo: string;
  flrNm: string;
  rceptDt: string;   // YYYYMMDD
  stockCode: string; // 6자리 or "" 비상장
}

export interface FetchDisclosurePageParams {
  bgnDe: string;     // YYYYMMDD
  endDe: string;
  pblntfTy?: string; // "D" 등
  pblntfDetailTy?: string;
  pageNo: number;
  pageCount: number;
}

interface RawListResponse {
  status: string;
  message?: string;
  page_no?: number;
  page_count?: number;
  total_count?: number;
  total_page?: number;
  list?: RawListRow[];
}

interface RawListRow {
  corp_code?: string;
  corp_name?: string;
  stock_code?: string;
  report_nm?: string;
  rcept_no?: string;
  flr_nm?: string;
  rcept_dt?: string;
}

export async function fetchDisclosurePage(
  params: FetchDisclosurePageParams,
): Promise<{ totalPage: number; rows: DartDisclosureRow[] }> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY not set");

  const qs = new URLSearchParams({
    crtfc_key: apiKey,
    bgn_de: params.bgnDe,
    end_de: params.endDe,
    page_count: String(params.pageCount),
    page_no: String(params.pageNo),
  });
  if (params.pblntfTy) qs.set("pblntf_ty", params.pblntfTy);
  if (params.pblntfDetailTy) qs.set("pblntf_detail_ty", params.pblntfDetailTy);

  const res = await fetch(`${DART_LIST_URL}?${qs.toString()}`);
  if (!res.ok) throw new Error(`DART list HTTP ${res.status}`);

  const data = (await res.json()) as RawListResponse;

  if (data.status === "013") {
    return { totalPage: 0, rows: [] };
  }
  if (data.status !== "000") {
    throw new Error(`DART status ${data.status}: ${data.message ?? "unknown"}`);
  }

  const rows: DartDisclosureRow[] = (data.list ?? []).map((r) => ({
    corpCode: r.corp_code ?? "",
    corpName: r.corp_name ?? "",
    reportNm: r.report_nm ?? "",
    rcpNo: r.rcept_no ?? "",
    flrNm: r.flr_nm ?? "",
    rceptDt: r.rcept_dt ?? "",
    stockCode: (r.stock_code ?? "").trim(),
  }));

  return { totalPage: data.total_page ?? 1, rows };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run:
```bash
npx vitest run src/lib/dart/disclosure-list.test.ts
```

Expected: PASS — 4 tests passed.

- [ ] **Step 6: 페이지네이션 iterator 추가**

`disclosure-list.ts`에 이어서:

```ts
const PAGE_DELAY_MS = 200;

export interface IterateDisclosuresParams {
  bgnDe: string;
  endDe: string;
  pblntfTy?: string;
  pblntfDetailTy?: string;
}

/** total_page까지 자동 순회. 페이지 간 짧은 sleep으로 친절히. */
export async function* iterateDartDisclosures(
  params: IterateDisclosuresParams,
): AsyncGenerator<DartDisclosureRow> {
  const PAGE_COUNT = 100;
  let pageNo = 1;
  let totalPage = 1;
  while (pageNo <= totalPage) {
    const page = await fetchDisclosurePage({
      ...params,
      pageNo,
      pageCount: PAGE_COUNT,
    });
    if (pageNo === 1) totalPage = page.totalPage;
    for (const row of page.rows) yield row;
    pageNo++;
    if (pageNo <= totalPage) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
  }
}
```

iterator는 단위 테스트 생략 (단순 wrapping, fetchDisclosurePage 이미 검증).

- [ ] **Step 7: 커밋**

```bash
git add apps/company-map/src/lib/dart/disclosure-list.ts \
        apps/company-map/src/lib/dart/disclosure-list.test.ts \
        apps/company-map/tests/fixtures/dart-disclosure-list-vip.json
git commit -m "feat(company-map): add OpenDART list.json fetcher with pagination"
```

---

## Task 4: VIP 분류·매핑 순수 함수 (TDD)

**Files:**
- Create: `apps/company-map/src/lib/dart/vip-holdings.ts` (분류·변환 부분만)
- Create: `apps/company-map/src/lib/dart/vip-holdings.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`apps/company-map/src/lib/dart/vip-holdings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  VIP_FLR_NM,
  classifyReportType,
  isVipDisclosure,
  toVipHoldingInput,
} from "./vip-holdings";
import type { DartDisclosureRow } from "./disclosure-list";

const baseRow: DartDisclosureRow = {
  corpCode: "00567890",
  corpName: "한라IMS",
  reportNm: "주식등의대량보유상황보고서(약식)",
  rcpNo: "20260518000285",
  flrNm: "브이아이피자산운용",
  rceptDt: "20260518",
  stockCode: "017250",
};

describe("VIP_FLR_NM", () => {
  it("equals exactly 브이아이피자산운용", () => {
    expect(VIP_FLR_NM).toBe("브이아이피자산운용");
  });
});

describe("classifyReportType", () => {
  it("returns D001 for 대량보유 reports", () => {
    expect(classifyReportType("주식등의대량보유상황보고서")).toBe("D001");
    expect(classifyReportType("주식등의대량보유상황보고서(약식)")).toBe("D001");
  });

  it("returns D002 for 임원·주요주주 reports", () => {
    expect(classifyReportType("임원ㆍ주요주주특정증권등소유상황보고서")).toBe("D002");
    expect(classifyReportType("임원·주요주주특정증권등소유상황보고서")).toBe("D002");
  });

  it("returns null for non-D reports", () => {
    expect(classifyReportType("분기보고서")).toBeNull();
    expect(classifyReportType("감사보고서")).toBeNull();
  });
});

describe("isVipDisclosure", () => {
  it("true when flr_nm matches and report is D001 or D002", () => {
    expect(isVipDisclosure(baseRow)).toBe(true);
  });

  it("false when flr_nm differs", () => {
    expect(isVipDisclosure({ ...baseRow, flrNm: "다른제출인" })).toBe(false);
  });

  it("false for non-D report names", () => {
    expect(isVipDisclosure({ ...baseRow, reportNm: "분기보고서" })).toBe(false);
  });
});

describe("toVipHoldingInput", () => {
  it("converts DartDisclosureRow + stockCode to Prisma input", () => {
    const input = toVipHoldingInput(baseRow, "017250");
    expect(input).toEqual({
      rcpNo: "20260518000285",
      code: "017250",
      corpCode: "00567890",
      corpName: "한라IMS",
      reportNm: "주식등의대량보유상황보고서(약식)",
      reportType: "D001",
      flrNm: "브이아이피자산운용",
      rceptDt: new Date("2026-05-18T00:00:00.000Z"),
    });
  });

  it("throws if report cannot be classified (caller bug guard)", () => {
    expect(() =>
      toVipHoldingInput({ ...baseRow, reportNm: "분기보고서" }, "017250"),
    ).toThrow(/classify/i);
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run:
```bash
npx vitest run src/lib/dart/vip-holdings.test.ts
```

Expected: FAIL — `Cannot find module './vip-holdings'`.

- [ ] **Step 3: 순수 함수 구현**

`apps/company-map/src/lib/dart/vip-holdings.ts`:

```ts
import type { DartDisclosureRow } from "./disclosure-list";

export const VIP_FLR_NM = "브이아이피자산운용";

export type ReportType = "D001" | "D002";

/** report_nm 키워드 기반 분류. OpenDART는 pblntf_detail_ty를 안 주는 경우가 있음. */
export function classifyReportType(reportNm: string): ReportType | null {
  if (reportNm.includes("대량보유")) return "D001";
  // "임원·주요주주" 표기는 가운뎃점(·) 또는 한자식 점(ㆍ) 두 가지가 섞임.
  if (reportNm.includes("임원ㆍ주요주주") || reportNm.includes("임원·주요주주")) {
    return "D002";
  }
  return null;
}

export function isVipDisclosure(row: DartDisclosureRow): boolean {
  if (row.flrNm !== VIP_FLR_NM) return false;
  return classifyReportType(row.reportNm) !== null;
}

export interface VipHoldingInput {
  rcpNo: string;
  code: string;
  corpCode: string;
  corpName: string;
  reportNm: string;
  reportType: ReportType;
  flrNm: string;
  rceptDt: Date;
}

/** YYYYMMDD → Date (UTC midnight). */
function parseRceptDt(s: string): Date {
  const y = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
}

export function toVipHoldingInput(
  row: DartDisclosureRow,
  stockCode: string,
): VipHoldingInput {
  const reportType = classifyReportType(row.reportNm);
  if (!reportType) {
    throw new Error(`Cannot classify report: ${row.reportNm}`);
  }
  return {
    rcpNo: row.rcpNo,
    code: stockCode,
    corpCode: row.corpCode,
    corpName: row.corpName,
    reportNm: row.reportNm,
    reportType,
    flrNm: row.flrNm,
    rceptDt: parseRceptDt(row.rceptDt),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
npx vitest run src/lib/dart/vip-holdings.test.ts
```

Expected: PASS — 9 tests passed (1 VIP_FLR_NM + 3 classify + 3 isVip + 2 toVipHoldingInput).

- [ ] **Step 5: 커밋**

```bash
git add apps/company-map/src/lib/dart/vip-holdings.ts apps/company-map/src/lib/dart/vip-holdings.test.ts
git commit -m "feat(company-map): add VIP disclosure classifier and Prisma input mapper"
```

---

## Task 5: VIP refresh integration 함수

**Files:**
- Modify: `apps/company-map/src/lib/dart/vip-holdings.ts`

- [ ] **Step 1: refresh 함수 추가**

`vip-holdings.ts` 끝에 추가:

```ts
import { db } from "@/lib/db";
import { iterateDartDisclosures } from "./disclosure-list";
import { loadCorpCodeReverseMap } from "./corp-code";

export interface RefreshVipHoldingsResult {
  fetched: number;
  matchedVip: number;
  mapped: number;
  upserted: number;
  pruned: number;
}

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function refreshVipHoldings(
  now: Date = new Date(),
): Promise<RefreshVipHoldingsResult> {
  const cutoff = new Date(now.getTime() - SIX_MONTHS_MS);
  const bgnDe = toDateString(cutoff);
  const endDe = toDateString(now);

  const reverseMap = await loadCorpCodeReverseMap();

  let fetched = 0;
  let matchedVip = 0;
  let mapped = 0;
  let upserted = 0;

  for await (const row of iterateDartDisclosures({
    bgnDe,
    endDe,
    pblntfTy: "D",
  })) {
    fetched++;
    if (!isVipDisclosure(row)) continue;
    matchedVip++;

    // stock_code가 응답에 있으면 우선 사용, 없으면 corp_code → stock_code 매핑.
    const stockCode = row.stockCode || reverseMap.get(row.corpCode) || "";
    if (!stockCode || stockCode.length !== 6) continue;
    mapped++;

    const input = toVipHoldingInput(row, stockCode);
    await db.vipHolding.upsert({
      where: { rcpNo: input.rcpNo },
      create: input,
      update: {
        code: input.code,
        corpCode: input.corpCode,
        corpName: input.corpName,
        reportNm: input.reportNm,
        reportType: input.reportType,
        flrNm: input.flrNm,
        rceptDt: input.rceptDt,
      },
    });
    upserted++;
  }

  const pruneResult = await db.vipHolding.deleteMany({
    where: { rceptDt: { lt: cutoff } },
  });

  return { fetched, matchedVip, mapped, upserted, pruned: pruneResult.count };
}
```

- [ ] **Step 2: 컴파일 확인**

Run:
```bash
cd apps/company-map
npx tsc --noEmit
```

Expected: `EXIT=0`, 출력 없음.

(이 함수는 통합 테스트가 어려우니 unit test 생략. Task 11에서 실 데이터로 검증.)

- [ ] **Step 3: 커밋**

```bash
git add apps/company-map/src/lib/dart/vip-holdings.ts
git commit -m "feat(company-map): add refreshVipHoldings DART → DB pipeline"
```

---

## Task 6: 수동 트리거 스크립트

**Files:**
- Create: `apps/company-map/scripts/refresh-vip-holdings.ts`

- [ ] **Step 1: 스크립트 작성**

`apps/company-map/scripts/refresh-vip-holdings.ts`:

```ts
import { refreshVipHoldings } from "@/lib/dart/vip-holdings";

(async () => {
  const start = Date.now();
  console.log("[vip] refresh started");
  try {
    const result = await refreshVipHoldings();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[vip] done in ${elapsed}s`, result);
    process.exit(0);
  } catch (e) {
    console.error("[vip] failed:", e);
    process.exit(1);
  }
})();
```

- [ ] **Step 2: 컴파일 확인**

Run:
```bash
npx tsc --noEmit
```

Expected: `EXIT=0`.

- [ ] **Step 3: dry-run (DART API 키 필요)**

Run:
```bash
npx tsx scripts/refresh-vip-holdings.ts
```

Expected output 예시:
```
[vip] refresh started
[vip] done in 12s { fetched: ~5000, matchedVip: 20~40, mapped: 18~35, upserted: 18~35, pruned: 0 }
```

`DART_API_KEY`가 .env에 있으니 별도 export 불필요.

- [ ] **Step 4: DB 확인**

Run:
```bash
sqlite3 data/company-map.db "SELECT COUNT(*) FROM vip_holdings;"
sqlite3 data/company-map.db "SELECT code, COUNT(*) FROM vip_holdings GROUP BY code ORDER BY 2 DESC LIMIT 5;"
sqlite3 data/company-map.db "SELECT * FROM vip_holdings WHERE rcp_no = '20260518000285';"
```

Expected: 18~35 row, 한라IMS(017250)에 1+ 건, 사용자 예시 공시 row 존재.

- [ ] **Step 5: 커밋**

```bash
git add apps/company-map/scripts/refresh-vip-holdings.ts
git commit -m "feat(company-map): add manual refresh-vip-holdings trigger script"
```

---

## Task 7: Server Action 확장 (`getStocksExplorer`)

**Files:**
- Modify: `apps/company-map/src/actions/stocks-explorer.ts`

- [ ] **Step 1: 타입에 필드 추가**

`stocks-explorer.ts`의 `StocksExplorerParams`에 `vipOnly?: boolean` 추가:

```ts
export interface StocksExplorerParams {
  market?: MarketFilter;
  search?: string;
  minMarcapEok?: number | null;
  maxMarcapEok?: number | null;
  perMax?: number | null;
  pbrMax?: number | null;
  analyzedOnly?: boolean;
  vipOnly?: boolean;        // ← 신규
  sort?: StocksSort;
  page?: number;
  pageSize?: number;
}
```

`StocksExplorerRow`에 두 필드 추가:

```ts
export interface StocksExplorerRow {
  code: string;
  name: string;
  market: string | null;
  marcap: number | null;
  currentPrice: number | null;
  per: number | null;
  pbr: number | null;
  dividendYield: number | null;
  safetyMargin: number | null;
  analyzed: boolean;
  vipHoldingsCount: number;            // ← 신규
  vipLatestRceptDt: string | null;     // ← 신규 (ISO)
}
```

- [ ] **Step 2: where 조립에 vipOnly 추가**

`getStocksExplorer` 함수 안의 `const where: Prisma.StockMasterWhereInput = {};` 아래에 추가:

```ts
if (params.vipOnly) {
  where.vipHoldings = { some: {} };
}
```

- [ ] **Step 3: include에 vipHoldings + _count 추가**

`db.stockMaster.findMany` 호출의 `include`를 다음으로 변경:

```ts
db.stockMaster.findMany({
  where,
  include: {
    analysis: true,
    vipHoldings: {
      orderBy: { rceptDt: "desc" },
      take: 1,
      select: { rceptDt: true },
    },
    _count: { select: { vipHoldings: true } },
  },
  orderBy,
  skip: (page - 1) * pageSize,
  take: pageSize,
}),
```

- [ ] **Step 4: row 매핑 갱신**

`masters.map` 부분에 두 필드 채움:

```ts
const rows: StocksExplorerRow[] = masters.map((m) => ({
  code: m.code,
  name: m.name,
  market: m.market,
  marcap: m.marcap != null ? Number(m.marcap) : null,
  currentPrice: m.analysis?.currentPrice ?? null,
  per: m.analysis?.per ?? null,
  pbr: m.analysis?.pbr ?? null,
  dividendYield: m.analysis?.dividendYield ?? null,
  safetyMargin: m.analysis?.safetyMargin ?? null,
  analyzed: m.analysis != null,
  vipHoldingsCount: m._count.vipHoldings,
  vipLatestRceptDt: m.vipHoldings[0]?.rceptDt.toISOString() ?? null,
}));
```

- [ ] **Step 5: 컴파일 확인**

Run:
```bash
npx tsc --noEmit
```

Expected: `EXIT=0`.

- [ ] **Step 6: 커밋**

```bash
git add apps/company-map/src/actions/stocks-explorer.ts
git commit -m "feat(company-map): add vipOnly filter + VIP holdings count to stocks explorer"
```

---

## Task 8: VIP detail Server Action

**Files:**
- Create: `apps/company-map/src/actions/vip-holdings.ts`

- [ ] **Step 1: Server Action 작성**

`apps/company-map/src/actions/vip-holdings.ts`:

```ts
"use server";

import { db } from "@/lib/db";

export interface VipHoldingDetailRow {
  rcpNo: string;
  reportNm: string;
  reportType: string;
  rceptDt: string;   // ISO
  dartUrl: string;
}

export async function getVipHoldingsByCode(
  code: string,
): Promise<VipHoldingDetailRow[]> {
  if (!/^\d{6}$/.test(code)) return [];

  const rows = await db.vipHolding.findMany({
    where: { code },
    orderBy: { rceptDt: "desc" },
  });

  return rows.map((r) => ({
    rcpNo: r.rcpNo,
    reportNm: r.reportNm,
    reportType: r.reportType,
    rceptDt: r.rceptDt.toISOString(),
    dartUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcpNo}`,
  }));
}
```

- [ ] **Step 2: 컴파일 확인**

Run:
```bash
npx tsc --noEmit
```

Expected: `EXIT=0`.

- [ ] **Step 3: 커밋**

```bash
git add apps/company-map/src/actions/vip-holdings.ts
git commit -m "feat(company-map): add getVipHoldingsByCode Server Action for expand row"
```

---

## Task 9: `/stocks` 페이지 `vipOnly` 파싱

**Files:**
- Modify: `apps/company-map/src/app/stocks/page.tsx`

- [ ] **Step 1: view 객체에 vipOnly 추가**

`page.tsx`의 `view` 객체 (`analyzedOnly` 옆)에 추가:

```ts
const view: StocksExplorerView = {
  market,
  search: sp.search ?? "",
  minMarcapEok: parseOptionalNumber(sp.minMarcap),
  maxMarcapEok: parseOptionalNumber(sp.maxMarcap),
  perMax: parseOptionalNumber(sp.perMax),
  pbrMax: parseOptionalNumber(sp.pbrMax),
  analyzedOnly: sp.analyzed === "1",
  vipOnly: sp.vip === "1",          // ← 신규
  sort,
  page,
  pageSize: 50,
};
```

- [ ] **Step 2: 컴파일 확인**

Run:
```bash
npx tsc --noEmit
```

Expected: `EXIT=0` (다음 Task에서 StocksExplorerView 타입에도 vipOnly 추가하므로 일시 에러 가능 — 즉시 Task 10 진행).

- [ ] **Step 3: 일단 커밋 보류, Task 10과 함께 커밋**

(이유: page.tsx 단독으로는 StocksExplorerView에 vipOnly 없어서 type error. Task 10에서 함께 커밋.)

---

## Task 10: 클라이언트 UI — VIP 컬럼·필터·expand

**Files:**
- Modify: `apps/company-map/src/app/stocks/StocksExplorerClient.tsx`

- [ ] **Step 1: import + 타입 확장**

파일 상단 import:

```ts
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Filter, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type {
  MarketFilter,
  StocksExplorerRow,
  StocksSort,
} from "@/actions/stocks-explorer";
import {
  getVipHoldingsByCode,
  type VipHoldingDetailRow,
} from "@/actions/vip-holdings";
import { formatMarcap } from "@/lib/format-marcap";
```

`StocksExplorerView`에 vipOnly 추가:

```ts
export interface StocksExplorerView {
  market: MarketFilter;
  search: string;
  minMarcapEok: number | null;
  maxMarcapEok: number | null;
  perMax: number | null;
  pbrMax: number | null;
  analyzedOnly: boolean;
  vipOnly: boolean;       // ← 신규
  sort: StocksSort;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 2: buildQuery에 vip 추가**

```ts
function buildQuery(view: Partial<StocksExplorerView>): string {
  const qs = new URLSearchParams();
  if (view.market && view.market !== "ALL") qs.set("market", view.market);
  if (view.search) qs.set("search", view.search);
  if (view.minMarcapEok != null) qs.set("minMarcap", String(view.minMarcapEok));
  if (view.maxMarcapEok != null) qs.set("maxMarcap", String(view.maxMarcapEok));
  if (view.perMax != null) qs.set("perMax", String(view.perMax));
  if (view.pbrMax != null) qs.set("pbrMax", String(view.pbrMax));
  if (view.analyzedOnly) qs.set("analyzed", "1");
  if (view.vipOnly) qs.set("vip", "1");                 // ← 신규
  if (view.sort && view.sort !== "marcap_desc") qs.set("sort", view.sort);
  if (view.page && view.page > 1) qs.set("page", String(view.page));
  return qs.toString();
}
```

- [ ] **Step 3: 컴포넌트 상태에 vipOnly + expand 추가**

`StocksExplorerClient` 컴포넌트 안 (`const [analyzedOnly, setAnalyzedOnly]` 옆):

```ts
const [vipOnly, setVipOnly] = useState(view.vipOnly);
const [expanded, setExpanded] = useState<Set<string>>(new Set());
const [vipDetails, setVipDetails] = useState<Record<string, VipHoldingDetailRow[]>>({});
const [vipLoading, setVipLoading] = useState<Set<string>>(new Set());
```

`filterOpen` 초기화 조건에 vipOnly 포함:

```ts
const [filterOpen, setFilterOpen] = useState(
  view.minMarcapEok != null ||
    view.maxMarcapEok != null ||
    view.perMax != null ||
    view.pbrMax != null ||
    view.analyzedOnly ||
    view.vipOnly,
);
```

- [ ] **Step 4: applyFilters에 vipOnly 포함**

```ts
const applyFilters = (e: React.FormEvent) => {
  e.preventDefault();
  navigate({
    search: search.trim(),
    minMarcapEok: minMarcap ? Number(minMarcap) : null,
    maxMarcapEok: maxMarcap ? Number(maxMarcap) : null,
    perMax: perMax ? Number(perMax) : null,
    pbrMax: pbrMax ? Number(pbrMax) : null,
    analyzedOnly,
    vipOnly,           // ← 신규
    page: 1,
  });
};
```

`resetFilters`에도:

```ts
const resetFilters = () => {
  setSearch("");
  setMinMarcap("");
  setMaxMarcap("");
  setPerMax("");
  setPbrMax("");
  setAnalyzedOnly(false);
  setVipOnly(false);          // ← 신규
  startTransition(() => router.replace("/stocks"));
};
```

- [ ] **Step 5: 필터 패널에 체크박스 추가**

기존 "분석된 종목만" 체크박스 옆에 추가 (`<label className="flex items-center gap-2">...분석된 종목만...</label>` 다음):

```tsx
<label className="flex items-center gap-2">
  <input
    type="checkbox"
    checked={vipOnly}
    onChange={(e) => setVipOnly(e.target.checked)}
  />
  <span>VIP 보유 종목만</span>
</label>
```

- [ ] **Step 6: expand 토글 함수**

`navigate` 함수 정의 다음에 추가:

```ts
const toggleExpand = (code: string) => {
  setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    return next;
  });
  // 첫 expand 시 데이터 로드
  if (!expanded.has(code) && !vipDetails[code]) {
    setVipLoading((prev) => new Set(prev).add(code));
    startTransition(async () => {
      const rows = await getVipHoldingsByCode(code);
      setVipDetails((prev) => ({ ...prev, [code]: rows }));
      setVipLoading((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    });
  }
};
```

- [ ] **Step 7: 표 헤더에 VIP 컬럼 추가**

기존 `<th>안전마진</th>` 다음에:

```tsx
<th className="p-2 font-medium text-right">VIP</th>
```

- [ ] **Step 8: 데이터 행에 VIP 셀 추가**

기존 safetyMargin `<td>` 다음에:

```tsx
<td className="p-2 text-right">
  {r.vipHoldingsCount > 0 ? (
    <button
      type="button"
      onClick={() => toggleExpand(r.code)}
      className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
    >
      {r.vipHoldingsCount}건
      {expanded.has(r.code) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </button>
  ) : (
    <span className="text-gray-400">—</span>
  )}
</td>
```

- [ ] **Step 9: expand row 렌더**

각 `<tr key={r.code}>` 닫는 태그 다음, 그리고 `</tbody>` 안에서:

```tsx
{expanded.has(r.code) && (
  <tr key={r.code + "-expand"} className="bg-blue-50/40 dark:bg-blue-950/20">
    <td colSpan={10} className="p-3">
      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
        브이아이피자산운용 보유 공시 (최근 6개월)
      </div>
      {vipLoading.has(r.code) ? (
        <div className="text-sm text-gray-500">불러오는 중…</div>
      ) : (vipDetails[r.code] ?? []).length === 0 ? (
        <div className="text-sm text-gray-500">공시 없음</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {(vipDetails[r.code] ?? []).map((d) => (
            <li key={d.rcpNo} className="flex items-center gap-3">
              <span className="font-mono text-gray-500 w-24">
                {d.rceptDt.slice(0, 10)}
              </span>
              <span className="flex-1">{d.reportNm}</span>
              <a
                href={d.dartUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                공시 보기 <ExternalLink size={12} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </td>
  </tr>
)}
```

표 colSpan: 기존 9 컬럼 + VIP 1 = 10. "조건에 맞는 종목이 없습니다" 행의 colSpan도 9 → 10으로 변경:

```tsx
<tr>
  <td colSpan={10} className="p-6 text-center text-gray-500">
    조건에 맞는 종목이 없습니다.
  </td>
</tr>
```

- [ ] **Step 10: 컴파일 + lint**

Run:
```bash
npx tsc --noEmit
npx eslint src/app/stocks src/actions/vip-holdings.ts src/actions/stocks-explorer.ts
```

Expected: TS `EXIT=0`. eslint는 기존 AppMenu.tsx 무관 에러 1건만.

- [ ] **Step 11: 커밋 (Task 9 + 10)**

```bash
git add apps/company-map/src/app/stocks/page.tsx apps/company-map/src/app/stocks/StocksExplorerClient.tsx
git commit -m "feat(company-map): add VIP column, filter, and expandable disclosure rows"
```

---

## Task 11: 통합 검증

**Files:** 검증만 — 코드 변경 없음.

- [ ] **Step 1: dev 서버 재시작 (사용자 안내)**

Prisma client schema가 바뀌었으므로 사용자가 띄운 dev 서버를 재시작해야 새 client 로드. 사용자에게:

```
사용자 액션 필요:
1) 기존 `npm run dev` 중지 (Ctrl+C)
2) `cd apps/company-map && npm run dev` 재실행
3) ready 메시지 확인
```

- [ ] **Step 2: /stocks 페이지 기본 동작**

브라우저: `http://localhost:3004/stocks`
- 표 마지막 컬럼에 "VIP" 헤더 노출
- VIP 보유 안 한 종목은 — 표시
- 표시 카운트, 페이지네이션 동작 기존과 동일

- [ ] **Step 3: VIP 필터 동작**

`http://localhost:3004/stocks?vip=1`
- VIP 보유 종목만 표시 (10~30개)
- 모든 행의 VIP 셀이 'N건' 표시
- 필터 패널 펼치면 "VIP 보유 종목만" 체크박스 체크된 상태

- [ ] **Step 4: Expand 동작**

VIP 셀의 'N건' 클릭:
- 행 아래에 expand row 펼쳐짐
- 첫 클릭 시 "불러오는 중…" 표시 후 공시 목록
- 각 공시 항목: 날짜 + 보고서명 + "공시 보기" 링크
- "공시 보기" 클릭 → 새 탭으로 DART 공시 페이지

- [ ] **Step 5: 사용자 예시 검증**

한라IMS 행을 찾아 expand → 2026-05-18 공시가 포함되어야 함.
"공시 보기" → `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260518000285` 로 이동.

- [ ] **Step 6: 회귀 확인**

다음 페이지 모두 정상 로드:
- `/stocks` (vip 필터 없이)
- `/companies`, `/top-stocks`, `/ncav`, `/trade`, `/calculator`

- [ ] **Step 7: 전체 테스트 통과 확인**

Run:
```bash
cd apps/company-map
npx vitest run
```

Expected: 모든 테스트 PASS. 새로 추가된 corp-code/disclosure-list/vip-holdings 테스트 포함.

- [ ] **Step 8: 마지막 커밋 (검증 완료 표시 — 선택)**

검증 단계는 코드 변경이 없으므로 별도 커밋 불필요. 다만 plan 진행 흔적을 남기고 싶으면:

```bash
git log --oneline | head -10
```
로 새 커밋 7개 정도 확인.

---

## Self-Review Notes

**Spec coverage:**
- Prisma `VipHolding` 모델 — Task 1 ✓
- `loadCorpCodeReverseMap` — Task 2 ✓
- `disclosure-list.ts` — Task 3 ✓
- 분류·매핑 순수 함수 — Task 4 ✓
- `refreshVipHoldings` — Task 5 ✓
- 수동 트리거 — Task 6 ✓
- `getStocksExplorer` 확장 (vipOnly, count, latest) — Task 7 ✓
- `getVipHoldingsByCode` — Task 8 ✓
- `/stocks` 페이지 `vipOnly` 파싱 — Task 9 ✓
- 클라이언트 UI (컬럼·필터·expand) — Task 10 ✓
- Verification (마이그레이션, 수집, UI, 회귀) — Task 11 ✓

**Type consistency:**
- `VipHoldingInput` (Task 4) ↔ Prisma `VipHolding` 모델 (Task 1) 필드 일치
- `VipHoldingDetailRow` (Task 8) ↔ UI expand row (Task 10) 필드 일치
- `StocksExplorerRow.vipHoldingsCount` / `vipLatestRceptDt` (Task 7) ↔ UI 셀·필드 사용 (Task 10) 일치

**Placeholder scan:** 없음. 각 step에 실제 코드와 명령어 포함.
