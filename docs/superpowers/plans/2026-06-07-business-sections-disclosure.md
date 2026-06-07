# 종목 상세 사업개요·매출·수주상황 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 종목 상세 "공시 갱신" 시 DART 정기보고서 "II. 사업의 내용"에서 사업개요·매출·수주상황을 추출해 새 섹션으로 표시(수주상황은 분기별 누적).

**Architecture:** 보고서 main.do의 `treeData`(목차)를 파싱해 섹션 노드를 찾고, viewer.do 본문 HTML을 sanitize해 그대로 렌더링한다. 순수 파서/추출은 `src/lib/dart/report-sections.ts`에 두고 Vitest로 검증, 네트워크 fetch는 worker 컨텍스트(`disclosures.ts`)에서 수행한다. 저장은 기존 `Disclosure` 테이블 + 합성 rcpNo 키.

**Tech Stack:** Next.js App Router, Prisma(SQLite, `@prisma-clients/company-map`), Vitest, Tailwind, DART 문서뷰어(dsaf001/main.do, report/viewer.do).

**Spec:** `apps/company-map/docs/superpowers/specs/2026-06-07-business-sections-disclosure.html`

> 모든 명령은 `apps/company-map/`에서 실행. 커밋은 사용자가 자동 커밋을 허용한 경우에만. `dsaf001/main.do`·`report/viewer.do`는 OpenDART API 키와 무관한 공개 문서뷰어(rcpNo는 영구 불변 레코드).

---

## File Structure

| 파일 | 책임 |
|------|------|
| `tests/fixtures/dart-report-main.html` | 005930 분기보고서 main.do (treeData 픽스처) |
| `tests/fixtures/dart-report-section.html` | "4. 매출 및 수주상황" 섹션 viewer.do (분할 픽스처) |
| `src/lib/dart/report-sections.ts` | treeData 파서 + 표/소제목 추출 + 매출/수주 분할 + sanitize (순수) |
| `src/lib/dart/report-sections.test.ts` | 위 순수 함수 픽스처 테스트 |
| `src/lib/dart/dart-viewer.ts` | `fetchViewerHtmlByParams` 추가 |
| `src/lib/dart/disclosure-payloads.ts` | category 3개 + `SectionPayload` |
| `src/actions/disclosures.ts` | `fetchBusinessSections` + 루프 |
| `src/app/stocks/[code]/SectionCard.tsx` | sanitize HTML 렌더 카드 |
| `src/app/stocks/[code]/DisclosureTimeline.tsx`·`SectionNav.tsx`·`page.tsx` | 섹션·네비·필터 |

---

## Task 1: 테스트 픽스처 캡처

**Files:**
- Create: `tests/fixtures/dart-report-main.html`
- Create: `tests/fixtures/dart-report-section.html`

- [ ] **Step 1: main.do 캡처** (rcpNo는 005930 분기보고서(2026.03), 영구 레코드)

```bash
mkdir -p tests/fixtures
curl -s "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260515002181" -A "Mozilla/5.0" -o tests/fixtures/dart-report-main.html
```

- [ ] **Step 2: 섹션 viewer.do 캡처** ("4. 매출 및 수주상황": dcmNo 11386164, eleId 13, offset 60425, length 26562)

```bash
curl -s "https://dart.fss.or.kr/report/viewer.do?rcpNo=20260515002181&dcmNo=11386164&eleId=13&offset=60425&length=26562&dtd=dart4.xsd" -A "Mozilla/5.0" -o tests/fixtures/dart-report-section.html
```

- [ ] **Step 3: 확인**

```bash
grep -c "treeData" tests/fixtures/dart-report-main.html   # > 0
grep -oE "매출실적|수주상황" tests/fixtures/dart-report-section.html | sort | uniq -c   # 둘 다 등장
```
Expected: main에 treeData 존재, section에 "매출실적"·"수주상황" 등장.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/dart-report-main.html tests/fixtures/dart-report-section.html
git commit -m "test(company-map): add DART report section fixtures"
```

---

## Task 2: treeData 파서 + 섹션 노드 찾기 (TDD)

**Files:**
- Create: `src/lib/dart/report-sections.ts`
- Test: `src/lib/dart/report-sections.test.ts`

- [ ] **Step 1: 실패 테스트**

`src/lib/dart/report-sections.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { parseTreeData, findSectionNode } from "./report-sections";

