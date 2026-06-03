# 액티브 ETF 구성종목·비중 변화 추적 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** company-map의 `/stocks/etf` 페이지에서 관심 ETF의 KRX PDF(구성종목·비중)를 일별 스냅샷으로 모아 직전 대비 비중 상위 10종목의 신규·이탈·증감을 보여준다.

**Architecture:** worker(tsx) 컨텍스트가 KRX에서 PDF를 받아 `worker/db`로 스냅샷(상위 10종목)을 저장한다. 순수 함수(파서·diff)는 `src/lib/etf/`에 두어 Vitest로 테스트하고 worker가 `@/` alias로 재사용한다. Next 측 서버액션은 `@/lib/db`로 읽기만 하며 화면을 렌더한다.

**Tech Stack:** Next.js App Router, Prisma(SQLite, `@prisma-clients/company-map`), KRX MDC OpenAPI, Vitest, Tailwind.

**Spec:** `apps/company-map/docs/superpowers/specs/2026-06-03-active-etf-pdf-tracking.html`

> 모든 명령은 `apps/company-map/`에서 실행한다(특별한 언급이 없으면). 커밋은 사용자 승인 후에만 — 각 Task 끝의 commit 단계는 사용자가 자동 커밋을 허용한 경우에만 수행한다.

---

## File Structure

| 파일 | 책임 |
|------|------|
| `prisma/schema.prisma` | EtfWatch / EtfPdfSnapshot / EtfPdfHolding 모델 |
| `src/lib/etf/types.ts` | 공용 타입(Holding, HoldingChange, EtfDetailView) |
| `src/lib/etf/krx-pdf.ts` (+test) | KRX 응답 행 → Holding[] 순수 파서 |
| `src/lib/etf/diff.ts` (+test) | top-10 제한 + 직전 대비 diff 순수 함수 |
| `worker/fetch-krx-etf.ts` | KRX ETF 목록(ISIN 해석) + PDF fetch (네트워크) |
| `worker/etf-snapshot.ts` | 스냅샷 저장(worker/db, 상위 10, 중복 skip). 루프·스크립트 공용 |
| `worker/etf-pdf-loop.ts` | 일별 자동 스냅샷 루프 |
| `worker/index.ts` | 루프 기동 |
| `scripts/refresh-etf-pdf.ts` | 수동 갱신 1회 실행(전 관심 ETF) |
| `src/actions/refresh-jobs.ts` · `scripts/run-refresh-job.ts` | `etf_pdf` kind 추가 |
| `src/actions/etf.ts` | register/remove/list/getDetail 서버액션 |
| `src/app/stocks/etf/page.tsx` 등 | 페이지 + 등록/테이블/갱신 컴포넌트 |
| `src/components/layout/ActiveNav.tsx` · `src/app/stocks/page.tsx` | 진입 링크 |

---

## Task 1: Prisma 스키마 (EtfWatch / EtfPdfSnapshot / EtfPdfHolding)

**Files:**
- Modify: `prisma/schema.prisma` (모델 추가)

- [ ] **Step 1: 모델 추가**

`prisma/schema.prisma` 끝에 추가:

```prisma
model EtfWatch {
  code      String   @id
  isin      String?  @map("isin")
  name      String
  createdAt DateTime @default(now()) @map("created_at")

  snapshots EtfPdfSnapshot[]

  @@map("etf_watches")
}

model EtfPdfSnapshot {
  id        String   @id @default(uuid())
  etfCode   String   @map("etf_code")
  trdDd     String   @map("trd_dd")
  fetchedAt DateTime @default(now()) @map("fetched_at")

  watch    EtfWatch        @relation(fields: [etfCode], references: [code], onDelete: Cascade)
  holdings EtfPdfHolding[]

  @@unique([etfCode, trdDd])
  @@index([etfCode, trdDd])
  @@map("etf_pdf_snapshots")
}

model EtfPdfHolding {
  id              String  @id @default(uuid())
  snapshotId      String  @map("snapshot_id")
  constituentCode String  @map("constituent_code")
  constituentName String  @map("constituent_name")
  weight          Float?
  shares          Float?
  amount          Float?

  snapshot EtfPdfSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)

  @@index([snapshotId])
  @@map("etf_pdf_holdings")
}
```

- [ ] **Step 2: 마이그레이션 생성·적용 (실제 DB 경로 주의)**

`.env`의 `DATABASE_URL="file:../data/company-map.db"`는 `prisma/` 기준 상대경로라 실제 DB(`apps/company-map/data/company-map.db`)를 가리킨다. **DATABASE_URL을 오버라이드하지 말 것**(엉뚱한 빈 DB 생성 방지).

