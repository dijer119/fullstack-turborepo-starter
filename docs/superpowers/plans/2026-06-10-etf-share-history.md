# ETF 구성종목 주식수 변경 이력 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks/etf?code=...` 페이지에 구성종목별 보유 주식수의 날짜별 이력 매트릭스 표 + 행 클릭 시 라인 차트를 추가한다.

**Architecture:** 이미 누적 중인 `EtfPdfSnapshot`/`EtfPdfHolding` 데이터를 조회만 한다 (스키마·수집 변경 없음). 순수 pivot 함수 `buildShareHistory()`(`src/lib/etf/history.ts`, Vitest 테스트)를 server action `getEtfShareHistory()`가 호출하고, 결과를 client component `ShareHistorySection`이 렌더한다. 기존 `getEtfDetail`(2개 스냅샷 diff)은 건드리지 않는다.

**Tech Stack:** Next.js 16 App Router (Server Actions), Prisma(SQLite), Vitest, Recharts ^3.8.1, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-06-10-etf-share-history-design.html`

**작업 디렉토리:** 모든 경로는 `apps/company-map/` 기준. 테스트 실행은 리포 루트에서 `yarn workspace company-map ...`.

**도메인 컨텍스트 (5분 요약):**
- ETF 워커가 일별로 Naver API에서 **Top10 구성종목**(코드·이름·비중·주식수)을 스냅샷으로 저장한다. `trdDd`는 `"YYYYMMDD"` 문자열 (예: `"20260610"`).
- Top10 기반이라 어떤 종목이 Top10 밖으로 밀려난 날짜는 데이터가 없다 → 매트릭스에서 `null` 셀(`—` 표시)이 정상이다.
- `Holding` 타입(`src/lib/etf/types.ts`): `{ constituentCode, constituentName, weight, shares, amount }` — 전부 nullable 숫자, 코드는 빈 문자열일 수 있다(파서가 이름만 준 경우).
- 색상 컨벤션: 증가=초록(`text-green-600 dark:text-green-400`), 감소=빨강(`text-red-600 dark:text-red-400`) — 기존 `EtfManager.tsx`의 `deltaColor`와 동일하게.

---

### Task 1: `buildShareHistory()` 순수 함수 (TDD)

**Files:**
- Create: `apps/company-map/src/lib/etf/history.ts`
- Create: `apps/company-map/src/lib/etf/history.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/company-map/src/lib/etf/history.test.ts` 생성:

```typescript
import { describe, it, expect } from "vitest";
import { buildShareHistory } from "./history";
import type { Holding } from "./types";

const mk = (code: string, weight: number, shares: number | null = 100): Holding => ({
  constituentCode: code, constituentName: `종목${code}`, weight, shares, amount: null,
});

