# 관심 ETF 노출 순서 드래그 앤 드롭 변경 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks/etf` 상단 관심 ETF 버튼을 드래그 앤 드롭으로 재배열하고 순서를 SQLite에 영속한다.

**Architecture:** `EtfWatch`에 `sortOrder` 컬럼을 추가하고(백필 없이 `[sortOrder, createdAt]` 이중 정렬로 기존 순서 보존), 재배열 계산은 순수 함수 `moveCode()`(arrayMove 의미론, Vitest 테스트)로 분리한다. UI는 네이티브 HTML5 DnD(의존성 0) + 낙관적 업데이트, 저장은 신규 server action `reorderEtfWatches()`가 `$transaction`으로 처리한다.

**Tech Stack:** Next.js 16 App Router (Server Actions), Prisma(SQLite), Vitest, 네이티브 HTML5 Drag and Drop, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-06-10-etf-reorder-design.html`

**작업 디렉토리:** 모든 경로는 리포 루트(`/Users/dijer/dev/workspace/fullstack-turborepo-starter`) 기준. 명령은 루트에서 `yarn workspace company-map ...`.

**도메인 컨텍스트 (5분 요약):**
- `/stocks/etf`는 관심 ETF 버튼들을 가로 flex-wrap으로 나열. 현재 `listEtfWatches()`가 `createdAt asc` 고정 정렬 (`apps/company-map/src/actions/etf.ts`).
- `company-map`은 **별도 SQLite DB + 별도 Prisma 클라이언트** (`@prisma-clients/company-map` output). 스키마 변경 시 이 워크스페이스에서 migrate 해야 함.
- ⚠️ **migrate/generate 후 실행 중인 dev 서버는 옛 PrismaClient 싱글턴을 유지** → 새 컬럼 사용 코드가 런타임 에러를 냄. Task 5에서 dev 서버 재시작 후 검증한다.
- ⚠️ 이 리포의 eslint는 `react-hooks/set-state-in-effect`가 **에러**다 (기존 파일 6곳에서 이미 걸려 있음). **`useEffect` 안에서 `setState`로 prop을 로컬 state에 동기화하는 패턴 금지** — Task 4는 effect 없이 렌더 시 파생하는 패턴을 쓴다.
- ⚠️ 워크스페이스 `lint`는 위 pre-existing 에러 6개로 항상 exit 1 — 검증은 변경 파일만 `npx eslint <files>`로 스코프할 것.

---

### Task 1: `moveCode()` 순수 함수 (TDD)

**Files:**
- Create: `apps/company-map/src/lib/etf/reorder.ts`
- Create: `apps/company-map/src/lib/etf/reorder.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/company-map/src/lib/etf/reorder.test.ts` 생성:

```typescript
import { describe, it, expect } from "vitest";
import { moveCode } from "./reorder";