const mainHtml = readFileSync(
  join(__dirname, "../../../tests/fixtures/dart-report-main.html"),
  "utf-8",
);

describe("parseTreeData", () => {
  it("목차 노드를 제목→문서파라미터로 파싱한다", () => {
    const nodes = parseTreeData(mainHtml);
    const sales = nodes.find((n) => n.text.includes("매출") && n.text.includes("수주"));
    expect(sales).toBeTruthy();
    expect(sales!.dcmNo).toBe("11386164");
    expect(sales!.eleId).toBe("13");
    expect(sales!.offset).toBe("60425");
    expect(sales!.length).toBe("26562");
    expect(sales!.dtd).toBe("dart4.xsd");
  });
});

describe("findSectionNode", () => {
  it("사업개요 노드(사업의 개요)를 찾는다", () => {
    const nodes = parseTreeData(mainHtml);
    const n = findSectionNode(nodes, "overview");
    expect(n).toBeTruthy();
    expect(n!.eleId).toBe("10");
    expect(n!.offset).toBe("10807");
  });
  it("매출·수주 노드를 찾는다", () => {
    const nodes = parseTreeData(mainHtml);
    const n = findSectionNode(nodes, "sales_orders");
    expect(n!.eleId).toBe("13");
  });
  it("없으면 null", () => {
    expect(findSectionNode([], "overview")).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/dart/report-sections.test.ts`
Expected: FAIL (parseTreeData/findSectionNode 미정의).

- [ ] **Step 3: 구현**

`src/lib/dart/report-sections.ts`:
```ts
export interface TreeNode {
  text: string;
  rcpNo: string;
  dcmNo: string;
  eleId: string;
  offset: string;
  length: string;
  dtd: string;
}

// main.do는 var nodeN = {}; nodeN['key']="val"; 형태로 목차를 만든다.
export function parseTreeData(mainHtml: string): TreeNode[] {
  const blocks = mainHtml.split(/var node\d+ = \{\};/);
  const grab = (b: string, k: string): string => {
    const m = b.match(new RegExp(`\\['${k}'\\]\\s*=\\s*"([^"]*)"`));
    return m ? m[1] : "";
  };
  const nodes: TreeNode[] = [];
  for (const b of blocks) {
    const text = grab(b, "text");
    const dcmNo = grab(b, "dcmNo");
    if (!text || !dcmNo) continue;
    nodes.push({
      text: text.trim(),
      rcpNo: grab(b, "rcpNo"),
      dcmNo,
      eleId: grab(b, "eleId"),
      offset: grab(b, "offset"),
      length: grab(b, "length"),
      dtd: grab(b, "dtd"),
    });
  }
  return nodes;
}

export type SectionKind = "overview" | "sales_orders";

export function findSectionNode(
  nodes: TreeNode[],
  kind: SectionKind,
): TreeNode | null {
  const norm = (s: string) => s.replace(/\s+/g, "");
  for (const n of nodes) {
    const t = norm(n.text);
    if (kind === "overview" && t.includes("사업의개요")) return n;
    if (kind === "sales_orders" && t.includes("매출") && t.includes("수주")) return n;
  }
  return null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/dart/report-sections.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dart/report-sections.ts src/lib/dart/report-sections.test.ts
git commit -m "feat(company-map): parse DART report TOC (treeData) and locate sections"
```

---

## Task 3: 표 추출 + 매출/수주 분할 + sanitize (TDD)

**Files:**
- Modify: `src/lib/dart/report-sections.ts`
- Test: `src/lib/dart/report-sections.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

import에 추가: `import { parseTreeData, findSectionNode, splitSalesOrders, sanitizeHtml } from "./report-sections";`
파일 끝에 추가:
```ts
const sectionHtml = readFileSync(
  join(__dirname, "../../../tests/fixtures/dart-report-section.html"),
  "utf-8",
);

describe("splitSalesOrders", () => {
  it("매출실적 표와 수주상황 표를 분리한다", () => {
    const { salesHtml, ordersHtml } = splitSalesOrders(sectionHtml);
    expect(salesHtml).toContain("<table");
    expect(ordersHtml).toContain("<table");
    // 수주 표는 수주상황 소제목 이후 → "수주" 텍스트 포함
    expect(ordersHtml).toContain("수주");
  });
  it("수주상황 소제목이 없으면 ordersHtml은 빈 문자열", () => {
    const { ordersHtml } = splitSalesOrders("<p>매출실적</p><table><tr><td>1</td></tr></table>");
    expect(ordersHtml).toBe("");
  });
});

describe("sanitizeHtml", () => {
  it("script와 이벤트 핸들러를 제거하고 표는 보존한다", () => {
    const out = sanitizeHtml('<table onclick="x()"><tr><td>a</td></tr></table><script>bad()</script>');
    expect(out).toContain("<table");
    expect(out).toContain("a");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/dart/report-sections.test.ts`
Expected: FAIL (splitSalesOrders/sanitizeHtml 미정의).

- [ ] **Step 3: 구현 추가** (`report-sections.ts` 끝에)

```ts
// 완전한 <table>...</table> 블록을 위치와 함께 추출.
function tablesWithPos(html: string): Array<{ html: string; pos: number }> {
  const out: Array<{ html: string; pos: number }> = [];
  const re = /<table[\s\S]*?<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push({ html: m[0], pos: m.index });
  return out;
}

// 소제목 텍스트의 첫 등장 위치(-1 없음). 공백 무시 비교를 위해 원문 인덱스 근사.
function headingIndex(html: string, re: RegExp): number {
  const m = html.match(re);
  return m && m.index != null ? m.index : -1;
}

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(link|meta)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

// "4. 매출 및 수주상황" 섹션을 매출실적 표 / 수주상황 표로 분리.
export function splitSalesOrders(sectionHtml: string): {
  salesHtml: string;
  ordersHtml: string;
} {
  const ordersIdx = headingIndex(sectionHtml, /수주\s*상황/);
  const salesIdx = headingIndex(sectionHtml, /매출\s*실적/);
  const tables = tablesWithPos(sectionHtml);

  const orderTables = ordersIdx >= 0
    ? tables.filter((t) => t.pos > ordersIdx).map((t) => t.html)
    : [];
  const salesTables = tables
    .filter((t) => (salesIdx < 0 || t.pos >= salesIdx) && (ordersIdx < 0 || t.pos < ordersIdx))
    .map((t) => t.html);

  return {
    salesHtml: salesTables.length ? sanitizeHtml(salesTables.join("\n")) : "",
    ordersHtml: orderTables.length ? sanitizeHtml(orderTables.join("\n")) : "",
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/dart/report-sections.test.ts`
Expected: PASS (모든 테스트). 실패 시 픽스처의 실제 소제목 표기에 맞춰 정규식(`/수주\s*상황/`, `/매출\s*실적/`) 조정.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dart/report-sections.ts src/lib/dart/report-sections.test.ts
git commit -m "feat(company-map): extract and split 매출/수주 tables, sanitize HTML"
```

---

## Task 4: 파라미터 지정 viewer fetch

**Files:**
- Modify: `src/lib/dart/dart-viewer.ts`

- [ ] **Step 1: 함수 추가** (`dart-viewer.ts` 끝에; 기존 `fetchDartPage` 재사용)

```ts
// treeData 노드 파라미터로 특정 섹션 viewer.do HTML을 가져온다.
export async function fetchViewerHtmlByParams(params: {
  rcpNo: string;
  dcmNo: string;
  eleId: string;
  offset: string;
  length: string;
  dtd: string;
}): Promise<string | null> {
  const url =
    `https://dart.fss.or.kr/report/viewer.do?` +
    new URLSearchParams({
      rcpNo: params.rcpNo,
      dcmNo: params.dcmNo,
      eleId: params.eleId,
      offset: params.offset,
      length: params.length,
      dtd: params.dtd,
    }).toString();
  return fetchDartPage(url);
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add src/lib/dart/dart-viewer.ts
git commit -m "feat(company-map): fetch DART viewer section by explicit params"
```

---

## Task 5: payload 타입 + category 추가

**Files:**
- Modify: `src/lib/dart/disclosure-payloads.ts`

- [ ] **Step 1: category 확장**

`DisclosureCategory` 타입에 세 값을 추가:
```ts
export type DisclosureCategory =
  | "실적" | "배당" | "지분" | "계약" | "자사주"
  | "사업개요" | "매출" | "수주";
```
(기존 union에 `"사업개요" | "매출" | "수주"`만 추가 — 기존 값은 유지.)

- [ ] **Step 2: SectionPayload 추가** (파일 끝)

```ts
export interface SectionPayload {
  html: string;          // sanitize된 섹션 HTML(표/문단)
  sourceRcpNo: string;   // 원본 보고서 rcpNo (DART 링크용)
  reportNm?: string;     // 기준 보고서명 (사업개요/매출)
  period?: string;       // 기준 기간 (수주 분기별, 예 "2026.03")
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dart/disclosure-payloads.ts
git commit -m "feat(company-map): add 사업개요/매출/수주 categories and SectionPayload"
```

---

## Task 6: 수집 — fetchBusinessSections

**Files:**
- Modify: `src/actions/disclosures.ts`

- [ ] **Step 1: import 추가** (파일 상단 import 그룹)

```ts
import { parseTreeData, findSectionNode, splitSalesOrders, sanitizeHtml } from "@/lib/dart/report-sections";
import { fetchDartPage, fetchViewerHtmlByParams } from "@/lib/dart/dart-viewer";
import type { SectionPayload } from "@/lib/dart/disclosure-payloads";
```

- [ ] **Step 2: 함수 추가** (다른 fetch 함수들 근처에 추가)

```ts
const MAX_ORDER_REPORTS = 8;

// 정기보고서 본문에서 사업개요·매출(최신 1개) + 수주상황(분기별 누적)을 추출·저장.
async function fetchBusinessSections(code: string, corpCode: string): Promise<FetchStats> {
  const { bgnDe, endDe } = todayDateRange();
  const resp = await fetchDartList({ corpCode, pblntfTy: "A", bgnDe, endDe, pageCount: 100 });
  if (!resp || resp.status !== "000" || !resp.list) return { inserted: 0, updated: 0, failed: 1 };

  const reports = resp.list
    .filter((it) => PERIODIC_REPORT_REGEX.test(it.report_nm))
    .map((it) => ({ rcpNo: it.rcept_no, reportNm: it.report_nm, rceptDt: parseRceptDt(it.rcept_dt) }))
    .sort((a, b) => b.rceptDt.getTime() - a.rceptDt.getTime())
    .slice(0, MAX_ORDER_REPORTS);
  if (reports.length === 0) return emptyStats();

  let inserted = 0;
  let updated = 0;

  // 기간 라벨: 보고서명에서 (YYYY.MM) 추출
  const periodOf = (reportNm: string): string =>
    reportNm.match(/\((\d{4}\.\d{2})\)/)?.[1] ?? reportNm;

  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    const isLatest = i === 0;

    // 수주 합성키 — 이미 있으면(최신 제외) skip해 호출 절약
    const ordersRcpNo = `orders-${code}-${r.rcpNo}`;
    if (!isLatest) {
      const exists = await db.disclosure.findUnique({ where: { rcpNo: ordersRcpNo } });
      if (exists) continue;
    }

    try {
      const mainHtml = await fetchDartPage(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcpNo}`);
      if (!mainHtml) continue;
      const nodes = parseTreeData(mainHtml);

      const salesNode = findSectionNode(nodes, "sales_orders");
      if (salesNode) {
        const sectionHtml = await fetchViewerHtmlByParams({
          rcpNo: r.rcpNo, dcmNo: salesNode.dcmNo, eleId: salesNode.eleId,
          offset: salesNode.offset, length: salesNode.length, dtd: salesNode.dtd,
        });
        if (sectionHtml) {
          const { salesHtml, ordersHtml } = splitSalesOrders(sectionHtml);
          // 수주: 보고서별 누적
          if (ordersHtml) {
            const payload: SectionPayload = { html: ordersHtml, sourceRcpNo: r.rcpNo, period: periodOf(r.reportNm) };
            const ex = await db.disclosure.findUnique({ where: { rcpNo: ordersRcpNo } });
            await db.disclosure.upsert({
              where: { rcpNo: ordersRcpNo },
              create: { rcpNo: ordersRcpNo, code, corpCode, reportNm: `${periodOf(r.reportNm)} 수주상황`, pblntfTy: "A", rceptDt: r.rceptDt, category: "수주", payload: JSON.stringify(payload) },
              update: { payload: JSON.stringify(payload), fetchedAt: new Date() },
            });
            ex ? updated++ : inserted++;
          }
          // 매출: 최신 1개만 (덮어쓰기)
          if (isLatest && salesHtml) {
            const rcpNo = `sales-${code}`;
            const payload: SectionPayload = { html: salesHtml, sourceRcpNo: r.rcpNo, reportNm: r.reportNm };
            const ex = await db.disclosure.findUnique({ where: { rcpNo } });
            await db.disclosure.upsert({
              where: { rcpNo },
              create: { rcpNo, code, corpCode, reportNm: "매출", pblntfTy: "A", rceptDt: r.rceptDt, category: "매출", payload: JSON.stringify(payload) },
              update: { payload: JSON.stringify(payload), rceptDt: r.rceptDt, fetchedAt: new Date() },
            });
            ex ? updated++ : inserted++;
          }
        }
      }

      // 사업개요: 최신 1개만
      if (isLatest) {
        const ovNode = findSectionNode(nodes, "overview");
        if (ovNode) {
          const ovHtml = await fetchViewerHtmlByParams({
            rcpNo: r.rcpNo, dcmNo: ovNode.dcmNo, eleId: ovNode.eleId,
            offset: ovNode.offset, length: ovNode.length, dtd: ovNode.dtd,
          });
          if (ovHtml) {
            const rcpNo = `bizoverview-${code}`;
            const payload: SectionPayload = { html: sanitizeHtml(ovHtml), sourceRcpNo: r.rcpNo, reportNm: r.reportNm };
            const ex = await db.disclosure.findUnique({ where: { rcpNo } });
            await db.disclosure.upsert({
              where: { rcpNo },
              create: { rcpNo, code, corpCode, reportNm: "사업개요", pblntfTy: "A", rceptDt: r.rceptDt, category: "사업개요", payload: JSON.stringify(payload) },
              update: { payload: JSON.stringify(payload), rceptDt: r.rceptDt, fetchedAt: new Date() },
            });
            ex ? updated++ : inserted++;
          }
        }
      }
    } catch (err) {
      console.warn(`[business-sections] ${code} ${r.rcpNo} failed:`, err);
    }
  }
  return { inserted, updated, failed: 0 };
}
```

- [ ] **Step 3: 루프에 포함** — `fetchDisclosuresForStock`의 수집 함수 배열에 추가:
```ts
  for (const fn of [
    fetchEarnings,
    fetchOwnership,
    fetchTreasury,
    fetchBusinessSections,
    fetchDividends,
    fetchContracts,
  ]) {
```
(기존 배열에 `fetchBusinessSections` 한 줄 추가.)

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`PERIODIC_REPORT_REGEX`, `todayDateRange`, `parseRceptDt`, `emptyStats`, `fetchDartList`, `db`는 이미 파일에 존재.)

- [ ] **Step 5: Commit**

```bash
git add src/actions/disclosures.ts
git commit -m "feat(company-map): fetch business overview/sales/orders sections on refresh"
```

---

## Task 7: UI — 카드 + 섹션 + 네비

**Files:**
- Create: `src/app/stocks/[code]/SectionCard.tsx`
- Modify: `src/app/stocks/[code]/DisclosureTimeline.tsx`, `SectionNav.tsx`, `page.tsx`

- [ ] **Step 1: SectionCard 생성**

`src/app/stocks/[code]/SectionCard.tsx`:
```tsx
import type { SectionPayload } from "@/lib/dart/disclosure-payloads";

interface Props {
  reportNm: string;
  payload: SectionPayload | null;
  accent: string; // tailwind 카드 배경 클래스
  linkClass: string;
}

const PROSE =
  "text-sm leading-6 break-words overflow-x-auto " +
  "[&_table]:w-full [&_table]:my-2 [&_table]:border-collapse " +
  "[&_td]:border [&_td]:border-white/20 [&_td]:p-1 [&_td]:align-top " +
  "[&_th]:border [&_th]:border-white/20 [&_th]:p-1 " +
  "[&_p]:my-2 [&_img]:hidden";

export function SectionCard({ reportNm, payload, accent, linkClass }: Props) {
  if (!payload) return null;
  const dartUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${payload.sourceRcpNo}`;
  return (
    <article className={`rounded-lg ${accent} p-5 text-gray-100 shadow`}>
      <h3 className="text-base font-bold">{reportNm}</h3>
      {payload.reportNm && <p className="mt-1 text-xs text-gray-300">기준: {payload.reportNm}</p>}
      <div className={`mt-3 ${PROSE}`} dangerouslySetInnerHTML={{ __html: payload.html }} />
      <a href={dartUrl} target="_blank" rel="noopener noreferrer" className={`mt-3 inline-block text-xs ${linkClass} hover:underline`}>
        DART 원본 ↗
      </a>
    </article>
  );
}
```

- [ ] **Step 2: DisclosureTimeline 확장**

`DisclosureTimeline.tsx` import에 추가:
```tsx
import { SectionCard } from "./SectionCard";
import type { SectionPayload } from "@/lib/dart/disclosure-payloads";
```
`interface` 영역에 추가:
```tsx
export interface SectionItem extends BaseItem {
  payload: SectionPayload | null;
}
```
`Props`에 세 배열 추가:
```tsx
  bizOverview: SectionItem[];
  sales: SectionItem[];
  orders: SectionItem[];
```
함수 시그니처 구조분해에 `bizOverview, sales, orders` 추가. `<div className="space-y-8">` 안, 기존 `earnings` Section 앞에 추가:
```tsx
      <Section id="bizoverview" pinBg="bg-teal-500" label="사업개요" empty={bizOverview.length === 0}>
        {bizOverview.map((s) => (
          <SectionCard key={s.rcpNo} reportNm={s.reportNm} payload={s.payload} accent="bg-teal-900/80" linkClass="text-teal-200" />
        ))}
      </Section>
      <Section id="sales" pinBg="bg-lime-500" label="매출" empty={sales.length === 0}>
        {sales.map((s) => (
          <SectionCard key={s.rcpNo} reportNm={s.reportNm} payload={s.payload} accent="bg-lime-900/80" linkClass="text-lime-200" />
        ))}
      </Section>
      <Section id="orders" pinBg="bg-fuchsia-500" label="수주" empty={orders.length === 0}>
        {orders.map((s) => (
          <SectionCard key={s.rcpNo} reportNm={s.reportNm} payload={s.payload} accent="bg-fuchsia-900/80" linkClass="text-fuchsia-200" />
        ))}
      </Section>
```

- [ ] **Step 3: SectionNav 항목 추가**

`SectionNav.tsx`의 `ITEMS` 배열 맨 앞쪽(earnings 앞)에 추가:
```ts
  { id: "bizoverview", label: "사업개요", dotClass: "bg-teal-500" },
  { id: "sales", label: "매출", dotClass: "bg-lime-500" },
  { id: "orders", label: "수주", dotClass: "bg-fuchsia-500" },
```
(기존 항목 유지. 초기 active state가 `"earnings"`로 하드코딩돼 있으면 그대로 둬도 무방.)

- [ ] **Step 4: page.tsx 필터링·전달**

`page.tsx`에서 `SectionPayload` import 추가 후, 기존 earnings/dividends 필터처럼 추가:
```tsx
  const bizOverview = allDisclosures
    .filter((d) => d.category === "사업개요")
    .map((d) => ({ rcpNo: d.rcpNo, reportNm: d.reportNm, rceptDt: d.rceptDt, payload: d.payload ? (JSON.parse(d.payload) as SectionPayload) : null }));
  const sales = allDisclosures
    .filter((d) => d.category === "매출")
    .map((d) => ({ rcpNo: d.rcpNo, reportNm: d.reportNm, rceptDt: d.rceptDt, payload: d.payload ? (JSON.parse(d.payload) as SectionPayload) : null }));
  const orders = allDisclosures
    .filter((d) => d.category === "수주")
    .map((d) => ({ rcpNo: d.rcpNo, reportNm: d.reportNm, rceptDt: d.rceptDt, payload: d.payload ? (JSON.parse(d.payload) as SectionPayload) : null }));
```
그리고 `<DisclosureTimeline ... />`에 `bizOverview={bizOverview} sales={sales} orders={orders}` props 추가.

- [ ] **Step 5: 타입체크 + lint**

Run: `npx tsc --noEmit && yarn lint 2>&1 | grep -iE "SectionCard|DisclosureTimeline|stocks/\[code\]/page|SectionNav" || echo "신규 파일 lint 오류 없음"`
Expected: tsc 에러 없음; 신규/수정 파일 lint 오류 없음. (HTML 렌더는 `dangerouslySetInnerHTML` — sanitize 처리됨.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/stocks/[code]"
git commit -m "feat(company-map): render 사업개요/매출/수주 sections in stock detail"
```

---

## Task 8: 검증 (실종목)

**Files:** (없음 — 실행)

- [ ] **Step 1: 전체 tsc + report-sections 테스트**

Run: `npx tsc --noEmit && npx vitest run src/lib/dart/report-sections.test.ts`
Expected: tsc 클린, 테스트 통과.

- [ ] **Step 2: 005930 실수집 (DART 문서뷰어 — API 한도 무관)**

`/stocks/005930`에서 "공시 갱신" 클릭(또는 동등 경로). 잠시 후 DB 확인:
```bash
sqlite3 data/company-map.db "SELECT category, COUNT(*) FROM disclosures WHERE code='005930' AND category IN ('사업개요','매출','수주') GROUP BY category;"
```
Expected: 사업개요 1, 매출 1, 수주 ≥1.

- [ ] **Step 3: 화면 확인**

dev 서버 재시작 후(스키마 변경은 없으나 새 코드 반영) `/stocks/005930`에서 사업개요·매출·수주 섹션과 표가 렌더되는지, 수주가 분기별 카드로 여러 개 보이는지 확인.

---

## Self-Review 결과

- **Spec coverage:** treeData 파싱(T2)·매출/수주 분할·sanitize(T3)·viewer fetch(T4)·category+payload(T5)·수집(최신1개+분기누적)(T6)·UI 카드/섹션/네비/필터(T7)·검증(T8) 모두 매핑. 픽스처(T1).
- **Placeholder scan:** 모든 step에 실제 코드/명령. 미해결 placeholder 없음. (분할은 휴리스틱 — 픽스처 테스트로 검증, 실패 시 정규식 조정 명시.)
- **Type consistency:** `TreeNode`/`SectionKind`(T2) → `splitSalesOrders`/`sanitizeHtml`(T3) → `fetchViewerHtmlByParams`(T4) → `SectionPayload`/category(T5) → `fetchBusinessSections`(T6) → `SectionCard`/`SectionItem`(T7) 일관. 합성키 `bizoverview-/sales-/orders-{code}-{rcpNo}` 일관.

## 알려진 리스크
- 본문 표 구조·소제목 표기가 회사마다 달라 분할/추출이 빗나갈 수 있음(금융사는 수주상황 없음 → 카드 미생성). 픽스처 테스트로 005930 기준 검증하되, 다른 종목에서 어긋나면 정규식/휴리스틱 보강 필요.
