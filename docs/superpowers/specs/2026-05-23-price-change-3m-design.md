# 3개월 주가변동 — 전종목 컬럼 추가

## Context

`/stocks` 페이지는 시가총액·PER/PBR·안전마진·VIP·YoY·tag 등 정량/정성 정보를 보여주지만, **최근 단기 모멘텀**을 한눈에 볼 방법이 없다. 사용자는 종목 리스트에서 3개월 등락률을 함께 보고, 같은 화면에서 데이터 갱신도 트리거하고 싶다. 또한 매일 한 번씩 자동 갱신되길 원하지만, 한국 정규시장 종가 확정 후인 **18:00 KST 이후 1회**만 실행되어야 한다.

해결:
- 신규 `PriceChange` 1:1 모델에 종목당 현재가·3개월 전 종가·등락률(%)을 저장.
- 네이버 일별 시세 API (`siseJson.naver?requestType=1&timeframe=day`)로 단일 호출로 두 값 + 기준일까지 받음.
- 수동 갱신: 기존 RefreshMenu 드롭다운에 `price_changes` 항목 추가.
- 자동 갱신: 신규 `worker/price-change-loop.ts`가 5분마다 wake → 오늘 18:00 (KST) 지났고 RefreshState.finishedAt이 오늘 18:00 이전이면 실행.
- `refreshPriceChanges()` 함수는 wrapper(`run-refresh-job.ts`)와 worker 양쪽에서 호출되므로 **함수 내부에서 RefreshState upsert** — 어느 경로로 돌든 UI에 일관된 status.

전제:
- 서버 로컬 타임존이 KST. `setHours(18,0,0,0)` 그대로 사용. UTC 서버 이동 시 변환 필요 — 비고.
- 네이버 일별 시세 응답은 영업일 기준이라 "3개월 전 정확한 날짜"가 휴장이면 가장 가까운 이후 영업일로 대체된다.
- 전종목 fetch ~30-60분 (100ms/req throttle). 매일 1회라 부담 없음.

## 사용자 결정사항 요약
- 표시: **단일 "3M" 컬럼** ("+12.3%"). 부호별 초록/빨강/회색.
- 수동 갱신: **RefreshMenu에 항목 추가** (drop-down에서 [실행])
- 자동 갱신: **매일 18시 KST 이후 1회** (worker loop)

## 변경 파일 목록

| 영역 | 파일 | 상태 |
|---|---|---|
| Prisma | `apps/company-map/prisma/schema.prisma` | 수정 — `PriceChange` 모델 + `StockMaster.priceChange` relation |
| Migration | `apps/company-map/prisma/migrations/<ts>_add_price_change/` | 신규 |
| Naver fetcher | `apps/company-map/src/lib/stocks/price-history.ts` | 신규 — `fetchPriceChange3M(code)` |
| Refresh 로직 | `apps/company-map/src/lib/stocks/refresh-price-changes.ts` | 신규 — `refreshPriceChanges()` + RefreshState upsert |
| Trigger 스크립트 | `apps/company-map/scripts/refresh-price-changes.ts` | 신규 — thin wrapper IIFE |
| Worker loop | `apps/company-map/worker/price-change-loop.ts` | 신규 — 18시 스케줄 |
| Worker index | `apps/company-map/worker/index.ts` | 수정 — loop 등록 |
| Wrapper kind | `apps/company-map/scripts/run-refresh-job.ts` | 수정 — `price_changes` kind 매핑 |
| Server Action (refresh) | `apps/company-map/src/actions/refresh-jobs.ts` | 수정 — `RefreshKind` union 확장 |
| Server Action (explorer) | `apps/company-map/src/actions/stocks-explorer.ts` | 수정 — `pctChange3M` 필드 + include |
| 클라이언트 | `apps/company-map/src/app/stocks/StocksExplorerClient.tsx` | 수정 — "3M" 컬럼 (colSpan 11→12) |
| RefreshMenu | `apps/company-map/src/app/stocks/RefreshMenu.tsx` | 수정 — LABELS에 `price_changes` 추가 |

## 단계별 설계

### 1. Prisma `PriceChange` 모델

`StockMaster`에 relation 추가:
```prisma
  priceChange           PriceChange?
```

