# 종목별 메모 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks` 표 종목명 셀 왼쪽에 메모 아이콘 버튼을 추가하고 popover에서 자유 텍스트 메모를 편집·저장한다.

**Architecture:** `StockMemo` 1:1 모델, `getMemoByCode`/`setMemo` Server Actions. `getStocksExplorer`는 본문 대신 `hasMemo: boolean`만 노출 (메모 본문은 popover 열 때 lazy load). `MemoButton` 클라이언트 컴포넌트가 아이콘+popover+textarea를 묶고 backdrop 클릭/Esc 취소, [저장] 버튼/Cmd+Enter 저장.

**Tech Stack:** Next.js 16, Prisma 6 + SQLite, vitest 4, lucide-react FileText, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-05-23-stock-memo-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` | `StockMemo` 모델 + `StockMaster.memo` relation |
| `src/actions/memos.ts` | `getMemoByCode`, `setMemo` |
| `src/actions/stocks-explorer.ts` | `hasMemo: boolean` 필드 + include `memo` |
| `src/app/stocks/StocksExplorerClient.tsx` | `MemoButton` 컴포넌트 + 종목명 셀 왼쪽 mount |

---

## Task 1: Prisma `StockMemo` 모델 + 마이그레이션

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma`
- Generated: `apps/company-map/prisma/migrations/<ts>_add_stock_memo/`

- [ ] **Step 1: relation 추가**

`StockMaster` 모델 안 relation 블록 끝에 한 줄:
```prisma
  memo                  StockMemo?
```

- [ ] **Step 2: 모델 추가**

`schema.prisma` 끝에:
```prisma
model StockMemo {
  code      String   @id
  text      String
  updatedAt DateTime @updatedAt @map("updated_at")

  master    StockMaster @relation(fields: [code], references: [code], onDelete: Cascade)

  @@map("stock_memos")
}
```

- [ ] **Step 3: 마이그레이션**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx prisma migrate dev --name add_stock_memo
cat prisma/migrations/*add_stock_memo*/migration.sql
sqlite3 data/company-map.db ".tables stock_memos"
```
Expected: `CREATE TABLE "stock_memos"` only; no ALTER; sqlite shows the new table.

- [ ] **Step 4: 기존 데이터 보존 + tsc + tests**

```bash
sqlite3 data/company-map.db "SELECT COUNT(*) FROM stock_masters;"
sqlite3 data/company-map.db "SELECT COUNT(*) FROM price_changes;"
npx tsc --noEmit
npx vitest run
```
Expected:
- stock_masters: 2882 (unchanged)
- price_changes: 2816 (unchanged from prior work)
- tsc EXIT=0
- 92 tests pass

- [ ] **Step 5: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "$(cat <<'EOF'
feat(company-map): add StockMemo 1:1 model for per-stock free-text notes

Single text field per code, cascade-deletes with the parent. updatedAt
auto-tracks last edit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Server Action `memos.ts`

**Files:**
- Create: `apps/company-map/src/actions/memos.ts`

- [ ] **Step 1: 파일 작성**

`apps/company-map/src/actions/memos.ts`:

```ts
"use server";

import { db } from "@/lib/db";

/** 종목 메모 본문 조회. 없으면 null. */
export async function getMemoByCode(code: string): Promise<string | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const row = await db.stockMemo.findUnique({ where: { code } });
  return row?.text ?? null;
}

/** 메모 저장/삭제. trim 후 빈 string이면 delete (idempotent).
 *  반환값으로 클라이언트가 hasMemo 상태 동기화. */
export async function setMemo(
  code: string,
  text: string,
): Promise<{ hasMemo: boolean }> {
  if (!/^\d{6}$/.test(code)) return { hasMemo: false };
  const trimmed = text.trim();
  if (!trimmed) {
    await db.stockMemo.deleteMany({ where: { code } });
    return { hasMemo: false };
  }
  await db.stockMemo.upsert({
    where: { code },
    create: { code, text: trimmed },
    update: { text: trimmed },
  });
  return { hasMemo: true };
}
```

- [ ] **Step 2: tsc + tests**

```bash
cd apps/company-map
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0; 92 tests pass.

- [ ] **Step 3: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/actions/memos.ts
git commit -m "$(cat <<'EOF'
feat(company-map): add memos Server Action (get/set)