describe("moveCode", () => {
  it("앞 항목을 뒤로 이동하면 드롭 대상의 자리로 들어간다 (대상 바로 뒤)", () => {
    expect(moveCode(["A", "B", "C", "D"], "A", "C")).toEqual(["B", "C", "A", "D"]);
  });

  it("뒤 항목을 앞으로 이동하면 드롭 대상의 자리로 들어간다 (대상 바로 앞)", () => {
    expect(moveCode(["A", "B", "C", "D"], "D", "B")).toEqual(["A", "D", "B", "C"]);
  });

  it("인접 항목에 드롭하면 양방향 모두 교환된다", () => {
    expect(moveCode(["A", "B", "C"], "B", "C")).toEqual(["A", "C", "B"]);
    expect(moveCode(["A", "B", "C"], "C", "B")).toEqual(["A", "C", "B"]);
  });

  it("마지막 항목에 드롭하면 맨 끝으로 이동한다", () => {
    expect(moveCode(["A", "B", "C", "D"], "A", "D")).toEqual(["B", "C", "D", "A"]);
  });

  it("자기 자신에 드롭하면 변경 없다", () => {
    expect(moveCode(["A", "B", "C"], "B", "B")).toEqual(["A", "B", "C"]);
  });

  it("미존재 코드는 변경 없이 반환한다", () => {
    expect(moveCode(["A", "B"], "X", "B")).toEqual(["A", "B"]);
    expect(moveCode(["A", "B"], "A", "X")).toEqual(["A", "B"]);
  });

  it("입력 배열을 변형하지 않는다", () => {
    const input = ["A", "B", "C"];
    moveCode(input, "A", "C");
    expect(input).toEqual(["A", "B", "C"]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/etf/reorder.test.ts`
Expected: FAIL — `Cannot find module './reorder'` 또는 유사 import 오류

- [ ] **Step 3: 구현 작성**

`apps/company-map/src/lib/etf/reorder.ts` 생성:

```typescript
// 드래그 항목을 드롭 대상의 원래 인덱스 위치로 옮긴 새 배열 (표준 arrayMove 의미론).
// 입력 불변, 어떤 입력에도 throw하지 않는다.
export function moveCode(codes: string[], dragCode: string, dropCode: string): string[] {
  const from = codes.indexOf(dragCode);
  const to = codes.indexOf(dropCode);
  if (from === -1 || to === -1 || from === to) return [...codes];
  const next = [...codes];
  next.splice(from, 1);
  next.splice(to, 0, dragCode);
  return next;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/etf/reorder.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/company-map/src/lib/etf/reorder.ts apps/company-map/src/lib/etf/reorder.test.ts
git commit -m "feat(company-map): ETF 순서 재배열 순수 함수 moveCode

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `EtfWatch.sortOrder` 스키마 마이그레이션

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma` (`EtfWatch` 모델)
- Create: `apps/company-map/prisma/migrations/<timestamp>_etf_watch_sort_order/` (migrate가 생성)

- [ ] **Step 1: 스키마 수정**

`apps/company-map/prisma/schema.prisma`의 `EtfWatch` 모델에서

기존:

```prisma
model EtfWatch {
  code      String   @id
  isin      String?  @map("isin")
  name      String
  createdAt DateTime @default(now()) @map("created_at")
```

를 다음으로 교체 (`sortOrder` 한 줄 추가):

```prisma
model EtfWatch {
  code      String   @id
  isin      String?  @map("isin")
  name      String
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at")
```

- [ ] **Step 2: 마이그레이션 실행**

Run: `yarn workspace company-map prisma migrate dev --name etf_watch_sort_order`
Expected: 마이그레이션 적용 + Prisma Client 재생성 성공 메시지. 데이터 삭제 경고가 나오면 **중단하고 보고** (단순 컬럼 추가라 나올 이유가 없음).

- [ ] **Step 3: 기존 데이터 확인**

Run: `sqlite3 apps/company-map/data/company-map.db "SELECT code, sort_order FROM etf_watches LIMIT 10;"`
Expected: 기존 행 전부 `sort_order = 0` (백필 없음 — 이중 정렬로 등록순 유지)

- [ ] **Step 4: 회귀 테스트**

Run: `yarn workspace company-map test`
Expected: 전체 PASS (현재 168 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "feat(company-map): EtfWatch.sortOrder 컬럼 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

> 참고: 실행 중인 dev 서버는 아직 옛 Prisma 클라이언트를 쓰고 있다. 이 시점에는 코드가 `sortOrder`를 참조하지 않으므로 문제 없다. 재시작은 Task 5에서 한다.

---

### Task 3: 서버 액션 — 정렬 변경 + `reorderEtfWatches` 추가

**Files:**
- Modify: `apps/company-map/src/actions/etf.ts`

- [ ] **Step 1: `listEtfWatches` 정렬 교체**

기존 (`listEtfWatches` 내부):

```typescript
    orderBy: { createdAt: "asc" },
```

를 다음으로 교체:

```typescript
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
```

- [ ] **Step 2: `registerEtf`에 sortOrder 부여**

기존:

```typescript
  await db.etfWatch.create({ data: { code, name: code } }); // name/isin은 스냅샷 잡이 보강
```

를 다음으로 교체 (맨 뒤에 등록):

```typescript
  const max = await db.etfWatch.aggregate({ _max: { sortOrder: true } });
  await db.etfWatch.create({
    data: { code, name: code, sortOrder: (max._max.sortOrder ?? -1) + 1 }, // name/isin은 스냅샷 잡이 보강
  });
```

- [ ] **Step 3: `reorderEtfWatches` 추가**

`removeEtf` 함수 바로 아래에 추가:

```typescript
// 드래그 정렬 결과 저장. codes는 등록된 전체 코드 집합과 정확히 일치해야 한다(중복·누락 불가).
export async function reorderEtfWatches(codes: string[]): Promise<{ ok: boolean }> {
  const rows = await db.etfWatch.findMany({ select: { code: true } });
  const existing = new Set(rows.map((r) => r.code));
  const unique = new Set(codes);
  if (
    unique.size !== codes.length ||
    unique.size !== existing.size ||
    !codes.every((c) => existing.has(c))
  ) {
    return { ok: false };
  }
  await db.$transaction(
    codes.map((code, i) => db.etfWatch.update({ where: { code }, data: { sortOrder: i } })),
  );
  revalidatePath("/stocks/etf");
  return { ok: true };
}
```

- [ ] **Step 4: 타입·린트 확인**

Run: `cd apps/company-map && npx tsc --noEmit && npx eslint src/actions/etf.ts`
Expected: 둘 다 에러 0

- [ ] **Step 5: 커밋**

```bash
git add apps/company-map/src/actions/etf.ts
git commit -m "feat(company-map): ETF 정렬 순서 조회·저장 액션

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `EtfManager` 드래그 앤 드롭 UI

**Files:**
- Modify: `apps/company-map/src/app/stocks/etf/EtfManager.tsx`

> ⚠️ 이 리포의 eslint는 `react-hooks/set-state-in-effect`가 에러다. **`useEffect`로 prop→state 동기화 금지.** 아래 패턴은 effect 없이 렌더 시 파생한다: 낙관적 순서(`localOrder`)는 드롭 시에만 set 되고, 렌더마다 `watches` prop과 조합해 표시 순서를 계산한다. `localOrder`에 없는 신규 코드는 뒤에 붙고, 삭제된 코드는 map 미스로 걸러지므로 별도 리셋이 필요 없다.

- [ ] **Step 1: import 수정**

기존:

```typescript
import { registerEtf, removeEtf, type EtfWatchView, type EtfDetailView } from "@/actions/etf";
```

를 다음으로 교체:

```typescript
import {
  registerEtf, removeEtf, reorderEtfWatches,
  type EtfWatchView, type EtfDetailView,
} from "@/actions/etf";
import { moveCode } from "@/lib/etf/reorder";
```

- [ ] **Step 2: 상태·핸들러 추가**

`const [msg, setMsg] = useState<string | null>(null);` 바로 아래에 추가:

```typescript
  // DnD 순서 변경: localOrder는 낙관적 표시 순서. effect 없이 렌더 시 watches와 조합한다.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [overCode, setOverCode] = useState<string | null>(null);

  const byCode = new Map(watches.map((w) => [w.code, w]));
  const ordered = localOrder
    ? [
        ...localOrder.map((c) => byCode.get(c)).filter((w): w is EtfWatchView => w != null),
        ...watches.filter((w) => !localOrder.includes(w.code)),
      ]
    : watches;

  const drop = (dropCode: string) => {
    if (!dragCode || dragCode === dropCode) return;
    const next = moveCode(ordered.map((w) => w.code), dragCode, dropCode);
    setLocalOrder(next); // 낙관적 반영
    start(async () => {
      try {
        const r = await reorderEtfWatches(next);
        if (!r.ok) setLocalOrder(null); // 코드 집합 불일치 → 서버 상태로 복원
      } catch {
        setLocalOrder(null);
      }
      router.refresh();
    });
  };
```

- [ ] **Step 3: 버튼 목록 렌더를 DnD 가능하게 교체**

기존:

```tsx
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
```

를 다음으로 교체 (`watches.map` → `ordered.map`, wrapper에 DnD 핸들러·표시):

```tsx
      <div className="flex flex-wrap gap-2">
        {ordered.map((w) => (
          <span
            key={w.code}
            draggable
            onDragStart={() => setDragCode(w.code)}
            onDragOver={(e) => { e.preventDefault(); setOverCode(w.code); }}
            onDragLeave={() => setOverCode((c) => (c === w.code ? null : c))}
            onDrop={(e) => { e.preventDefault(); drop(w.code); }}
            onDragEnd={() => { setDragCode(null); setOverCode(null); }}
            className={`inline-flex cursor-grab items-center gap-1 ${
              dragCode === w.code ? "opacity-50" : ""
            } ${overCode === w.code && dragCode !== null && dragCode !== w.code ? "border-l-2 border-blue-500 pl-1" : ""}`}
          >
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
```

- [ ] **Step 4: 타입·린트 확인**

Run: `cd apps/company-map && npx tsc --noEmit && npx eslint src/app/stocks/etf/EtfManager.tsx`
Expected: 둘 다 에러 0 (특히 `react-hooks/set-state-in-effect` 신규 에러가 없어야 함)

- [ ] **Step 5: 커밋**

```bash
git add apps/company-map/src/app/stocks/etf/EtfManager.tsx
git commit -m "feat(company-map): 관심 ETF 드래그 앤 드롭 순서 변경 UI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 최종 검증 (dev 서버 재시작 필수)

- [ ] **Step 1: 전체 테스트 + 변경 파일 린트**

Run: `yarn workspace company-map test && cd apps/company-map && npx eslint src/lib/etf/reorder.ts src/lib/etf/reorder.test.ts src/actions/etf.ts src/app/stocks/etf/EtfManager.tsx`
Expected: 테스트 전체 PASS, eslint 에러 0

- [ ] **Step 2: dev 서버 재시작**

Prisma 클라이언트가 재생성됐으므로 **실행 중인 dev 서버를 반드시 재시작**한다 (옛 싱글턴이 `sortOrder`를 모름):

```bash
lsof -ti :3004 | xargs kill   # 기존 dev 서버 종료
yarn workspace company-map dev   # 백그라운드로 재시작
```

- [ ] **Step 3: 브라우저 확인**

`http://localhost:3004/stocks/etf` 열어 확인:
1. 마이그레이션 직후 버튼 순서가 종전(등록순)과 동일한지
2. 첫 번째 ETF 버튼을 세 번째 버튼 위로 드래그 → 순서가 즉시 바뀌는지 (낙관적 업데이트)
3. 페이지 새로고침 → 바뀐 순서가 유지되는지 (DB 영속)
4. `sqlite3 apps/company-map/data/company-map.db "SELECT code, sort_order FROM etf_watches ORDER BY sort_order;"` → 0..N-1 부여 확인
5. 드래그 중 원본 버튼 반투명 + 드롭 대상 왼쪽 파란 인디케이터 표시 확인
6. **신규 등록 위치**: 순서 변경 후 테스트 코드(예: `ZZZZ99`)를 등록 → 버튼이 맨 뒤에 나타나는지 확인 → × 버튼으로 즉시 삭제 (스냅샷 수집은 실패해도 무해)

- [ ] **Step 4: 완료 보고**

확인 결과를 사용자에게 보고. 커밋은 Task별로 완료.
