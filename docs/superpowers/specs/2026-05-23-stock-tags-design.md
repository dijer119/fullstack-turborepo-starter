# 전종목 사용자 정의 tag

## Context

`/stocks` 페이지는 시장·시총·PER/PBR·안전마진·VIP·YoY 등 정량 지표로 종목을 좁힐 수 있지만, 사용자만 아는 정성 분류 — "관심", "장기보유", "차트관찰", "매수후보" 등 — 를 붙일 방법이 없다. 종목별로 자유 태그를 달고 같은 태그 조합으로 다시 찾는 워크플로가 필요하다.

해결: 사용자 정의 자유 태그를 **정규화된 N:M 모델** (`Tag` + `StockTag`)로 저장한다. 표의 마지막 컬럼에 종목별 tag chip을 노출하고 `[+ 태그]` 인라인 입력으로 추가, chip의 `×`로 제거. 필터 패널에는 전체 tag 목록을 chip 형태로 노출해 다중 선택을 허용하고, **선택한 모든 tag를 가진 종목만**(AND) 매칭한다. URL `?tags=1,2,3` 쿼리로 상태 보존.

전제:
- 단일 사용자 환경 (auth 없음). 차후 멀티유저 도입 시 `Tag.userId` 추가 여지를 남기되 지금은 무관.
- 자동완성은 단순 startsWith 매칭만 (전체 tag 수가 수십~수백 수준 예상).
- 정규화 이유: 자동완성·rename·중복 방지·AND 쿼리 효율. JSON column은 자유 태그 사용 패턴에서 비효율.

## 사용자 결정사항 요약
- tag 종류: **사용자 정의 자유 태그** (자동 산업 분류 없음)
- 종목당 multi-tag, tag rename 가능 (Tag.id 안정, name unique)
- 편집 UI: **표 마지막 컬럼에 인라인 chip + [+ 태그] 버튼 → 같은 자리 input**
- 필터링: **AND** (선택한 모든 tag를 가진 종목)

## 변경 파일 목록

| 영역 | 파일 | 상태 |
|---|---|---|
| Prisma | `apps/company-map/prisma/schema.prisma` | 수정 — `Tag`, `StockTag` 모델 + `StockMaster.tags` relation |
| Migration | `apps/company-map/prisma/migrations/<ts>_add_tags/` | 신규 |
| Server Action (tags) | `apps/company-map/src/actions/tags.ts` | 신규 — `listTags`, `addTagToStock`, `removeTagFromStock`, `TagView` |
| Server Action (explorer) | `apps/company-map/src/actions/stocks-explorer.ts` | 수정 — `tagIds` 필터 + `StocksExplorerRow.tags: TagView[]` 추가 |
| 페이지 | `apps/company-map/src/app/stocks/page.tsx` | 수정 — `?tags` 파싱 + SSR `listTags()` fetch |
| 클라이언트 | `apps/company-map/src/app/stocks/StocksExplorerClient.tsx` | 수정 — Tag 컬럼·TagCell 컴포넌트·필터 패널 chip 영역·`buildQuery` 확장 |

## 단계별 설계

### 1. Prisma 스키마

`StockMaster`에 relation 추가 (기존 relations 블록 끝):
```prisma
  tags                  StockTag[]
```

신규 모델 (schema.prisma 끝):
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

마이그레이션: `npx prisma migrate dev --name add_tags`. 두 새 테이블 + 인덱스만, 기존 데이터 무관.

### 2. Server Action — `src/actions/tags.ts`

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

### 3. `getStocksExplorer` 확장

`StocksExplorerParams`에 추가:
```ts
  tagIds?: number[];
```

`StocksExplorerRow`에 추가:
```ts
  tags: TagView[];   // 빈 배열일 수 있음
```

(`TagView`는 `@/actions/tags`에서 re-export 또는 inline 정의 — 의존 흐름상 `tags.ts` 파일이 먼저 만들어지므로 import.)

`where` 조립:
```ts
if (params.tagIds && params.tagIds.length > 0) {
  where.AND = params.tagIds.map((tagId) => ({
    tags: { some: { tagId } },
  }));
}
```