describe("buildShareHistory", () => {
  it("스냅샷을 종목×날짜 매트릭스로 pivot한다 (dates 오름차순, cells 길이 = dates 길이)", () => {
    const h = buildShareHistory([
      { trdDd: "20260609", holdings: [mk("A", 40, 120)] },
      { trdDd: "20260605", holdings: [mk("A", 40, 100)] },
    ]);
    expect(h.dates).toEqual(["20260605", "20260609"]);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].cells).toHaveLength(2);
    expect(h.rows[0].cells.map((c) => c?.shares)).toEqual([100, 120]);
  });

  it("delta는 직전 관측치 대비로 계산하고 변동 없으면 0", () => {
    const h = buildShareHistory([
      { trdDd: "20260605", holdings: [mk("A", 40, 100)] },
      { trdDd: "20260608", holdings: [mk("A", 40, 100)] },
      { trdDd: "20260609", holdings: [mk("A", 40, 125)] },
    ]);
    const cells = h.rows[0].cells;
    expect(cells[0]?.delta).toBeNull(); // 첫 등장
    expect(cells[1]?.delta).toBe(0);
    expect(cells[2]?.delta).toBe(25);
  });

  it("신규 진입 종목은 이전 날짜 셀이 null이고 첫 셀 delta는 null", () => {
    const h = buildShareHistory([
      { trdDd: "20260605", holdings: [mk("A", 40)] },
      { trdDd: "20260609", holdings: [mk("A", 40), mk("B", 10, 12000)] },
    ]);
    const b = h.rows.find((r) => r.constituentCode === "B")!;
    expect(b.cells[0]).toBeNull();
    expect(b.cells[1]).toEqual({ shares: 12000, delta: null });
  });

  it("이탈 후 재진입 시 공백 셀은 null, 재진입 delta는 마지막 관측치 대비", () => {
    const h = buildShareHistory([
      { trdDd: "20260605", holdings: [mk("A", 40, 100), mk("B", 10, 50)] },
      { trdDd: "20260608", holdings: [mk("A", 40, 100)] }, // B 이탈
      { trdDd: "20260609", holdings: [mk("A", 40, 100), mk("B", 10, 80)] }, // B 재진입
    ]);
    const b = h.rows.find((r) => r.constituentCode === "B")!;
    expect(b.cells[1]).toBeNull();
    expect(b.cells[2]?.delta).toBe(30); // 80 - 50 (공백 건너뜀)
  });

  it("정렬: 최신 포함 종목이 최신 비중 내림차순으로 먼저, 이탈 종목은 하단", () => {
    const h = buildShareHistory([
      { trdDd: "20260605", holdings: [mk("A", 40), mk("D", 30)] },
      { trdDd: "20260609", holdings: [mk("B", 50), mk("A", 20)] }, // D 이탈
    ]);
    expect(h.rows.map((r) => r.constituentCode)).toEqual(["B", "A", "D"]);
    expect(h.rows.find((r) => r.constituentCode === "D")!.inLatest).toBe(false);
    expect(h.rows.find((r) => r.constituentCode === "B")!.latestWeight).toBe(50);
  });

  it("빈 입력이면 빈 결과를 반환한다 (throw 금지)", () => {
    expect(buildShareHistory([])).toEqual({ dates: [], rows: [] });
  });

  it("코드가 빈 문자열인 종목은 이름으로 행을 병합한다", () => {
    const noCode = (shares: number): Holding => ({
      constituentCode: "", constituentName: "원화예금", weight: 1, shares, amount: null,
    });
    const h = buildShareHistory([
      { trdDd: "20260605", holdings: [noCode(100)] },
      { trdDd: "20260609", holdings: [noCode(150)] },
    ]);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].cells[1]?.delta).toBe(50);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/etf/history.test.ts`
Expected: FAIL — `Cannot find module './history'` 또는 유사 import 오류

- [ ] **Step 3: 구현 작성**

`apps/company-map/src/lib/etf/history.ts` 생성:

```typescript
import type { Holding } from "./types";

// 스냅샷 누적분을 "종목 × 날짜" 매트릭스로 pivot한 주식수 이력.
// Top10 기반 수집이라 Top10 밖 기간은 셀이 null(공백)이다.
export interface ShareHistoryCell {
  shares: number | null;
  delta: number | null; // 직전 "관측치가 있는" 셀 대비 증감. 첫 등장이면 null
}

export interface ShareHistoryRow {
  constituentCode: string;
  constituentName: string;
  latestWeight: number | null; // 최신 스냅샷 비중 (정렬 기준)
  inLatest: boolean;           // 최신 Top10 포함 여부
  cells: (ShareHistoryCell | null)[]; // dates와 같은 길이
}

export interface ShareHistory {
  dates: string[]; // trdDd(YYYYMMDD) 오름차순
  rows: ShareHistoryRow[];
}

// 코드가 빈 문자열이면(현금성 자산 등) 이름으로 행을 식별한다.
const keyOf = (h: { constituentCode: string; constituentName: string }) =>
  h.constituentCode || h.constituentName;