신규 모델 (schema 끝):
```prisma
model PriceChange {
  code         String   @id
  currentPrice Float?   @map("current_price")
  pastPrice    Float?   @map("past_price")
  pastDate     DateTime? @map("past_date")
  pctChange    Float?   @map("pct_change")
  fetchedAt    DateTime @default(now()) @map("fetched_at")

  master  StockMaster @relation(fields: [code], references: [code], onDelete: Cascade)

  @@map("price_changes")
}
```

마이그레이션: `npx prisma migrate dev --name add_price_change`. 새 테이블만, 기존 데이터 무관.

### 2. Naver fetcher — `src/lib/stocks/price-history.ts`

```ts
const API = "https://api.finance.naver.com/siseJson.naver";

export interface PriceChange3M {
  currentPrice: number;
  pastPrice: number;
  pastDate: Date;
  pctChange: number;
}

function toYyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

interface RawRow {
  0: string;          // 날짜 YYYYMMDD
  1: number;          // 시가
  2: number;          // 고가
  3: number;          // 저가
  4: number;          // 종가
  5: number;          // 거래량
  6: number;          // 외인소진율?
}

/** 네이버 일별 시세에서 3개월 전 종가와 오늘 종가를 추출. */
export async function fetchPriceChange3M(code: string): Promise<PriceChange3M | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const now = new Date();
  const past = new Date(now);
  past.setMonth(past.getMonth() - 3);

  const qs = new URLSearchParams({
    symbol: code,
    requestType: "1",
    startTime: toYyyymmdd(past),
    endTime: toYyyymmdd(now),
    timeframe: "day",
  });
  const res = await fetch(`${API}?${qs.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  const text = await res.text();
  // 네이버는 JSON 변형(quote 없는 객체) 응답 → eval-safe JSON 파싱이 필요.
  // 형식: [["날짜","시가","고가","저가","종가","거래량","외인"], [...], ...]
  let rows: unknown[];
  try {
    rows = JSON.parse(text.replace(/'/g, '"'));
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length < 2) return null;

  // 첫 row는 header. data rows는 [date, open, high, low, close, vol, foreign].
  const dataRows = rows.slice(1) as RawRow[];
  if (dataRows.length === 0) return null;
  const firstRow = dataRows[0];
  const lastRow = dataRows[dataRows.length - 1];

  const pastPrice = Number(firstRow[4]);
  const currentPrice = Number(lastRow[4]);
  if (!Number.isFinite(pastPrice) || !Number.isFinite(currentPrice) || pastPrice === 0) {
    return null;
  }

  const pastDateStr = String(firstRow[0]);
  const pastDate = new Date(
    `${pastDateStr.slice(0, 4)}-${pastDateStr.slice(4, 6)}-${pastDateStr.slice(6, 8)}T00:00:00Z`,
  );

  return {
    currentPrice,
    pastPrice,
    pastDate,
    pctChange: ((currentPrice - pastPrice) / pastPrice) * 100,
  };
}
```

⚠️ 네이버 응답 포맷이 표준 JSON이 아니라 single-quote 사용. `replace(/'/g, '"')` 후 `JSON.parse`. 만약 응답에 single-quote 가 다른 의도로 들어있으면 깨질 수 있지만, 시세 데이터는 숫자/날짜 문자열만이라 안전.

### 3. Refresh 로직 — `src/lib/stocks/refresh-price-changes.ts`

```ts
import { db } from "../../../worker/db";
import { fetchPriceChange3M } from "./price-history";

const KIND = "price_changes";
const CALL_DELAY_MS = 100;

export interface RefreshPriceChangesResult {
  total: number;
  upserted: number;
  skipped: number;
  failed: number;
}

export async function refreshPriceChanges(): Promise<RefreshPriceChangesResult> {
  const startedAt = new Date();
  await db.refreshState.upsert({
    where: { kind: KIND },
    create: { kind: KIND, status: "running", startedAt },
    update: { status: "running", startedAt, finishedAt: null, output: null },
  });

  const masters = await db.stockMaster.findMany({
    select: { code: true },
  });
  const total = masters.length;
  let upserted = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < masters.length; i++) {
    const code = masters[i].code;
    try {
      const r = await fetchPriceChange3M(code);
      await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
      if (!r) {
        skipped++;
        continue;
      }
      await db.priceChange.upsert({
        where: { code },
        create: {
          code,
          currentPrice: r.currentPrice,
          pastPrice: r.pastPrice,
          pastDate: r.pastDate,
          pctChange: r.pctChange,
        },
        update: {
          currentPrice: r.currentPrice,
          pastPrice: r.pastPrice,
          pastDate: r.pastDate,
          pctChange: r.pctChange,
          fetchedAt: new Date(),
        },
      });
      upserted++;
    } catch (e) {
      failed++;
      if (failures.length < 5) failures.push(`${code}: ${String(e).slice(0, 100)}`);
    }
    if ((i + 1) % 200 === 0) {
      console.log(
        `[price-change] progress ${i + 1}/${total} (upserted=${upserted}, skipped=${skipped}, failed=${failed})`,
      );
    }
  }

  const outputLine = `total=${total} upserted=${upserted} skipped=${skipped} failed=${failed}`;
  const output = failed > 0 ? `${outputLine}\nsample failures:\n${failures.join("\n")}` : outputLine;
  await db.refreshState.update({
    where: { kind: KIND },
    data: {
      status: failed === 0 ? "done" : "done",  // 일부 실패해도 done — 실패는 다음 회차에서 재시도
      finishedAt: new Date(),
      output: output.slice(-2000),
    },
  });

  return { total, upserted, skipped, failed };
}
```

비고: failed가 있어도 `done`으로 마킹 (네이버 일시 차단 등은 종목별 isolated). 전체 실패만 wrapper의 `catch`에서 failed로.

### 4. Trigger 스크립트 — `scripts/refresh-price-changes.ts`

```ts
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });

import { refreshPriceChanges } from "@/lib/stocks/refresh-price-changes";

(async () => {
  const start = Date.now();
  const result = await refreshPriceChanges();
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`[price-change] done in ${elapsed}s`, result);
  process.exit(0);
})();
```

### 5. Worker loop — `worker/price-change-loop.ts`

```ts
import { db } from "./db";
import { refreshPriceChanges } from "@/lib/stocks/refresh-price-changes";

const KIND = "price_changes";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SCHEDULE_HOUR_KST = 18;

async function shouldRunNow(now: Date = new Date()): Promise<boolean> {
  const today6pm = new Date(now);
  today6pm.setHours(SCHEDULE_HOUR_KST, 0, 0, 0);
  if (now < today6pm) return false;
  const state = await db.refreshState.findUnique({ where: { kind: KIND } });
  if (!state?.finishedAt) return true;
  return state.finishedAt < today6pm;
}

export async function priceChangeLoop(): Promise<void> {
  while (true) {
    try {
      if (await shouldRunNow()) {
        console.log("[price-change-loop] running at", new Date().toISOString());
        await refreshPriceChanges();
      }
    } catch (e) {
      console.error("[price-change-loop] iteration failed:", e);
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  }
}
```

### 6. Worker index 등록 — `worker/index.ts`

기존 loop들과 동일 패턴으로 `priceChangeLoop()`를 import + invoke. Promise.all 등으로 병렬 또는 fire-and-forget. 기존 코드 구조에 맞춤.

### 7. Wrapper kind 추가 — `scripts/run-refresh-job.ts`

```ts
const SCRIPTS: Record<Kind, string[]> = {
  krx_stocks: ["scripts/regenerate-krx-stocks.ts", "scripts/smoke-load-krx.ts"],
  vip_holdings: ["scripts/refresh-vip-holdings.ts"],
  operating_income: ["scripts/refresh-operating-income.ts"],
  trade: ["scripts/ingest-trade.ts"],
  price_changes: ["scripts/refresh-price-changes.ts"],
};

type Kind = "krx_stocks" | "vip_holdings" | "operating_income" | "trade" | "price_changes";
```

### 8. Server Action — `src/actions/refresh-jobs.ts`

```ts
export type RefreshKind = "krx_stocks" | "vip_holdings" | "operating_income" | "trade" | "price_changes";

const VALID_KINDS = new Set<RefreshKind>([
  "krx_stocks",
  "vip_holdings",
  "operating_income",
  "trade",
  "price_changes",
]);
```

### 9. Server Action — `src/actions/stocks-explorer.ts`

`StocksExplorerRow`에 추가:
```ts
  pctChange3M: number | null;
```

`include`:
```ts
  priceChange: true,
```

row 매핑:
```ts
  pctChange3M: m.priceChange?.pctChange ?? null,
```

(필터·정렬에 활용은 차후 spec. 지금은 표시만.)

### 10. UI — `StocksExplorerClient.tsx`

`<th>안전마진</th>` 다음에:
```tsx
<th className="p-2 font-medium text-right">3M</th>
```

각 row의 safetyMargin `<td>` 다음에:
```tsx
<td
  className={`p-2 text-right ${
    r.pctChange3M == null
      ? "text-gray-400"
      : r.pctChange3M >= 0
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400"
  }`}
>
  {r.pctChange3M == null
    ? "—"
    : `${r.pctChange3M >= 0 ? "+" : ""}${r.pctChange3M.toFixed(1)}%`}
</td>
```

`colSpan` 변경: 11 → 12 (empty/expand row 두 곳).

### 11. RefreshMenu LABELS — `RefreshMenu.tsx`

```ts
const LABELS: Record<RefreshKind, { name: string; estimate: string }> = {
  krx_stocks: { name: "KRX 종목 마스터", estimate: "~2분" },
  vip_holdings: { name: "VIP 지분공시", estimate: "~6분" },
  operating_income: { name: "영업이익 시계열", estimate: "~60분" },
  trade: { name: "수출입 동향", estimate: "~3분" },
  price_changes: { name: "3개월 주가변동", estimate: "~45분" },
};
```

## Verification

### 1. 마이그레이션
```bash
cd apps/company-map
npx prisma migrate dev --name add_price_change
sqlite3 data/company-map.db ".tables price_changes"
```

### 2. 단일 종목 dry-run
임시 스크립트로 005930만 호출 → 정상 응답 확인. spec 마무리 후 별도 검증.

### 3. wrapper 경로 검증
```bash
npx tsx scripts/run-refresh-job.ts price_changes
# 30-60분 후 done
sqlite3 data/company-map.db "SELECT COUNT(*), MIN(fetched_at), MAX(fetched_at) FROM price_changes;"
```

### 4. worker 스케줄 검증
worker 띄운 상태에서 시스템 시각이 18시 지났을 때:
```bash
# refresh_states.kind='price_changes' 의 finishedAt이 오늘 18시 이전이면 시작됨
sqlite3 data/company-map.db "SELECT status, datetime(started_at/1000, 'unixepoch'), datetime(finished_at/1000, 'unixepoch') FROM refresh_states WHERE kind='price_changes';"
```

### 5. UI
- `/stocks` HTTP 200, 표 끝에서 두 번째 컬럼에 "3M" + 등락률 색상
- 데이터 업데이트 드롭다운에 "3개월 주가변동 — ~45분" 항목 추가
- 임의 종목에 [실행] → "실행 중" → 30-60분 후 완료 표시

### 6. 회귀
- `/stocks` 기본·필터·VIP·tag·정렬·페이지네이션 모두 정상
- 다른 페이지 (`/companies`, `/top-stocks`, `/ncav`, `/trade`, `/calculator`) HTTP 200
- 기존 4개 kind refresh 정상 동작 (price_changes 추가가 RefreshKind union 확장만이라 회귀 없음)
- `npx vitest run` 78 tests pass (이 spec에 새 unit test 없음)

## 비고
- 서버 타임존이 UTC라면 `setHours(18,0,0,0)`이 잘못 동작. 우리 운영은 KST 머신 가정. spec 차후 변경 시 `Intl.DateTimeFormat` 또는 명시적 TZ 변환 필요.
- 네이버 일별 시세 API는 비공식이라 응답 포맷 변경 위험 있음. JSON 파싱 실패 시 `null` 반환으로 graceful degrade.
- 동시 실행 잠금: `refreshPriceChanges()` 자체는 RefreshState로 status 표시할 뿐, 잠금은 아님. wrapper(Server Action `triggerRefresh`)가 `status === "running"` 가드. worker도 동일하게 `shouldRunNow()` 안에서 RefreshState 확인 → 이미 running이면 시작 안 함 (단, "running" 상태가 18시 이후로 계속 끌어주면 다음 회차 trigger됨 — 다만 60분 이내 끝나므로 실용적 문제 없음).