setMemo trims input; empty string deletes the row, otherwise upserts.
Returns hasMemo so the client can sync the icon state without an extra
fetch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `getStocksExplorer` 확장 — `hasMemo`

**Files:**
- Modify: `apps/company-map/src/actions/stocks-explorer.ts`

- [ ] **Step 1: `StocksExplorerRow`에 필드 추가**

`pctChange3M: number | null;` (마지막 필드) 다음에:
```ts
  hasMemo: boolean;
```

- [ ] **Step 2: include에 추가**

기존 `include` 객체의 마지막 항목(`priceChange: true`) 다음에 추가:
```ts
  memo: { select: { code: true } },
```

- [ ] **Step 3: row 매핑에 추가**

`masters.map((m) => ({ ... }))` 객체 끝에 (pctChange3M 다음):
```ts
  hasMemo: m.memo != null,
```

- [ ] **Step 4: tsc + tests**

```bash
cd apps/company-map
npx tsc --noEmit
npx vitest run
```
Expected: tsc EXIT=0; 92 tests pass.

- [ ] **Step 5: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/actions/stocks-explorer.ts
git commit -m "$(cat <<'EOF'
feat(company-map): expose hasMemo boolean from stocks explorer

select: { code: true } on the memo relation is enough to know whether a
memo exists; row mapper exports m.memo != null. Memo body is lazy-loaded
by the client when the popover opens.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 클라이언트 — `MemoButton` 컴포넌트 + 종목명 셀 wrap

**Files:**
- Modify: `apps/company-map/src/app/stocks/StocksExplorerClient.tsx`

- [ ] **Step 1: imports**

상단 import에 추가:
```ts
import { getMemoByCode, setMemo } from "@/actions/memos";
```

`lucide-react` import에 `FileText` 추가:
```ts
import { Filter, ChevronDown, ChevronUp, ExternalLink, FileText } from "lucide-react";
```
(기존 import line에 FileText만 추가.)

- [ ] **Step 2: 종목명 `<td>` wrap**

기존 종목명 셀 (네이버 링크 `<a>` 하나만 있는 `<td>`)을 다음으로 교체:

```tsx
<td className="p-2 font-medium">
  <div className="flex items-center gap-1.5">
    <MemoButton stockCode={r.code} initialHasMemo={r.hasMemo} />
    <a
      href={`https://finance.naver.com/item/main.naver?code=${r.code}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:underline dark:text-blue-400"
    >
      {r.name}
    </a>
  </div>
</td>
```

- [ ] **Step 3: `MemoButton` 컴포넌트 추가 (파일 끝)**

```tsx
function MemoButton({
  stockCode,
  initialHasMemo,
}: {
  stockCode: string;
  initialHasMemo: boolean;
}) {
  const [hasMemo, setHasMemo] = useState(initialHasMemo);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const openPopover = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const t = await getMemoByCode(stockCode);
      setText(t ?? "");
    } finally {
      setLoading(false);
    }
  };

  const closePopover = () => {
    setOpen(false);
    setText("");
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const r = await setMemo(stockCode, text);
      setHasMemo(r.hasMemo);
      setOpen(false);
      setText("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPopover}
        aria-label={hasMemo ? "메모 편집" : "메모 추가"}
        className={`inline-flex items-center justify-center rounded p-0.5 transition ${
          hasMemo
            ? "text-blue-600 hover:text-blue-700 dark:text-blue-400"
            : "text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
        }`}
      >
        <FileText size={14} fill={hasMemo ? "currentColor" : "none"} />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={closePopover}
            aria-hidden
          />
          <div
            className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            {loading ? (
              <div className="text-xs text-gray-500">불러오는 중…</div>
            ) : (
              <>
                <textarea
                  autoFocus
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void onSave();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      closePopover();
                    }
                  }}
                  placeholder="메모 입력…"
                  className="w-full resize-y rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                />
                <div className="mt-1 flex items-center justify-end gap-1 text-xs">
                  <button
                    type="button"
                    onClick={closePopover}
                    className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    disabled={saving}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    className="rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={saving}
                  >
                    저장 ⌘↵
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 검증**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter/apps/company-map
npx tsc --noEmit
npx eslint src/app/stocks src/actions/memos.ts
npx vitest run
```
Expected:
- tsc EXIT=0
- 92 tests pass
- eslint: 기존 AppMenu/WatchlistPanel 경고만(무관), 새 에러 없음

- [ ] **Step 5: 커밋**

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
git add apps/company-map/src/app/stocks/StocksExplorerClient.tsx
git commit -m "$(cat <<'EOF'
feat(company-map): add MemoButton in stock name cell

FileText icon left of the name; filled blue when hasMemo, gray outline
otherwise. Click anchors a popover with a 4-row textarea, [취소] / [저장 ⌘↵]
buttons, Cmd/Ctrl+Enter to save, Esc to cancel. Backdrop click closes
without saving; popover stopPropagation prevents accidental dismiss.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 통합 검증

**Files:** 검증만 — 코드 변경 없음.

- [ ] **Step 1: dev 재시작 안내**

```
사용자 액션:
1) 기존 npm run dev 중지 (Ctrl+C)
2) cd apps/company-map && npm run dev 재실행
3) ready 메시지 확인
```

- [ ] **Step 2: 페이지 로드 + 아이콘 노출**

`http://localhost:3004/stocks` HTTP 200. 모든 row의 종목명 왼쪽에 회색 outline FileText 아이콘 노출.