export function buildShareHistory(
  snapshots: { trdDd: string; holdings: Holding[] }[],
): ShareHistory {
  const sorted = [...snapshots].sort((a, b) => a.trdDd.localeCompare(b.trdDd));
  const dates = sorted.map((s) => s.trdDd);

  const rowMap = new Map<string, ShareHistoryRow>();
  sorted.forEach((snap, i) => {
    for (const h of snap.holdings) {
      let row = rowMap.get(keyOf(h));
      if (!row) {
        row = {
          constituentCode: h.constituentCode,
          constituentName: h.constituentName,
          latestWeight: null,
          inLatest: false,
          cells: dates.map(() => null),
        };
        rowMap.set(keyOf(h), row);
      }
      row.constituentName = h.constituentName; // 최신 이름으로 갱신
      row.cells[i] = { shares: h.shares, delta: null };
    }
  });

  // delta: 공백(null 셀)을 건너뛰고 직전 관측치 대비
  for (const row of rowMap.values()) {
    let prevShares: number | null = null;
    let hasPrev = false;
    for (const cell of row.cells) {
      if (!cell) continue;
      cell.delta =
        hasPrev && cell.shares != null && prevShares != null
          ? cell.shares - prevShares
          : null;
      prevShares = cell.shares;
      hasPrev = true;
    }
  }

  const latest = sorted[sorted.length - 1];
  if (latest) {
    for (const h of latest.holdings) {
      const row = rowMap.get(keyOf(h));
      if (row) {
        row.inLatest = true;
        row.latestWeight = h.weight;
      }
    }
  }

  const rows = [...rowMap.values()].sort((a, b) => {
    if (a.inLatest !== b.inLatest) return a.inLatest ? -1 : 1;
    return (b.latestWeight ?? 0) - (a.latestWeight ?? 0);
  });

  return { dates, rows };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/etf/history.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 기존 테스트 회귀 확인 후 커밋**

Run: `yarn workspace company-map test`
Expected: 전체 PASS

```bash
git add apps/company-map/src/lib/etf/history.ts apps/company-map/src/lib/etf/history.test.ts
git commit -m "feat(company-map): ETF 주식수 이력 pivot 함수 buildShareHistory"
```

---

### Task 2: `getEtfShareHistory()` server action

**Files:**
- Modify: `apps/company-map/src/actions/etf.ts` (파일 끝, `getEtfDetail` 아래에 추가)

- [ ] **Step 1: 액션 추가**

`apps/company-map/src/actions/etf.ts` 상단 import에 추가:

```typescript
import { buildShareHistory, type ShareHistory } from "@/lib/etf/history";
```

파일 끝에 추가 (`"use server"` 파일이므로 async 함수만 export — 타입은 lib에서 가져온다):

```typescript
// 최근 N개 스냅샷의 구성종목 주식수 이력 매트릭스. 워치 미등록이면 null.
export async function getEtfShareHistory(
  code: string,
  limit = 30,
): Promise<ShareHistory | null> {
  const watch = await db.etfWatch.findUnique({ where: { code } });
  if (!watch) return null;
  const snaps = await db.etfPdfSnapshot.findMany({
    where: { etfCode: code },
    orderBy: { trdDd: "desc" },
    take: limit,
    include: { holdings: true },
  });
  return buildShareHistory(
    snaps.map((s) => ({
      trdDd: s.trdDd,
      holdings: s.holdings.map((h) => ({
        constituentCode: h.constituentCode,
        constituentName: h.constituentName,
        weight: h.weight,
        shares: h.shares,
        amount: h.amount,
      })),
    })),
  );
}
```

- [ ] **Step 2: 타입 검증**

Run: `yarn workspace company-map lint`
Expected: 에러 없음 (Next.js lint가 타입 오류·use server 규칙 위반을 잡는다)

- [ ] **Step 3: 커밋**

```bash
git add apps/company-map/src/actions/etf.ts
git commit -m "feat(company-map): getEtfShareHistory server action"
```

---

### Task 3: `ShareHistorySection` UI 컴포넌트

**Files:**
- Create: `apps/company-map/src/app/stocks/etf/ShareHistorySection.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`apps/company-map/src/app/stocks/etf/ShareHistorySection.tsx` 생성:

```tsx
"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import type { ShareHistory, ShareHistoryRow } from "@/lib/etf/history";

function deltaColor(v: number): string {
  return v > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

// "20260610" → "06-10"
function fmtDate(trdDd: string): string {
  return trdDd.length === 8 ? `${trdDd.slice(4, 6)}-${trdDd.slice(6, 8)}` : trdDd;
}

const rowKey = (r: ShareHistoryRow) => r.constituentCode || r.constituentName;

export function ShareHistorySection({ history }: { history: ShareHistory }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (history.dates.length <= 1) {
    return (
      <section>
        <h2 className="mb-2 text-base font-semibold">주식수 변경 이력</h2>
        <p className="text-sm text-gray-500">
          이력이 쌓이는 중입니다 (스냅샷 {history.dates.length}개)
        </p>
      </section>
    );
  }

  const open = history.rows.find((r) => rowKey(r) === openKey) ?? null;

  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">주식수 변경 이력</h2>
      <p className="mb-2 text-xs text-gray-500">
        최근 {history.dates.length}개 스냅샷 · 행 클릭 시 추이 차트 · — 는 해당일 Top10 밖
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-left">
              <th className="sticky left-0 z-10 border-b bg-white p-2 dark:bg-gray-950">종목명</th>
              {history.dates.map((d) => (
                <th key={d} className="whitespace-nowrap border-b p-2 text-right">{fmtDate(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.rows.map((r) => {
              const key = rowKey(r);
              const firstIdx = r.cells.findIndex((c) => c != null);
              return (
                <tr
                  key={key}
                  onClick={() => setOpenKey(openKey === key ? null : key)}
                  className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900 ${
                    r.inLatest ? "" : "text-gray-400"
                  } ${openKey === key ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
                >
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white p-2 dark:bg-gray-950">
                    {r.constituentName}
                  </td>
                  {r.cells.map((c, i) => (
                    <td key={history.dates[i]} className="whitespace-nowrap p-2 text-right">
                      {c == null ? (
                        <span className="text-gray-300 dark:text-gray-700">—</span>
                      ) : (
                        <>
                          {c.shares?.toLocaleString() ?? "—"}
                          {i === firstIdx && firstIdx > 0 && (
                            <span className="ml-1 text-xs text-green-600 dark:text-green-400">신규</span>
                          )}
                          {c.delta != null && c.delta !== 0 && (
                            <span className={`ml-1 text-xs ${deltaColor(c.delta)}`}>
                              {c.delta > 0 ? "▲" : "▼"}
                              {Math.abs(c.delta).toLocaleString()}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="mt-3 rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <div className="mb-1 text-sm font-medium">{open.constituentName} 주식수 추이</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={history.dates.map((d, i) => ({
                  date: fmtDate(d),
                  shares: open.cells[i]?.shares ?? null,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis
                  fontSize={11}
                  width={72}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => v.toLocaleString()}
                />
                <Tooltip formatter={(v) => (typeof v === "number" ? v.toLocaleString() : v)} />
                <Line type="monotone" dataKey="shares" stroke="#2563eb" dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: 린트 확인**

Run: `yarn workspace company-map lint`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add apps/company-map/src/app/stocks/etf/ShareHistorySection.tsx
git commit -m "feat(company-map): ETF 주식수 이력 매트릭스 표 + 라인 차트 컴포넌트"
```

---

### Task 4: 페이지·매니저 연결

**Files:**
- Modify: `apps/company-map/src/app/stocks/etf/page.tsx`
- Modify: `apps/company-map/src/app/stocks/etf/EtfManager.tsx`

- [ ] **Step 1: `page.tsx`에서 이력 병렬 조회**

import 줄 수정:

```typescript
import { listEtfWatches, getEtfDetail, getEtfShareHistory } from "@/actions/etf";
```

기존:

```typescript
  const detail = selected ? await getEtfDetail(selected) : null;
```

를 다음으로 교체 (이력 조회 실패는 섹션만 숨기고 페이지는 살린다 — spec §6):

```typescript
  const [detail, history] = selected
    ? await Promise.all([
        getEtfDetail(selected),
        getEtfShareHistory(selected).catch(() => null),
      ])
    : [null, null];
```

`<EtfManager ...>` 호출에 prop 추가:

```tsx
      <EtfManager
        watches={watches}
        selected={selected}
        detail={detail}
        history={history}
        refreshState={refreshState}
      />
```

- [ ] **Step 2: `EtfManager.tsx`에 prop 추가 + 섹션 렌더**

import 추가:

```typescript
import type { ShareHistory } from "@/lib/etf/history";
import { ShareHistorySection } from "./ShareHistorySection";
```

컴포넌트 시그니처 수정 (props에 `history` 추가):

```typescript
export function EtfManager({
  watches, selected, detail, history, refreshState,
}: {
  watches: EtfWatchView[];
  selected: string | null;
  detail: EtfDetailView | null;
  history: ShareHistory | null;
  refreshState: RefreshStateView | null;
}) {
```

기존 `{detail && (<section>...</section>)}` 블록(비교표) **바로 뒤, 닫는 `</div>` 앞**에 추가:

```tsx
      {detail && history && <ShareHistorySection history={history} />}
```

- [ ] **Step 3: 린트 확인**

Run: `yarn workspace company-map lint`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add apps/company-map/src/app/stocks/etf/page.tsx apps/company-map/src/app/stocks/etf/EtfManager.tsx
git commit -m "feat(company-map): ETF 상세에 주식수 변경 이력 섹션 연결"
```

---

### Task 5: 최종 검증

- [ ] **Step 1: 전체 테스트 + 린트**

Run: `yarn workspace company-map test && yarn workspace company-map lint`
Expected: 전체 PASS, 린트 에러 없음

- [ ] **Step 2: 브라우저 확인**

dev 서버가 실행 중이 아니면: `yarn workspace company-map dev`

`http://localhost:3004/stocks/etf?code=0167A0` 열어 확인:
1. 기존 비교표 아래 "주식수 변경 이력" 섹션이 보인다.
2. 열이 날짜(좌→우 시간순), 행이 구성종목이며 가로 스크롤·첫 열 고정이 동작한다.
3. 증감 셀에 ▲초록/▼빨강 수치가 병기되고, 데이터 없는 날짜는 `—`.
4. 행 클릭 시 라인 차트가 펼쳐지고 다시 클릭하면 접힌다.
5. 스냅샷 1개뿐인 ETF는 "이력이 쌓이는 중입니다" 안내가 보인다.

> 참고: dev 서버가 이미 떠 있는 상태에서 코드만 바뀐 경우는 재시작 불필요 (Prisma 스키마 변경 없음).

- [ ] **Step 3: 완료 보고**

스크린샷 또는 확인 결과를 사용자에게 보고. 커밋은 Task별로 이미 완료.
