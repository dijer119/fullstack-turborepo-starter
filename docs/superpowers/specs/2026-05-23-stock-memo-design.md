# 전종목 종목별 메모

## Context

`/stocks` 페이지에 시장·시총·PER/PBR·안전마진·VIP·YoY·tag·3M 등 정량/카테고리 정보는 풍부해졌지만, 사용자가 종목별로 자유 텍스트(매수 이유·분석 노트·관찰 포인트 등)를 적어둘 곳이 없다. tag는 짧은 분류 라벨이고, 메모는 한 종목당 1개의 긴 자유 텍스트라는 점에서 별개의 데이터 모델이다.

해결: 신규 `StockMemo` 1:1 모델에 종목별 메모를 저장. 종목명 셀의 왼쪽에 작은 아이콘 버튼(`FileText`)을 두고, **메모 있음/없음**을 색상으로 구분. 클릭 시 anchored popover가 열리며 textarea로 편집. `[저장]`/`[취소]` 버튼 + `Cmd/Ctrl+Enter` 단축키 + `Esc`로 취소. 빈 텍스트로 저장하면 row 삭제(메모 없음).

전제:
- 단일 사용자 환경 (auth 없음). 차후 멀티유저 도입 시 `Tag`/`StockTag` 패턴과 동일하게 `userId` 확장 가능.
- 메모 본문은 popover 열 때 lazy load (모든 row의 메모 텍스트를 표 로드와 함께 받는 건 비용 낭비).
- 표는 메모 유무 boolean(`hasMemo`)만 알면 아이콘 색 결정 가능.

## 사용자 결정사항 요약
- 편집 UI: **popover** (모달 아님, expand row 아님)
- 저장: **명시적 [저장] 버튼 + Cmd/Ctrl+Enter** (autosave 안 함)
- 위치: **종목명 셀 왼쪽**에 아이콘 버튼
- 빈 텍스트 저장 = 메모 삭제 (idempotent)

## 변경 파일 목록

| 영역 | 파일 | 상태 |
|---|---|---|
| Prisma | `apps/company-map/prisma/schema.prisma` | 수정 — `StockMemo` 모델 + `StockMaster.memo` relation |
| Migration | `apps/company-map/prisma/migrations/<ts>_add_stock_memo/` | 신규 |
| Server Action | `apps/company-map/src/actions/memos.ts` | 신규 — `getMemoByCode`, `setMemo` |
| Server Action (explorer) | `apps/company-map/src/actions/stocks-explorer.ts` | 수정 — `hasMemo: boolean` + include `memo` |
| 클라이언트 | `apps/company-map/src/app/stocks/StocksExplorerClient.tsx` | 수정 — `MemoButton` 컴포넌트 + 종목명 셀 왼쪽 mount |

## 단계별 설계

### 1. Prisma 모델

`StockMaster` 모델 안 relation 블록에 추가:
```prisma
  memo                  StockMemo?
```

신규 모델 (schema 끝):
```prisma
model StockMemo {
  code      String   @id
  text      String
  updatedAt DateTime @updatedAt @map("updated_at")

  master    StockMaster @relation(fields: [code], references: [code], onDelete: Cascade)

  @@map("stock_memos")
}
```

마이그레이션: `npx prisma migrate dev --name add_stock_memo`. 새 테이블만, 기존 데이터 무관.

### 2. Server Action — `src/actions/memos.ts`

```ts
"use server";

import { db } from "@/lib/db";

/** 종목 메모 본문 조회. 없으면 null. */
export async function getMemoByCode(code: string): Promise<string | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const row = await db.stockMemo.findUnique({ where: { code } });
  return row?.text ?? null;
}

/** 메모 저장/삭제. trim 후 빈 string이면 delete (idempotent). 반환값으로 클라이언트가 hasMemo 상태 동기화. */
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

### 3. `getStocksExplorer` 확장

`StocksExplorerRow`에 추가 (tags 다음, pctChange3M 다음):
```ts
  hasMemo: boolean;
```

`include`에 추가:
```ts
  memo: { select: { code: true } },
```

row 매핑:
```ts
  hasMemo: m.memo != null,
```

### 4. 클라이언트 — `MemoButton` 컴포넌트

상단 import:
```ts
import { FileText } from "lucide-react";
import { getMemoByCode, setMemo } from "@/actions/memos";
```

종목명 `<td>` 안에서 종목명 왼쪽에 mount:
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

(현재 종목명 셀이 `<td>...<a>` 하나만 들어있는 구조 — 메모 버튼 추가로 `<div className="flex">`로 wrap.)

`MemoButton` 컴포넌트 (같은 파일 끝, TagCell 옆):

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
          {/* Backdrop — 다른 곳 클릭 시 닫힘 */}
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

### 5. Backdrop 처리

`fixed inset-0 z-10` backdrop이 다른 클릭을 받아 popover를 닫음. popover 본체는 `z-20` + `onClick={(e) => e.stopPropagation()}`로 클릭 캐치 방지.

VIP expand row와 충돌 없음 — popover는 `absolute` + 자체 backdrop, 다른 셀의 hover/click을 막지 않음.

## Verification

### 1. 마이그레이션
```bash
cd apps/company-map
npx prisma migrate dev --name add_stock_memo
sqlite3 data/company-map.db ".tables stock_memos"
```

### 2. Server Action 단위 sanity

브라우저에서 임의 종목 메모 버튼 클릭 → "테스트 메모" 입력 → 저장:
```sql
SELECT * FROM stock_memos;
```
Expected: 1 row.

같은 종목 popover 다시 열어 빈 string 저장 → row 삭제됨.

### 3. UI 동작
- 메모 없는 종목 아이콘은 회색 outline
- 메모 있는 종목 아이콘은 파란 fill
- popover 열 때 기존 메모 본문 prefill
- Cmd+Enter → 저장; Esc → 취소
- 백드롭 클릭 → 닫힘 (저장 없이)

### 4. 회귀
- 표 다른 컬럼·필터·정렬 모두 정상
- 종목명 링크(네이버 금융 이동) 정상 동작 (메모 버튼 클릭과 분리)
- `/companies`, `/top-stocks`, `/ncav`, `/trade`, `/calculator` 등 다른 페이지 200
- `npx vitest run` — 92 tests pass (이 spec에 새 unit test 없음, 기존 통과)