Run:
```bash
npx prisma migrate dev --name add_etf_pdf_tracking
```
Expected: `add_etf_pdf_tracking` 마이그레이션 생성·적용, Prisma Client 재생성.

- [ ] **Step 3: 컬럼 적용 확인**

Run:
```bash
sqlite3 data/company-map.db ".tables" | tr ' ' '\n' | grep etf_
```
Expected: `etf_watches`, `etf_pdf_snapshots`, `etf_pdf_holdings` 출력.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(company-map): add ETF PDF tracking schema"
```

---

## Task 2: KRX ETF 엔드포인트 확인 + 픽스처 캡처 (앱 런타임에서)

> ⚠️ 설계 세션 네트워크는 KRX에 차단(LOGOUT)되어 있었다. 이 Task는 **KRX가 정상 동작하는 환경**(사용자 로컬/worker 런타임)에서 수행해야 한다. 목적: ETF 목록·PDF 엔드포인트의 정확한 `bld`/파라미터/필드명을 확정하고 실제 응답을 픽스처로 저장한다.

**Files:**
- Create (임시): `scripts/_probe-krx-etf.ts`
- Create: `src/lib/etf/__fixtures__/krx-pdf.sample.json`

- [ ] **Step 1: 탐침 스크립트 작성**

`scripts/_probe-krx-etf.ts`:

```ts
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

const KRX = "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
const headers = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/x-www-form-urlencoded",
  Referer: "http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201060101",
};
function lastBiz(): string {
  const d = new Date(); d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}
const code = process.argv[2] ?? "0074K0";
(async () => {
  const trdDd = lastBiz();
  // 1) ETF 전종목 목록
  const listBody = new URLSearchParams({ bld: "dbms/MDC/STAT/standard/MDCSTAT04601", locale: "ko_KR", trdDd, share: "1", money: "1", csvxls_isNo: "false" });
  const listRes = await fetch(KRX, { method: "POST", headers, body: listBody.toString() });
  const list = await listRes.json();
  const lk = Object.keys(list).find((k) => Array.isArray((list as any)[k]) && (list as any)[k].length);
  const rows = lk ? (list as any)[lk] : [];
  console.log("[list] block key:", lk, "rows:", rows.length, "fields:", rows[0] && Object.keys(rows[0]));
  const match = rows.find((r: any) => r.ISU_SRT_CD === code);
  console.log("[list] match:", match);
  const isin = match?.ISU_CD;
  if (!isin) { console.error("ISIN 못 찾음 — 단축코드/필드명 확인 필요"); process.exit(1); }
  // 2) PDF 구성종목
  const pdfBody = new URLSearchParams({ bld: "dbms/MDC/STAT/standard/MDCSTAT05001", locale: "ko_KR", isuCd: isin, trdDd, share: "1", money: "1", csvxls_isNo: "false" });
  const pdfRes = await fetch(KRX, { method: "POST", headers, body: pdfBody.toString() });
  const pdf = await pdfRes.json();
  const pk = Object.keys(pdf).find((k) => Array.isArray((pdf as any)[k]) && (pdf as any)[k].length);
  const prows = pk ? (pdf as any)[pk] : [];
  console.log("[pdf] block key:", pk, "rows:", prows.length, "fields:", prows[0] && Object.keys(prows[0]));
  console.log("[pdf] sample:", JSON.stringify(prows.slice(0, 3), null, 2));
  // 픽스처 저장
  const fs = await import("node:fs");
  fs.mkdirSync("src/lib/etf/__fixtures__", { recursive: true });
  fs.writeFileSync("src/lib/etf/__fixtures__/krx-pdf.sample.json", JSON.stringify(pdf, null, 2));
  console.log("fixture saved.");
})();
```

- [ ] **Step 2: 실행해 엔드포인트·필드 확정**

Run:
```bash
npx tsx scripts/_probe-krx-etf.ts 0074K0
```
Expected: `[list] block key` / `[pdf] block key`와 각 행의 필드명이 출력되고 `src/lib/etf/__fixtures__/krx-pdf.sample.json` 저장.

**확정 사항을 기록한다**(다음 Task들이 의존):
- ETF 목록 블록키(예상 `OutBlock_1`), 단축코드 필드 `ISU_SRT_CD`, ISIN 필드 `ISU_CD`, 종목명 `ISU_ABBRV`.
- PDF 블록키(예상 `output`), 구성종목 필드 — KRX 관례상: 코드 `COMPST_ISU_CD`, 명 `COMPST_ISU_NM`, 비중 `COMPST_RTO`, 주식수 `COMPST_ISU_CU1_SHRS`, 금액 `VALU_AMT`.

> 실제 출력이 위 예상과 다르면, Task 3·4·6의 필드명을 출력값으로 교체한다.

- [ ] **Step 3: 탐침 스크립트 삭제, 픽스처만 커밋**

```bash
rm scripts/_probe-krx-etf.ts
git add src/lib/etf/__fixtures__/krx-pdf.sample.json
git commit -m "test(company-map): add KRX ETF PDF response fixture"
```

---

## Task 3: 공용 타입

**Files:**
- Create: `src/lib/etf/types.ts`

- [ ] **Step 1: 타입 정의**

```ts
// KRX PDF 파서·diff·UI 공용 타입
export interface Holding {
  constituentCode: string;
  constituentName: string;
  weight: number | null;   // 비중 %
  shares: number | null;   // 주식수/계약수
  amount: number | null;   // 평가금액(원)
}

