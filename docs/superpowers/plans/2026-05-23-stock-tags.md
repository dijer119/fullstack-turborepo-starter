# 전종목 사용자 정의 tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks` 표 마지막 컬럼에 사용자 정의 자유 태그(N:M) 인라인 chip 편집 + 필터 패널 AND 다중 선택을 추가한다.

**Architecture:** 정규화 N:M (`Tag` + `StockTag`) Prisma 모델. `addTagToStock`은 Tag/StockTag 모두 upsert로 idempotent. `getStocksExplorer`에 `tagIds[]` 필터 추가 — `where.AND = tagIds.map((id) => ({ tags: { some: { tagId: id } } }))`로 AND 보장. UI는 `TagCell` 컴포넌트가 낙관적 업데이트로 chip 추가/제거.

**Tech Stack:** Next.js 16, Prisma 6 + SQLite, vitest, lucide-react, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-05-23-stock-tags-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` | `Tag`, `StockTag` 모델 + `StockMaster.tags` relation |
| `src/actions/tags.ts` | `listTags`, `addTagToStock`, `removeTagFromStock`, `TagView` |
| `src/actions/stocks-explorer.ts` | `tagIds` 필터 + `tags: TagView[]` 매핑 |
| `src/app/stocks/page.tsx` | `?tags` 파싱 + SSR `listTags()` fetch |
| `src/app/stocks/StocksExplorerClient.tsx` | Tag 컬럼 + `TagCell` 인라인 편집 + 필터 패널 chip 영역 |

---

## Task 1: Prisma `Tag` + `StockTag` 모델 + 마이그레이션

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma`
- Generated: `apps/company-map/prisma/migrations/<ts>_add_tags/`

- [ ] **Step 1: `StockMaster`에 relation 추가**

`apps/company-map/prisma/schema.prisma`의 `StockMaster` 모델 안 relation 블록에 한 줄 추가 (`opIncomeHistory OperatingIncomeHistory[]` 다음, `@@index` 직전):

```prisma
  tags                  StockTag[]
```

- [ ] **Step 2: 새 두 모델 추가**

`schema.prisma` 끝(가장 마지막 모델 `RefreshState` 다음)에 추가:

```prisma
model Tag {
  id        Int        @id @default(autoincrement())
  name      String     @unique
  createdAt DateTime   @default(now()) @map("created_at")
  stocks    StockTag[]

  @@map("tags")
}

model StockTag {
  stockCode String   @map("stock_code")
  tagId     Int      @map("tag_id")
  createdAt DateTime @default(now()) @map("created_at")

  master    StockMaster @relation(fields: [stockCode], references: [code], onDelete: Cascade)
  tag       Tag         @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([stockCode, tagId])
  @@index([tagId])
  @@map("stock_tags")
}
```

- [ ] **Step 3: 마이그레이션 적용**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx prisma migrate dev --name add_tags
```

Expected: 새 마이그레이션 폴더 + Prisma Client 재생성.

- [ ] **Step 4: 마이그레이션 SQL 확인**

```bash
cat prisma/migrations/*add_tags*/migration.sql
```

Expected: `CREATE TABLE "tags"`, `CREATE TABLE "stock_tags"`, `CREATE INDEX "stock_tags_tag_id_idx"`, `CREATE UNIQUE INDEX "tags_name_key"` 등만. 기존 테이블 ALTER 없음.

- [ ] **Step 5: 기존 데이터 무관 + tsc + tests**

```bash
sqlite3 data/company-map.db "SELECT COUNT(*) FROM stock_masters;"
sqlite3 data/company-map.db "SELECT COUNT(*) FROM tags;"
sqlite3 data/company-map.db "SELECT COUNT(*) FROM stock_tags;"
npx tsc --noEmit
npx vitest run
```

Expected:
- stock_masters: 2882 (unchanged)
- tags: 0
- stock_tags: 0
- tsc EXIT=0
- 78 tests pass

- [ ] **Step 6: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "$(cat <<'EOF'
feat(company-map): add Tag + StockTag N:M for user-defined stock tags

Tag.name is unique; StockTag uses composite PK (stockCode, tagId) so
upserts are idempotent. Both tables cascade-delete with their parent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Server Action `tags.ts`

**Files:**
- Create: `apps/company-map/src/actions/tags.ts`

- [ ] **Step 1: 파일 작성**

`apps/company-map/src/actions/tags.ts`:

```ts
"use server";