- [ ] **Step 3: 메모 추가**

임의 종목(예: 005930) 아이콘 클릭:
- popover 열림 ("불러오는 중…" 후 빈 textarea)
- "메모 테스트" 입력 후 [저장] 또는 Cmd+Enter
- popover 닫힘 + 아이콘이 파란 fill로 변경
```bash
sqlite3 apps/company-map/data/company-map.db "SELECT * FROM stock_memos;"
```
Expected: 005930 row.

- [ ] **Step 4: 메모 편집**

같은 종목 다시 클릭 → 기존 텍스트 prefill → 편집 → 저장. row가 update되고 text 갱신.

- [ ] **Step 5: 메모 삭제 (빈 string)**

popover에서 텍스트 전부 지우고 [저장]:
- 아이콘이 회색 outline으로
- DB row 삭제됨
```bash
sqlite3 apps/company-map/data/company-map.db "SELECT * FROM stock_memos WHERE code='005930';"
```
Expected: empty.

- [ ] **Step 6: 백드롭 클릭 / Esc 취소**

새로 메모 입력 중 (저장 안 함) → 백드롭 클릭 또는 Esc → popover 닫히고 변경 사항 무시 (기존 메모 그대로).

- [ ] **Step 7: 종목명 링크와 분리**

종목명 텍스트 클릭 → 메모 popover 안 열림 + 네이버 새 탭만 열림. 아이콘 클릭만 popover.

- [ ] **Step 8: 회귀**

다음 페이지 모두 200:
- `/stocks` / `/stocks?vip=1` / `/stocks?tags=1` / `/stocks?market=KOSPI`
- `/companies` / `/top-stocks` / `/ncav` / `/trade` / `/calculator`

전체 테스트:
```bash
cd apps/company-map
npx vitest run
```
Expected: 92 tests pass.

검증만 — 별도 커밋 없음. plan 완료.

---

## Self-Review Notes

**Spec coverage:**
- StockMemo 모델 + relation → Task 1 ✓
- getMemoByCode / setMemo Server Actions → Task 2 ✓
- hasMemo row 필드 + include → Task 3 ✓
- MemoButton 컴포넌트 + popover + Cmd+Enter/Esc + 백드롭 → Task 4 ✓
- 종목명 셀 wrap (메모 버튼 + 네이버 링크 분리) → Task 4 ✓
- 통합 검증 (추가/편집/삭제/취소/회귀) → Task 5 ✓

**Type consistency:**
- `getMemoByCode(code: string): Promise<string | null>` — Server Action 정의, MemoButton.openPopover 호출 일치
- `setMemo(code, text): Promise<{ hasMemo: boolean }>` — Server Action 정의, MemoButton.onSave 호출 일치 (반환값으로 setHasMemo)
- `StocksExplorerRow.hasMemo: boolean` — Server Action 매핑, Props 전달, MemoButton.initialHasMemo prop 일치

**Placeholder scan:** 없음. 각 step에 실제 코드/명령어/예상 출력 포함. `<ts>_add_stock_memo`는 Prisma 자동 생성.