export type HoldingStatus = "신규" | "유지" | "이탈"; // Top10 기준

export interface HoldingChange extends Holding {
  status: HoldingStatus;
  weightDelta: number | null;  // %p (최신 - 직전)
  sharesDelta: number | null;
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add src/lib/etf/types.ts
git commit -m "feat(company-map): add ETF holding types"
```

---

## Task 4: KRX PDF 파서 (순수 함수, 픽스처 TDD)

**Files:**
- Create: `src/lib/etf/krx-pdf.ts`
- Test: `src/lib/etf/krx-pdf.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/etf/krx-pdf.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { parsePdfResponse } from "./krx-pdf";

const sample = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "krx-pdf.sample.json"), "utf-8"),
);

describe("parsePdfResponse", () => {
  it("KRX PDF 응답을 Holding[]로 파싱한다", () => {
    const holdings = parsePdfResponse(sample);
    expect(holdings.length).toBeGreaterThan(0);
    const h = holdings[0];
    expect(typeof h.constituentName).toBe("string");
    expect(h.constituentName.length).toBeGreaterThan(0);
    // 비중은 숫자 또는 null
    expect(h.weight === null || typeof h.weight === "number").toBe(true);
  });

  it("비중 합이 대략 100 근처거나 0보다 크다", () => {
    const holdings = parsePdfResponse(sample);
    const sum = holdings.reduce((s, h) => s + (h.weight ?? 0), 0);
    expect(sum).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/etf/krx-pdf.test.ts`
Expected: FAIL (`parsePdfResponse` 미정의).

- [ ] **Step 3: 파서 구현**

`src/lib/etf/krx-pdf.ts` (필드명은 Task 2에서 확정한 값으로 — 아래는 KRX 관례 기준 기본값):

```ts
import type { Holding } from "./types";

function num(v: unknown): number | null {
  if (v == null) return null;
  const cleaned = String(v).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// KRX getJsonData 응답에서 첫 비어있지 않은 배열 블록을 찾는다.
function firstArrayBlock(resp: Record<string, unknown>): unknown[] {
  for (const k of Object.keys(resp)) {
    const v = resp[k];
    if (Array.isArray(v) && v.length) return v;
  }
  return [];
}

interface KrxPdfRow {
  COMPST_ISU_CD?: string;
  COMPST_ISU_NM?: string;
  COMPST_RTO?: string;
  COMPST_ISU_CU1_SHRS?: string;
  VALU_AMT?: string;
  [k: string]: unknown;
}

export function parsePdfResponse(resp: Record<string, unknown>): Holding[] {
  const rows = firstArrayBlock(resp) as KrxPdfRow[];
  return rows
    .map((r): Holding | null => {
      const name = (r.COMPST_ISU_NM ?? "").toString().trim();
      if (!name) return null;
      return {
        constituentCode: (r.COMPST_ISU_CD ?? "").toString().trim(),
        constituentName: name,
        weight: num(r.COMPST_RTO),
        shares: num(r.COMPST_ISU_CU1_SHRS),
        amount: num(r.VALU_AMT),
      };
    })
    .filter((h): h is Holding => h !== null);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/etf/krx-pdf.test.ts`
Expected: PASS (2 tests). 실패 시 Task 2에서 확정한 실제 필드명으로 `KrxPdfRow` 키를 교체.

- [ ] **Step 5: Commit**

```bash
git add src/lib/etf/krx-pdf.ts src/lib/etf/krx-pdf.test.ts
git commit -m "feat(company-map): parse KRX ETF PDF response"
```

---

## Task 5: top-10 제한 + 직전 대비 diff (순수 함수 TDD)

**Files:**
- Create: `src/lib/etf/diff.ts`
- Test: `src/lib/etf/diff.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/etf/diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { topN, diffHoldings } from "./diff";
import type { Holding } from "./types";

const mk = (code: string, weight: number, shares = 100): Holding => ({
  constituentCode: code, constituentName: `종목${code}`, weight, shares, amount: weight * 1000,
});

describe("topN", () => {
  it("비중 내림차순 상위 N만 남긴다", () => {
    const hs = [mk("A", 5), mk("B", 30), mk("C", 10)];
    const top2 = topN(hs, 2);
    expect(top2.map((h) => h.constituentCode)).toEqual(["B", "C"]);
  });
});

describe("diffHoldings", () => {
  it("신규/유지/이탈과 비중·주식수 증감을 계산한다", () => {
    const latest = [mk("A", 40, 120), mk("B", 35, 100), mk("C", 25, 50)]; // C 신규
    const prev = [mk("A", 30, 100), mk("B", 45, 100), mk("D", 25, 80)];   // D 이탈
    const changes = diffHoldings(latest, prev);

    const byCode = Object.fromEntries(changes.map((c) => [c.constituentCode, c]));
    expect(byCode["A"].status).toBe("유지");
    expect(byCode["A"].weightDelta).toBeCloseTo(10);   // 40-30
    expect(byCode["A"].sharesDelta).toBe(20);          // 120-100
    expect(byCode["C"].status).toBe("신규");
    expect(byCode["C"].weightDelta).toBeNull();
    expect(byCode["D"].status).toBe("이탈");
    expect(byCode["D"].weight).toBeNull();             // 최신엔 없음

    // 정렬: 유지/신규는 비중 내림차순, 이탈은 맨 뒤
    expect(changes[changes.length - 1].constituentCode).toBe("D");
  });

  it("직전 스냅샷이 없으면 전부 유지로 표기하고 증감은 null", () => {
    const latest = [mk("A", 60), mk("B", 40)];
    const changes = diffHoldings(latest, null);
    expect(changes.every((c) => c.status === "유지")).toBe(true);
    expect(changes.every((c) => c.weightDelta === null)).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/etf/diff.test.ts`
Expected: FAIL (`topN`/`diffHoldings` 미정의).

- [ ] **Step 3: 구현**

`src/lib/etf/diff.ts`:

```ts
import type { Holding, HoldingChange } from "./types";

export function topN(holdings: Holding[], n: number): Holding[] {
  return [...holdings]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, n);
}

// 최신·직전 holdings(이미 top-10)를 비교. prev가 null이면 전부 유지.
export function diffHoldings(
  latest: Holding[],
  prev: Holding[] | null,
): HoldingChange[] {
  const prevByCode = new Map((prev ?? []).map((h) => [h.constituentCode, h]));
  const latestCodes = new Set(latest.map((h) => h.constituentCode));

  const present: HoldingChange[] = latest.map((h) => {
    const p = prevByCode.get(h.constituentCode);
    const isNew = prev != null && !p;
    return {
      ...h,
      status: isNew ? "신규" : "유지",
      weightDelta: p && h.weight != null && p.weight != null ? h.weight - p.weight : null,
      sharesDelta: p && h.shares != null && p.shares != null ? h.shares - p.shares : null,
    };
  });
  present.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  const dropped: HoldingChange[] = (prev ?? [])
    .filter((h) => !latestCodes.has(h.constituentCode))
    .map((h) => ({
      constituentCode: h.constituentCode,
      constituentName: h.constituentName,
      weight: null,
      shares: null,
      amount: null,
      status: "이탈",
      weightDelta: null,
      sharesDelta: null,
    }));

  return [...present, ...dropped];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/etf/diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/etf/diff.ts src/lib/etf/diff.test.ts
git commit -m "feat(company-map): top-10 limit and previous-snapshot diff"
```

---

## Task 6: KRX fetch (ISIN 해석 + PDF)

**Files:**
- Create: `worker/fetch-krx-etf.ts`

- [ ] **Step 1: 구현**

`worker/fetch-krx-etf.ts` (헤더는 `worker/fetch-krx.ts`와 동일 패턴; 파서는 Task 4 재사용):

```ts
import { parsePdfResponse } from "@/lib/etf/krx-pdf";
import type { Holding } from "@/lib/etf/types";

const KRX_URL = "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
const headers = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
  "Content-Type": "application/x-www-form-urlencoded",
  Referer: "http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201060101",
};

export function lastBusinessDay(d = new Date()): string {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  if (x.getDay() === 0) x.setDate(x.getDate() - 2);
  else if (x.getDay() === 6) x.setDate(x.getDate() - 1);
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
}

interface EtfListRow { ISU_CD?: string; ISU_SRT_CD?: string; ISU_ABBRV?: string; [k: string]: unknown }

async function krxPost(body: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(KRX_URL, { method: "POST", headers, body: body.toString() });
  if (!res.ok) throw new Error(`KRX HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function firstArray<T>(resp: Record<string, unknown>): T[] {
  for (const k of Object.keys(resp)) {
    const v = resp[k];
    if (Array.isArray(v) && v.length) return v as T[];
  }
  return [];
}

// 단축코드 → { isin, name }. Task 2에서 확정한 필드명 사용.
export async function resolveEtf(
  code: string,
  trdDd = lastBusinessDay(),
): Promise<{ isin: string; name: string } | null> {
  const body = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT04601", locale: "ko_KR",
    trdDd, share: "1", money: "1", csvxls_isNo: "false",
  });
  const rows = firstArray<EtfListRow>(await krxPost(body));
  const match = rows.find((r) => r.ISU_SRT_CD === code);
  if (!match?.ISU_CD) return null;
  return { isin: match.ISU_CD, name: (match.ISU_ABBRV ?? code).trim() };
}

export async function fetchEtfPdf(
  isin: string,
  trdDd = lastBusinessDay(),
): Promise<Holding[]> {
  const body = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT05001", locale: "ko_KR",
    isuCd: isin, trdDd, share: "1", money: "1", csvxls_isNo: "false",
  });
  return parsePdfResponse(await krxPost(body));
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 런타임 스모크 (KRX 정상 환경)**

임시 확인: `npx tsx -e "import('./worker/fetch-krx-etf').then(async m => { const e = await m.resolveEtf('0074K0'); console.log(e); console.log((await m.fetchEtfPdf(e.isin)).slice(0,3)); })"`
Expected: `{ isin, name }`와 holdings 3건 출력. (네트워크 차단 환경이면 Task 9 통합 후 worker 로그로 확인.)

- [ ] **Step 4: Commit**

```bash
git add worker/fetch-krx-etf.ts
git commit -m "feat(company-map): fetch KRX ETF list and PDF"
```

---

## Task 7: 스냅샷 저장 (worker/db, 상위 10, 중복 skip)

**Files:**
- Create: `worker/etf-snapshot.ts`

- [ ] **Step 1: 구현**

`worker/etf-snapshot.ts`:

```ts
import { db } from "./db";
import { resolveEtf, fetchEtfPdf, lastBusinessDay } from "./fetch-krx-etf";
import { topN } from "@/lib/etf/diff";

// 관심 ETF 1개의 최신 영업일 스냅샷을 저장(상위 10). 이미 있으면 skip.
export async function snapshotEtf(code: string, trdDd = lastBusinessDay()): Promise<"saved" | "skipped" | "failed"> {
  try {
    const watch = await db.etfWatch.findUnique({ where: { code } });
    if (!watch) return "failed";

    // ISIN/name 미해석이면 해석해 보강
    let isin = watch.isin;
    if (!isin) {
      const r = await resolveEtf(code, trdDd);
      if (!r) return "failed";
      isin = r.isin;
      await db.etfWatch.update({ where: { code }, data: { isin: r.isin, name: r.name } });
    }

    const existing = await db.etfPdfSnapshot.findUnique({ where: { etfCode_trdDd: { etfCode: code, trdDd } } });
    if (existing) return "skipped";

    const holdings = topN(await fetchEtfPdf(isin, trdDd), 10);
    if (holdings.length === 0) return "failed";

    await db.etfPdfSnapshot.create({
      data: {
        etfCode: code,
        trdDd,
        holdings: {
          create: holdings.map((h) => ({
            constituentCode: h.constituentCode,
            constituentName: h.constituentName,
            weight: h.weight,
            shares: h.shares,
            amount: h.amount,
          })),
        },
      },
    });
    return "saved";
  } catch (err) {
    console.error(`[etf-snapshot] ${code} failed:`, err);
    return "failed";
  }
}

// 모든 관심 ETF 스냅샷. 개별 실패가 전체를 막지 않음.
export async function snapshotAllEtfs(): Promise<void> {
  const watches = await db.etfWatch.findMany();
  const trdDd = lastBusinessDay();
  for (const w of watches) {
    const r = await snapshotEtf(w.code, trdDd);
    console.log(`[etf-snapshot] ${w.code} (${trdDd}): ${r}`);
  }
}
```

> 복합 unique 접근자 이름은 Prisma 기본 규칙상 `etfCode_trdDd`. 생성된 클라이언트에서 실제 이름이 다르면(예: 맵핑) 그에 맞춘다.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (Task 1 마이그레이션으로 `db.etfWatch`/`etfPdfSnapshot` 타입 존재).

- [ ] **Step 3: Commit**

```bash
git add worker/etf-snapshot.ts
git commit -m "feat(company-map): persist ETF PDF snapshot (top-10, dedupe)"
```

---

## Task 8: 수동 갱신 스크립트 + refresh kind 등록

**Files:**
- Create: `scripts/refresh-etf-pdf.ts`
- Modify: `scripts/run-refresh-job.ts` (Kind, SCRIPTS)
- Modify: `src/actions/refresh-jobs.ts` (RefreshKind, VALID_KINDS)

- [ ] **Step 1: 갱신 스크립트**

`scripts/refresh-etf-pdf.ts`:

```ts
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { snapshotAllEtfs } from "../worker/etf-snapshot";

(async () => {
  await snapshotAllEtfs();
  process.exit(0);
})();
```

- [ ] **Step 2: run-refresh-job.ts에 kind 추가**

`scripts/run-refresh-job.ts`:
- `type Kind` 유니온에 `| "etf_pdf"` 추가.
- `SCRIPTS` 객체에 추가: `etf_pdf: ["scripts/refresh-etf-pdf.ts"],`

- [ ] **Step 3: refresh-jobs.ts에 kind 추가**

`src/actions/refresh-jobs.ts`:
- `export type RefreshKind = ... | "etf_pdf";`
- `VALID_KINDS` Set에 `"etf_pdf"` 추가.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add scripts/refresh-etf-pdf.ts scripts/run-refresh-job.ts src/actions/refresh-jobs.ts
git commit -m "feat(company-map): manual etf_pdf refresh job"
```

---

## Task 9: worker 자동 일별 루프

**Files:**
- Create: `worker/etf-pdf-loop.ts`
- Modify: `worker/index.ts`

- [ ] **Step 1: 루프 구현 (price-change-loop 패턴)**

`worker/etf-pdf-loop.ts`:

```ts
import { snapshotAllEtfs } from "./etf-snapshot";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30분 폴
const SCHEDULE_HOUR_KST = 19;             // 18시 PDF 확정 후

let lastRunDay = "";

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export async function etfPdfLoop(): Promise<void> {
  console.log("[etf-pdf-loop] starting (30min poll, schedule 19:00 KST)");
  while (true) {
    try {
      const now = new Date();
      if (now.getHours() >= SCHEDULE_HOUR_KST && lastRunDay !== todayKey(now)) {
        console.log("[etf-pdf-loop] running at", now.toISOString());
        await snapshotAllEtfs(); // 스냅샷 중복은 (etfCode,trdDd)로 내부 skip
        lastRunDay = todayKey(now);
      }
    } catch (e) {
      console.error("[etf-pdf-loop] iteration failed:", e);
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  }
}
```

- [ ] **Step 2: index.ts에서 루프 기동**

`worker/index.ts`:
- import 추가: `import { etfPdfLoop } from "./etf-pdf-loop";`
- 하단 `else` 분기에서 priceChangeLoop와 나란히 기동 추가:

```ts
  etfPdfLoop().catch((err) =>
    console.error("[worker] etf-pdf loop crashed:", err),
  );
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add worker/etf-pdf-loop.ts worker/index.ts
git commit -m "feat(company-map): daily ETF PDF snapshot loop"
```

---

## Task 10: 서버액션 (등록/삭제/목록/상세)

**Files:**
- Create: `src/actions/etf.ts`

- [ ] **Step 1: 구현**

`src/actions/etf.ts`:

```ts
"use server";

import { spawn } from "node:child_process";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { diffHoldings } from "@/lib/etf/diff";
import type { Holding, HoldingChange } from "@/lib/etf/types";

export interface EtfWatchView {
  code: string;
  name: string;
  isin: string | null;
  latestTrdDd: string | null;
}

export interface EtfDetailView {
  code: string;
  name: string;
  latestTrdDd: string | null;
  prevTrdDd: string | null;
  changes: HoldingChange[];
}

const CODE_RE = /^[0-9A-Z]{6}$/;

export async function listEtfWatches(): Promise<EtfWatchView[]> {
  const rows = await db.etfWatch.findMany({
    orderBy: { createdAt: "asc" },
    include: { snapshots: { orderBy: { trdDd: "desc" }, take: 1, select: { trdDd: true } } },
  });
  return rows.map((r) => ({
    code: r.code, name: r.name, isin: r.isin,
    latestTrdDd: r.snapshots[0]?.trdDd ?? null,
  }));
}

export async function registerEtf(rawCode: string): Promise<{ ok: boolean; reason?: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) return { ok: false, reason: "코드 형식 오류 (6자리 영숫자)" };
  const exists = await db.etfWatch.findUnique({ where: { code } });
  if (exists) return { ok: false, reason: "이미 등록됨" };

  await db.etfWatch.create({ data: { code, name: code } }); // name/isin은 스냅샷 잡이 보강
  // 첫 스냅샷을 백그라운드로 즉시 수집 (기존 refresh 잡 패턴과 동일한 spawn)
  const child = spawn("npx", ["tsx", "scripts/refresh-etf-pdf.ts"], {
    cwd: process.cwd(), detached: true, stdio: "ignore", env: process.env,
  });
  child.unref();

  revalidatePath("/stocks/etf");
  return { ok: true };
}

export async function removeEtf(code: string): Promise<{ ok: boolean }> {
  await db.etfWatch.delete({ where: { code } }).catch(() => {});
  revalidatePath("/stocks/etf");
  return { ok: true };
}

export async function getEtfDetail(code: string): Promise<EtfDetailView | null> {
  const watch = await db.etfWatch.findUnique({ where: { code } });
  if (!watch) return null;
  const snaps = await db.etfPdfSnapshot.findMany({
    where: { etfCode: code },
    orderBy: { trdDd: "desc" },
    take: 2,
    include: { holdings: true },
  });
  const toHoldings = (hs: typeof snaps[number]["holdings"]): Holding[] =>
    hs.map((h) => ({
      constituentCode: h.constituentCode, constituentName: h.constituentName,
      weight: h.weight, shares: h.shares, amount: h.amount,
    }));
  const latest = snaps[0] ? toHoldings(snaps[0].holdings) : [];
  const prev = snaps[1] ? toHoldings(snaps[1].holdings) : null;
  return {
    code: watch.code, name: watch.name,
    latestTrdDd: snaps[0]?.trdDd ?? null,
    prevTrdDd: snaps[1]?.trdDd ?? null,
    changes: latest.length ? diffHoldings(latest, prev) : [],
  };
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add src/actions/etf.ts
git commit -m "feat(company-map): ETF watch server actions"
```

---

## Task 11: UI 페이지 + 컴포넌트

**Files:**
- Create: `src/app/stocks/etf/page.tsx`
- Create: `src/app/stocks/etf/EtfManager.tsx`

- [ ] **Step 1: 페이지(서버 컴포넌트)**

`src/app/stocks/etf/page.tsx`:

```tsx
import Link from "next/link";
import { listEtfWatches, getEtfDetail } from "@/actions/etf";
import { EtfManager } from "./EtfManager";

export const dynamic = "force-dynamic";

export default async function EtfPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const watches = await listEtfWatches();
  const selected = code ?? watches[0]?.code ?? null;
  const detail = selected ? await getEtfDetail(selected) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/stocks" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← 전종목 조회
      </Link>
      <h1 className="mt-4 mb-4 text-xl font-bold">액티브 ETF 구성종목 변화</h1>
      <EtfManager watches={watches} selected={selected} detail={detail} />
    </main>
  );
}
```

- [ ] **Step 2: 관리 컴포넌트(클라이언트)**

`src/app/stocks/etf/EtfManager.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerEtf, removeEtf, type EtfWatchView, type EtfDetailView } from "@/actions/etf";
import { triggerRefresh } from "@/actions/refresh-jobs";

function pct(v: number | null): string { return v == null ? "—" : `${v.toFixed(2)}%`; }
function deltaP(v: number | null): string { return v == null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%p`; }
function deltaColor(v: number | null): string {
  if (v == null || v === 0) return "text-gray-400";
  return v > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

export function EtfManager({
  watches, selected, detail,
}: { watches: EtfWatchView[]; selected: string | null; detail: EtfDetailView | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const add = () => start(async () => {
    const r = await registerEtf(code);
    setMsg(r.ok ? "등록됨 — 첫 스냅샷 수집 중(잠시 후 새로고침)" : (r.reason ?? "실패"));
    if (r.ok) setCode("");
    router.refresh();
  });
  const refresh = () => start(async () => {
    await triggerRefresh("etf_pdf");
    setMsg("구성종목 갱신 시작됨 (잠시 후 새로고침)");
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="ETF 단축코드 (예: 0074K0)"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button onClick={add} disabled={pending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60">
          관심 ETF 추가
        </button>
        <button onClick={refresh} disabled={pending}
          className="rounded border border-blue-500 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40">
          구성종목 갱신
        </button>
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {watches.map((w) => (
          <span key={w.code} className="inline-flex items-center gap-1">
            <button
              onClick={() => router.push(`/stocks/etf?code=${w.code}`)}
              className={`rounded px-2 py-1 text-sm ${
                w.code === selected ? "bg-blue-600 text-white" : "border border-gray-300 dark:border-gray-700"
              }`}>
              {w.name} ({w.code})
            </button>
            <button onClick={() => start(async () => { await removeEtf(w.code); router.refresh(); })}
              className="text-gray-400 hover:text-red-600" aria-label={`${w.code} 삭제`}>×</button>
          </span>
        ))}
        {watches.length === 0 && <span className="text-sm text-gray-500">등록된 ETF가 없습니다.</span>}
      </div>

      {detail && (
        <section>
          <div className="mb-2 text-sm text-gray-500">
            기준일 {detail.latestTrdDd ?? "—"}
            {detail.prevTrdDd ? ` · 직전 ${detail.prevTrdDd} 대비` : " · 비교할 직전 데이터 없음"}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-left">
                  <th className="border-b p-2">종목명</th>
                  <th className="border-b p-2 text-right">비중</th>
                  <th className="border-b p-2 text-right">비중Δ</th>
                  <th className="border-b p-2">상태</th>
                  <th className="border-b p-2 text-right">주식수</th>
                  <th className="border-b p-2 text-right">주식수Δ</th>
                </tr>
              </thead>
              <tbody>
                {detail.changes.map((c) => (
                  <tr key={c.constituentCode} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="p-2">{c.constituentName}</td>
                    <td className="p-2 text-right">{pct(c.weight)}</td>
                    <td className={`p-2 text-right ${deltaColor(c.weightDelta)}`}>{deltaP(c.weightDelta)}</td>
                    <td className="p-2">
                      {c.status === "신규" && <span className="text-green-600 dark:text-green-400">신규(Top10 진입)</span>}
                      {c.status === "이탈" && <span className="text-red-600 dark:text-red-400">이탈(Top10 밖)</span>}
                      {c.status === "유지" && <span className="text-gray-400">유지</span>}
                    </td>
                    <td className="p-2 text-right">{c.shares?.toLocaleString() ?? "—"}</td>
                    <td className={`p-2 text-right ${deltaColor(c.sharesDelta)}`}>
                      {c.sharesDelta == null ? "" : `${c.sharesDelta >= 0 ? "+" : ""}${c.sharesDelta.toLocaleString()}`}
                    </td>
                  </tr>
                ))}
                {detail.changes.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-gray-500">스냅샷이 아직 없습니다. "구성종목 갱신"을 눌러주세요.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 타입체크 + lint**

Run: `npx tsc --noEmit && yarn lint`
Expected: 신규 파일 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add "src/app/stocks/etf"
git commit -m "feat(company-map): ETF PDF tracking page and UI"
```

---

## Task 12: 진입 링크 (전종목 조회 페이지 + 메뉴)

**Files:**
- Modify: `src/app/stocks/page.tsx` (헤더에 링크)
- Modify: `src/components/layout/ActiveNav.tsx` (NAV_ITEMS)

- [ ] **Step 1: 전종목 조회 페이지에 링크 추가**

`src/app/stocks/page.tsx`의 제목/상단 영역에 추가(기존 마크업에 맞춰):

```tsx
<Link href="/stocks/etf" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
  액티브 ETF 구성종목 변화 →
</Link>
```
(`import Link from "next/link";`가 없으면 추가.)

- [ ] **Step 2: 네비에 항목 추가**

`src/components/layout/ActiveNav.tsx`의 `NAV_ITEMS` 배열에 추가:

```ts
  { path: "/stocks/etf", label: "ETF" },
```

- [ ] **Step 3: 타입체크 + lint**

Run: `npx tsc --noEmit && yarn lint`
Expected: 에러 없음.

- [ ] **Step 4: 수동 E2E 확인**

dev 서버에서 `/stocks/etf` 접속 → `0074K0` 추가 → "구성종목 갱신" → 잠시 후 새로고침 → 상위 10 구성종목 표시. 다음 영업일(또는 두 번째 스냅샷) 후 비중Δ·신규/이탈 표시 확인.

- [ ] **Step 5: Commit**

```bash
git add src/app/stocks/page.tsx src/components/layout/ActiveNav.tsx
git commit -m "feat(company-map): link to ETF tracking page"
```

---

## Self-Review 결과

- **Spec coverage:** 데이터모델(T1)·KRX 소스(T2,T6)·상위10(T5,T7)·일별+수동 수집(T8,T9)·직전 대비 diff(T5,T10)·UI(T11)·진입(T12)·테스트(T4,T5)·에러처리(T7,T10 graceful) 모두 매핑됨.
- **Placeholder scan:** KRX 필드명만 Task 2 결과에 의존 — 해당 Task가 확정·교체를 명시하므로 미해결 placeholder 아님. 그 외 모든 step에 실제 코드 포함.
- **Type consistency:** `Holding`/`HoldingChange`(T3) → 파서(T4)·diff(T5)·fetch(T6)·snapshot(T7)·actions(T10)·UI(T11) 전반에서 동일 사용. `snapshotAllEtfs`(T7)를 T8·T9가 호출. `triggerRefresh("etf_pdf")`(T8 kind) UI(T11) 호출 일치.

## 알려진 의존/리스크
- KRX 엔드포인트는 앱 런타임에서만 검증 가능(설계 환경 IP 차단). Task 2가 게이트.
- `yarn add` 등으로 node_modules 정리 시 company-map Prisma 클라이언트 재생성 필요(이미 `postinstall`로 자동화됨).