import { db } from "@/lib/db";

export interface TagView {
  id: number;
  name: string;
}

/** 모든 tag를 name asc로 반환. 자동완성 + 필터 패널 chip 목록용. */
export async function listTags(): Promise<TagView[]> {
  const rows = await db.tag.findMany({ orderBy: { name: "asc" } });
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/** stockCode에 tagName 추가. Tag가 없으면 자동 생성. 같은 mapping 이미 있으면 no-op. */
export async function addTagToStock(
  stockCode: string,
  tagName: string,
): Promise<TagView | null> {
  const name = tagName.trim();
  if (!name) return null;
  if (!/^\d{6}$/.test(stockCode)) return null;

  const tag = await db.tag.upsert({
    where: { name },
    create: { name },
    update: {},
  });
  await db.stockTag.upsert({
    where: { stockCode_tagId: { stockCode, tagId: tag.id } },
    create: { stockCode, tagId: tag.id },
    update: {},
  });
  return { id: tag.id, name: tag.name };
}

export async function removeTagFromStock(
  stockCode: string,
  tagId: number,
): Promise<void> {
  if (!/^\d{6}$/.test(stockCode)) return;
  await db.stockTag.deleteMany({ where: { stockCode, tagId } });
}
```

- [ ] **Step 2: tsc + tests**

```bash
cd apps/company-map
npx tsc --noEmit
npx vitest run
```

Expected: tsc EXIT=0; 78 tests pass.

- [ ] **Step 3: 수동 sanity (선택)**

이미 dev 서버 떠 있다면 Server Action을 직접 검증할 수는 없지만, Prisma client 시그니처가 OK인지 확인하기 위해 짧은 probe 스크립트로 검증 가능. 생략 — Task 5에서 UI로 통합 검증.

- [ ] **Step 4: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/actions/tags.ts
git commit -m "$(cat <<'EOF'
feat(company-map): add tags Server Action (list/add/remove)

addTagToStock upserts both Tag (by unique name) and StockTag (by
composite PK) — idempotent. removeTagFromStock guards stockCode shape.
Returns TagView { id, name } so the client cache can update optimistically.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `getStocksExplorer` 확장 — `tagIds` 필터 + `tags` 매핑

**Files:**
- Modify: `apps/company-map/src/actions/stocks-explorer.ts`

- [ ] **Step 1: import 추가**

`stocks-explorer.ts` 상단 import 영역에:

```ts
import type { TagView } from "./tags";
```

- [ ] **Step 2: `StocksExplorerParams`에 필드 추가**

`vipOnly?: boolean;` 다음에:
```ts
  tagIds?: number[];
```

- [ ] **Step 3: `StocksExplorerRow`에 필드 추가**

`latestReprtCode: string | null;` (마지막 필드) 다음에:
```ts
  tags: TagView[];
```

- [ ] **Step 4: where 조립에 tagIds AND 추가**

`vipOnly` 처리 직후(또는 `needsAnalysis` 블록 다음):
```ts
if (params.tagIds && params.tagIds.length > 0) {
  where.AND = params.tagIds.map((tagId) => ({
    tags: { some: { tagId } },
  }));
}
```

- [ ] **Step 5: include에 tags 추가**

`db.stockMaster.findMany({ ... include: { ... } })` 의 include 블록 끝에:
```ts
  tags: { include: { tag: true } },
```

전체 include는 다음과 같이 됨:
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
},
```

- [ ] **Step 6: row 매핑에 tags 추가**

`masters.map((m) => ({ ... }))` 객체 끝에 (latestReprtCode 다음):
```ts
  tags: m.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
```

- [ ] **Step 7: 검증**

```bash
cd apps/company-map
npx tsc --noEmit
npx vitest run
```

Expected: tsc EXIT=0; 78 tests pass.

- [ ] **Step 8: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/actions/stocks-explorer.ts
git commit -m "$(cat <<'EOF'
feat(company-map): add tagIds AND filter + tags[] mapping to stocks explorer

where.AND = tagIds.map((id) => ({ tags: { some: { tagId: id } } })) so a
stock must carry every selected tag (not any). Row mapping exposes
TagView[] sourced from the included StockTag → Tag join.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `page.tsx` — `?tags` 파싱 + SSR `listTags()`

**Files:**
- Modify: `apps/company-map/src/app/stocks/page.tsx`

- [ ] **Step 1: import 추가**

기존 imports에:
```ts
import { listTags } from "@/actions/tags";
```

- [ ] **Step 2: `tagIds` 파싱**

`view` 객체를 구성하기 직전에:
```ts
const tagIds = (sp.tags ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
```

`view` 객체에 `tagIds` 추가:
```ts
const view: StocksExplorerView = {
  market,
  search: sp.search ?? "",
  minMarcapEok: parseOptionalNumber(sp.minMarcap),
  maxMarcapEok: parseOptionalNumber(sp.maxMarcap),
  perMax: parseOptionalNumber(sp.perMax),
  pbrMax: parseOptionalNumber(sp.pbrMax),
  analyzedOnly: sp.analyzed === "1",
  vipOnly: sp.vip === "1",
  tagIds,
  sort,
  page,
  pageSize: 50,
};
```

(`StocksExplorerView`의 `tagIds: number[]` 필드는 Task 5에서 추가됨. 이 task를 단독 커밋하면 일시적으로 tsc 에러 가능 → Task 4와 Task 5는 순서대로 진행, 분리 커밋 가능.)

- [ ] **Step 3: SSR `listTags()` fetch**

`const refreshStates = await listRefreshStates();` 다음에 추가:
```ts
const allTags = await listTags();
```

- [ ] **Step 4: `<StocksExplorerClient>` 호출에 `allTags` props 추가**

```tsx
<StocksExplorerClient
  rows={rows}
  total={total}
  view={view}
  allTags={allTags}
/>
```

- [ ] **Step 5: tsc**

```bash
cd apps/company-map
npx tsc --noEmit
```

Expected: 일시적인 에러 가능 (`tagIds` not in `StocksExplorerView`, `allTags` not in Props). Task 5 완료 후 통과.

→ Task 5와 함께 커밋. 이 step 끝에서 stage만 하고 커밋 보류.

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/app/stocks/page.tsx
# 커밋은 Task 5 끝에서 함께
```

---

## Task 5: 클라이언트 — Tag 컬럼 + `TagCell` + 필터 chip

**Files:**
- Modify: `apps/company-map/src/app/stocks/StocksExplorerClient.tsx`

- [ ] **Step 1: imports**

상단 import 영역에 추가:

```ts
import {
  addTagToStock,
  removeTagFromStock,
  type TagView,
} from "@/actions/tags";
```

- [ ] **Step 2: `StocksExplorerView`에 `tagIds`**

```ts
export interface StocksExplorerView {
  market: MarketFilter;
  search: string;
  minMarcapEok: number | null;
  maxMarcapEok: number | null;
  perMax: number | null;
  pbrMax: number | null;
  analyzedOnly: boolean;
  vipOnly: boolean;
  tagIds: number[];
  sort: StocksSort;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 3: Props에 `allTags`**

```ts
interface Props {
  rows: StocksExplorerRow[];
  total: number;
  view: StocksExplorerView;
  allTags: TagView[];
}
```

함수 시그니처:
```ts
export function StocksExplorerClient({ rows, total, view, allTags }: Props) {
```

- [ ] **Step 4: `buildQuery`에 tags**

`if (view.vipOnly) qs.set("vip", "1");` 다음에:
```ts
if (view.tagIds && view.tagIds.length > 0) qs.set("tags", view.tagIds.join(","));
```

- [ ] **Step 5: `selectedTagIds` 상태 + filterOpen 조건 + reset**

기존 `const [vipOnly, setVipOnly] = useState(view.vipOnly);` 다음에:
```ts
const [selectedTagIds, setSelectedTagIds] = useState<number[]>(view.tagIds);
```

`filterOpen` 초기 조건에 추가:
```ts
const [filterOpen, setFilterOpen] = useState(
  view.minMarcapEok != null ||
    view.maxMarcapEok != null ||
    view.perMax != null ||
    view.pbrMax != null ||
    view.analyzedOnly ||
    view.vipOnly ||
    view.tagIds.length > 0,
);
```

`applyFilters`의 navigate 호출에 `tagIds: selectedTagIds` 추가:
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
    vipOnly,
    tagIds: selectedTagIds,
    page: 1,
  });
};
```

`resetFilters`에 추가:
```ts
const resetFilters = () => {
  setSearch("");
  setMinMarcap("");
  setMaxMarcap("");
  setPerMax("");
  setPbrMax("");
  setAnalyzedOnly(false);
  setVipOnly(false);
  setSelectedTagIds([]);
  startTransition(() => router.replace("/stocks"));
};
```

- [ ] **Step 6: 필터 패널에 tag chip 영역**

기존 "VIP 보유 종목만" 체크박스 영역 바로 아래(같은 form 그리드 안)에 추가:

```tsx
{allTags.length > 0 && (
  <div className="md:col-span-2 lg:col-span-3">
    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
      태그 (모두 포함):
    </div>
    <div className="flex flex-wrap gap-1">
      {allTags.map((t) => {
        const active = selectedTagIds.includes(t.id);
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => {
              setSelectedTagIds(
                active
                  ? selectedTagIds.filter((id) => id !== t.id)
                  : [...selectedTagIds, t.id],
              );
            }}
            className={`rounded px-2 py-0.5 text-xs ${
              active
                ? "bg-blue-600 text-white"
                : "border border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            }`}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 7: `TagCell` 컴포넌트 추가 (같은 파일 끝)**

```tsx
function TagCell({
  stockCode,
  tags: initialTags,
  allTags,
}: {
  stockCode: string;
  tags: TagView[];
  allTags: TagView[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");

  const onAdd = async () => {
    const name = input.trim();
    if (!name) {
      setEditing(false);
      return;
    }
    const created = await addTagToStock(stockCode, name);
    if (created && !tags.find((t) => t.id === created.id)) {
      setTags([...tags, created]);
    }
    setInput("");
    setEditing(false);
  };

  const onRemove = async (id: number) => {
    setTags(tags.filter((t) => t.id !== id));
    await removeTagFromStock(stockCode, id);
  };

  const suggestions = input
    ? allTags
        .filter((t) => t.name.startsWith(input) && !tags.find((tt) => tt.id === t.id))
        .slice(0, 5)
    : [];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800"
        >
          {t.name}
          <button
            type="button"
            onClick={() => onRemove(t.id)}
            className="text-gray-400 hover:text-red-600"
            aria-label={`${t.name} 제거`}
          >
            ×
          </button>
        </span>
      ))}
      {editing ? (
        <div className="relative">
          <input
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
              else if (e.key === "Escape") {
                setInput("");
                setEditing(false);
              }
            }}
            onBlur={onAdd}
            className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-900"
            placeholder="태그명"
          />
          {suggestions.length > 0 && (
            <ul className="absolute left-0 top-full z-10 mt-1 w-32 rounded border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-900">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="cursor-pointer px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInput(s.name);
                  }}
                >
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-gray-400 hover:text-blue-600"
        >
          + 태그
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 8: 표 헤더에 Tag 컬럼**

기존 `<th>YoY</th>` 다음(헤더 마지막)에 추가:
```tsx
<th className="p-2 font-medium">Tag</th>
```

- [ ] **Step 9: 표 row에 Tag 셀**

YoY `<td>` (IIFE) 다음에:
```tsx
<td className="p-2">
  <TagCell stockCode={r.code} tags={r.tags} allTags={allTags} />
</td>
```

- [ ] **Step 10: colSpan 10 → 11**

empty row + expand row 두 군데:
```bash
# Edit tool replace_all
colSpan={10} → colSpan={11}
```

(파일에 `colSpan={10}` 두 군데. 둘 다 변경.)

- [ ] **Step 11: 검증 + 두 task 통합 커밋**

```bash
cd apps/company-map
npx tsc --noEmit
npx eslint src/app/stocks src/actions/tags.ts src/actions/stocks-explorer.ts
npx vitest run
```

Expected: tsc EXIT=0; 78 tests pass; eslint: 기존 AppMenu.tsx 경고만(무관). 새 에러 없음.

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/app/stocks/page.tsx apps/company-map/src/app/stocks/StocksExplorerClient.tsx
git commit -m "$(cat <<'EOF'
feat(company-map): add inline tag chip column + AND tag filter UI

Right-most "Tag" column renders TagCell: existing tag chips with ×,
[+ 태그] toggles an inline input with startsWith autocomplete from
allTags. Filter panel exposes every tag as a togglable chip; selected
ids round-trip as ?tags=1,2. colSpan 10 → 11 on empty/expand rows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 통합 검증

**Files:** 검증만 — 코드 변경 없음.

- [ ] **Step 1: dev 서버 재시작 (사용자 액션)**

Prisma schema 변경으로 dev 재시작 필수:
```
사용자 액션:
1) 기존 npm run dev 중지 (Ctrl+C)
2) cd apps/company-map && npm run dev 재실행
3) ready 메시지 확인
```

- [ ] **Step 2: 페이지 로드**

`http://localhost:3004/stocks` HTTP 200, 표 마지막 컬럼 "Tag" 노출. 모든 row의 Tag 셀에 `[+ 태그]` 버튼.

- [ ] **Step 3: tag 추가**

임의 종목(예: 삼성전자 005930) [+ 태그] → "관심" 입력 → Enter:
- chip 즉시 표시
- 새로고침 후 유지
```bash
sqlite3 apps/company-map/data/company-map.db "SELECT t.id, t.name FROM tags t;"
sqlite3 apps/company-map/data/company-map.db "SELECT * FROM stock_tags;"
```

- [ ] **Step 4: 자동완성**

다른 종목(예: SK하이닉스 000660) [+ 태그] → "관" 입력:
- 드롭다운에 "관심" 제안
- 클릭 또는 그대로 Enter → "관심" 추가, 같은 Tag.id 사용
- `stock_tags` row 2개 (삼성전자, SK하이닉스)

- [ ] **Step 5: 동일 tag 중복 추가**

같은 종목에 같은 tag 다시 입력 → upsert idempotent → chip 1개 유지, `stock_tags` row 그대로.

- [ ] **Step 6: tag 제거**

chip × 클릭 → 즉시 사라짐 + 새로고침 후 유지.

- [ ] **Step 7: 필터 AND 동작**

종목 A에 "관심"만, 종목 B에 "관심" + "장기" 부여.

필터 패널 열기 → [관심] chip 클릭 → 적용 → A, B 모두 표시.
[관심] + [장기] chip 모두 선택 → 적용 → B만.

URL `?tags=1,2` 직접 접근 → 같은 결과 + chip 활성화 상태 복원.

- [ ] **Step 8: 회귀**

다음 모두 정상:
- `/stocks` 기본 (tag 없는 상태)
- `/stocks?vip=1`
- `/stocks?market=KOSPI`
- `/stocks?vip=1&tags=1` (조합)
- `/companies`, `/top-stocks`, `/ncav`, `/trade`, `/calculator`

전체 테스트:
```bash
cd apps/company-map
npx vitest run
```
Expected: 78 tests pass.

검증만 — 별도 커밋 없음. plan 완료.

---

## Self-Review Notes

**Spec coverage:**
- Tag + StockTag 모델 → Task 1 ✓
- Server Action `listTags`/`addTagToStock`/`removeTagFromStock` → Task 2 ✓
- `getStocksExplorer.tagIds` AND 필터 + tags 매핑 → Task 3 ✓
- `?tags=` 파싱 + SSR listTags → Task 4 ✓
- Tag 컬럼 + TagCell + 필터 chip 영역 + colSpan 11 → Task 5 ✓
- 통합 검증 + 회귀 → Task 6 ✓

**Type consistency:**
- `TagView { id: number; name: string }` — tags.ts export, stocks-explorer.ts import, StocksExplorerClient import 일치
- `addTagToStock(stockCode, tagName): Promise<TagView | null>` — TagCell.onAdd 호출과 일치
- `removeTagFromStock(stockCode, tagId)` — TagCell.onRemove 호출과 일치
- `StocksExplorerView.tagIds: number[]` — page.tsx 파싱, buildQuery 직렬화, applyFilters 전달 모두 number[]
- `StocksExplorerRow.tags: TagView[]` — Server Action 매핑, UI TagCell props 일치
- `Props.allTags: TagView[]` — page.tsx props 전달, 필터 chip + TagCell 자동완성 사용 일치
- `where.AND = tagIds.map(...)` Prisma 패턴 — Prisma 6에서 지원 확인됨 (기존 패턴 없음, 신규 도입이지만 표준)

**Placeholder scan:** 없음. 각 step에 실제 코드/명령어/예상 출력 포함. `<ts>_add_tags`는 Prisma 자동 생성.