`include`에 추가:
```ts
include: {
  // ... 기존
  tags: { include: { tag: true } },
},
```

row 매핑에:
```ts
  tags: m.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
```

### 4. `page.tsx` — `?tags` 파싱 + 초기 tags fetch

신규 imports:
```ts
import { listTags } from "@/actions/tags";
```

view 객체에 `tagIds`:
```ts
const tagIds = (sp.tags ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
```

`getStocksExplorer(view)` 호출 시 `tagIds`도 전달.

`listTags()` SSR fetch:
```ts
const allTags = await listTags();
```

`<StocksExplorerClient ... allTags={allTags} />` props 전달.

### 5. 클라이언트 — `StocksExplorerClient.tsx`

#### View 확장
```ts
export interface StocksExplorerView {
  // ... 기존
  tagIds: number[];
}
```

`buildQuery`에 추가:
```ts
if (view.tagIds && view.tagIds.length > 0) qs.set("tags", view.tagIds.join(","));
```

Props에 `allTags: TagView[]` 추가.

#### Tag 컬럼

표 헤더 (마지막 컬럼 추가):
```tsx
<th className="p-2 font-medium">Tag</th>
```

각 row의 셀:
```tsx
<td className="p-2">
  <TagCell stockCode={r.code} tags={r.tags} allTags={allTags} />
</td>
```

colSpan: 기존 10 → 11 (empty/expand row 모두).

#### `TagCell` 컴포넌트 (같은 파일 내)

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
    setTags(tags.filter((t) => t.id !== id));   // 낙관적
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

상단 import에 추가:
```ts
import {
  addTagToStock,
  removeTagFromStock,
  type TagView,
} from "@/actions/tags";
```

#### 필터 패널 chip 영역

기존 "분석된 종목만"/"VIP 보유 종목만" 체크박스 영역 아래에 추가:

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

`selectedTagIds` 상태: `useState<number[]>(view.tagIds)`.
`applyFilters`에 `tagIds: selectedTagIds` 추가.
`resetFilters`에 `setSelectedTagIds([])` 추가.

#### filterOpen 초기 조건에 tagIds 포함

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

### 6. URL 쿼리 동작
- `?tags=` 없거나 빈 → 필터 미적용
- `?tags=12,7` → tagId 12 AND 7 모두 가진 종목만
- 알 수 없는 tagId → 빈 결과 (silently). 잘못된 id 검증은 안 함 (낮은 위험).

## Verification

### 1. 마이그레이션
```bash
cd apps/company-map
npx prisma migrate dev --name add_tags
sqlite3 data/company-map.db ".tables tags stock_tags"
```
Expected: 두 테이블 모두 존재. 다른 테이블 무관.

### 2. Server Action 단위 검증 (수동)

브라우저에서 `/stocks` 임의 종목에 [+ 태그] 클릭 → "관심" 입력 → 엔터:
- chip 즉시 추가
- 새로고침해도 유지
```sql
SELECT * FROM tags;
SELECT * FROM stock_tags;
```

같은 tag 한 번 더 입력 → upsert idempotent → 중복 row 없음.

### 3. AND 필터
두 개 다른 종목에 각각 "관심" + "장기" 부여:
- 종목 A: 관심
- 종목 B: 관심 + 장기

필터에서 "관심" 선택 → A, B 모두. "관심" + "장기" → B만.

### 4. URL 동기화
`/stocks?tags=1,2` 직접 접근 → 해당 종목 표시 + 필터 패널 chip "관심", "장기" 활성화.

### 5. tag 제거
chip × 클릭 → 즉시 사라짐 + 새로고침 후에도 유지.

### 6. 회귀
- `/stocks` 기본 동작 (tag 없는 상태) 그대로
- 기존 필터 (시장, 검색, 시총, PER/PBR, VIP) 동작 그대로
- 다른 페이지 모두 200
- `/stocks?vip=1` + `?tags=1` 조합 → VIP 보유 AND tag 1 모두 매칭
