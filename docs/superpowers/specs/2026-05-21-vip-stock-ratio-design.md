# VIP 지분 증감 인라인 표시

## Context

이전 작업에서 `/stocks` 페이지에 "전종목 조회"와 "VIP 보유 공시 expand row"가 추가되었다. expand row는 현재 공시 날짜·보고서명·DART 링크만 보여줘서, 종목 분석에 가장 중요한 정보 — **VIP의 보유 비율이 얼마이고 직전 보고 대비 늘었는지/줄었는지** — 가 보이지 않는다.

문제:
- 사용자는 expand row를 펼친 뒤 매번 "공시 보기" 링크로 DART 페이지에 들어가 PDF/XML을 직접 봐야 보유율을 확인할 수 있다.
- OpenDART `list.json`(이미 사용 중)에는 보유율 정보가 없다.

해결:
- OpenDART `majorstock.json` API를 호출해 보유비율(`stkrt`), 보유비율 증감(`stkrt_irds`), 보고사유(`report_resn`)를 가져온다.
- `vip_holdings` 테이블에 세 컬럼을 추가하고, 기존 `refreshVipHoldings` 흐름에 enrichment 단계를 통합한다.
- expand row의 각 공시 항목에 "5.12% (+0.34%p)" 형태로 인라인 표시. 부호에 따라 색상 차등.

전제:
- `vip_holdings` 테이블에는 이미 30 row가 저장돼 있고 `corp_code` 컬럼이 있다.
- `majorstock.json`은 `corp_code` 단위로 호출. VIP 보유 종목 corp_code는 중복 제거 시 ~20개 정도.
- D001(대량보유) 보고만 지원 — D002(임원·주요주주)는 `elestock.json` 별도 endpoint지만 우리 데이터에 D002는 0건이라 YAGNI로 보류.

## 사용자 결정사항 요약

- 표시 형식: **보유율 + 증감 모두** (`5.12% (+0.34%p)`)
- 표시 위치: **expand row 각 공시 항목에 인라인**
- 수집 시점: **기존 refresh 스크립트에 통합** (별도 스크립트 없음)
- 색상: 증가 초록, 감소 빨강, 신규/0/null 회색
- 컬럼은 enrichment 전 NULL 허용 (기존 30 row 호환)

## 변경 파일 목록

| 영역 | 파일 | 상태 |
|---|---|---|
| Prisma | `apps/company-map/prisma/schema.prisma` | 수정 — `VipHolding`에 3개 컬럼 추가 |
| Migration | `apps/company-map/prisma/migrations/<ts>_add_vip_stock_ratio/` | 신규 |
| DART fetcher | `apps/company-map/src/lib/dart/major-stock.ts` | 신규 |
| Fetcher 테스트 | `apps/company-map/src/lib/dart/major-stock.test.ts` | 신규 |
| Fixture | `apps/company-map/tests/fixtures/dart-majorstock-sample.json` | 신규 |
| Refresh 통합 | `apps/company-map/src/lib/dart/vip-holdings.ts` | 수정 — `enrichVipHoldings` 함수 + refresh 흐름에 단계 추가 |
| Server Action | `apps/company-map/src/actions/vip-holdings.ts` | 수정 — `VipHoldingDetailRow`에 3개 필드 반환 |
| 클라이언트 UI | `apps/company-map/src/app/stocks/StocksExplorerClient.tsx` | 수정 — expand row에 인라인 비율 표시 |
| 포맷 유틸 | `apps/company-map/src/lib/format-ratio.ts` | 신규 — `formatStockRatio`, `ratioColorClass` |
| 유틸 테스트 | `apps/company-map/src/lib/format-ratio.test.ts` | 신규 |

## 단계별 설계

### 1. Prisma 스키마

`VipHolding` 모델에 세 컬럼 추가 (모두 nullable):

```prisma
model VipHolding {
  rcpNo            String   @id @map("rcp_no")
  code             String?
  corpCode         String   @map("corp_code")
  corpName         String   @map("corp_name")
  reportNm         String   @map("report_nm")
  reportType       String   @map("report_type")
  flrNm            String   @map("flr_nm")
  rceptDt          DateTime @map("rcept_dt")
  stockRatio       Float?   @map("stock_ratio")
  stockRatioChange Float?   @map("stock_ratio_change")
  reportResn       String?  @map("report_resn")
  fetchedAt        DateTime @default(now()) @map("fetched_at")
  master           StockMaster? @relation(fields: [code], references: [code], onDelete: SetNull)
  @@index([code])
  @@index([rceptDt])
  @@map("vip_holdings")
}
```

마이그레이션: `npx prisma migrate dev --name add_vip_stock_ratio`. ADD COLUMN 3개만 — 기존 30 row 영향 없고 새 컬럼은 NULL.

### 2. DART fetcher

`src/lib/dart/major-stock.ts` 신규:

```ts
const MAJORSTOCK_URL = "https://opendart.fss.or.kr/api/majorstock.json";

export interface MajorStockRow {
  rcpNo: string;                      // rcept_no
  stockRatio: number | null;          // stkrt
  stockRatioChange: number | null;    // stkrt_irds, "-"·빈값은 null
  reportResn: string;                 // report_resn
}

export async function fetchMajorStockByCorp(
  corpCode: string,
): Promise<MajorStockRow[]>;
```

구현:
- GET with `crtfc_key`, `corp_code` 쿼리 파라미터
- 응답: `{ status, list: [{ rcept_no, stkrt, stkrt_irds, report_resn, ... }] }`
- `status === "013"` (조회 데이터 없음) → 빈 배열
- 다른 비-`000` status → throw
- `stkrt`, `stkrt_irds`는 string으로 옴 ("5.12", "0.34" 또는 "-" / "") → parse, 실패 시 null

응답 row의 모든 필드는 OpenDART 명세상 string. 숫자 파싱은 다음 정책:
- 빈 문자열, "-", 공백만 → null
- 그 외 → `parseFloat`. NaN이면 null.

### 3. Fetcher 테스트

`tests/fixtures/dart-majorstock-sample.json`:

```json
{
  "status": "000",
  "message": "정상",
  "list": [
    {
      "rcept_no": "20260518000285",
      "rcept_dt": "20260518",
      "corp_code": "00567890",
      "corp_name": "한라IMS",
      "stkqy": "1200000",
      "stkqy_irds": "300000",
      "stkrt": "5.12",
      "stkrt_irds": "0.34",
      "ctr_stkqy": "0",
      "ctr_stkrt": "0",
      "report_resn": "신규보고"
    },
    {
      "rcept_no": "20260421000001",
      "rcept_dt": "20260421",
      "corp_code": "00567890",
      "corp_name": "한라IMS",
      "stkqy": "900000",
      "stkqy_irds": "0",
      "stkrt": "4.78",
      "stkrt_irds": "-",
      "ctr_stkqy": "0",
      "ctr_stkrt": "0",
      "report_resn": "신규보고"
    }
  ]
}
```

`major-stock.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchMajorStockByCorp } from "./major-stock";

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../tests/fixtures/dart-majorstock-sample.json"),
    "utf-8",
  ),
);

describe("fetchMajorStockByCorp", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.DART_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses majorstock.json into typed rows with numeric ratio", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    } as Response);

    const rows = await fetchMajorStockByCorp("00567890");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      rcpNo: "20260518000285",
      stockRatio: 5.12,
      stockRatioChange: 0.34,
      reportResn: "신규보고",
    });
    expect(rows[1].stockRatioChange).toBeNull();   // "-" → null
  });

  it("returns [] on status 013", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "013", message: "조회된 데이타가 없습니다" }),
    } as Response);
    const rows = await fetchMajorStockByCorp("00111111");
    expect(rows).toEqual([]);
  });

  it("throws on other DART error status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "020", message: "인증 오류" }),
    } as Response);
    await expect(fetchMajorStockByCorp("00111111")).rejects.toThrow(/020/);
  });

  it("throws when DART_API_KEY missing", async () => {
    delete process.env.DART_API_KEY;
    await expect(fetchMajorStockByCorp("00111111")).rejects.toThrow(/DART_API_KEY/);
  });
});
```

### 4. Refresh 통합

`vip-holdings.ts`에 `enrichVipHoldings` 함수 + `refreshVipHoldings` 흐름 수정.

```ts
import { fetchMajorStockByCorp } from "./major-stock";

const ENRICH_DELAY_MS = 150;  // corp_code 간 짧은 sleep

/** 주어진 corp_code들에 대해 majorstock.json을 호출해 보유율/증감/사유를 update. */
export async function enrichVipHoldings(
  corpCodes: Iterable<string>,
): Promise<{ enriched: number }> {
  const uniqueCodes = [...new Set(corpCodes)];
  let enriched = 0;
  for (const corpCode of uniqueCodes) {
    let rows: MajorStockRow[] = [];
    try {
      rows = await fetchMajorStockByCorp(corpCode);
    } catch (e) {
      console.error(`[vip] majorstock fetch failed for ${corpCode}:`, e);
      continue;
    }
    for (const r of rows) {
      const result = await db.vipHolding.updateMany({
        where: { rcpNo: r.rcpNo },
        data: {
          stockRatio: r.stockRatio,
          stockRatioChange: r.stockRatioChange,
          reportResn: r.reportResn,
        },
      });
      enriched += result.count;
    }
    if (uniqueCodes.indexOf(corpCode) < uniqueCodes.length - 1) {
      await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
    }
  }
  return { enriched };
}
```

`refreshVipHoldings` 흐름 수정:
- `upserted` row의 `corp_code`를 set에 누적
- 모든 chunk 처리 완료 후 `enrichVipHoldings(set)` 호출
- 결과 타입에 `enriched: number` 추가

```ts
export interface RefreshVipHoldingsResult {
  fetched: number;
  matchedVip: number;
  mapped: number;
  upserted: number;
  pruned: number;
  enriched: number;
}
```

### 5. Server Action 확장

`src/actions/vip-holdings.ts`에서 `VipHoldingDetailRow` 확장 + select에 새 필드 포함:

```ts
export interface VipHoldingDetailRow {
  rcpNo: string;
  reportNm: string;
  reportType: string;
  rceptDt: string;
  stockRatio: number | null;
  stockRatioChange: number | null;
  reportResn: string | null;
  dartUrl: string;
}
```

`findMany`는 기본 select (모든 필드)를 사용하므로 별도 추가 불필요. 매핑 부분에 새 필드 채우기.

### 6. 포맷 유틸

`src/lib/format-ratio.ts`:

```ts
export function formatStockRatio(
  ratio: number | null,
  change: number | null,
  reportResn: string | null,
): string {
  if (ratio == null) return "—";
  const ratioStr = `${ratio.toFixed(2)}%`;
  if (change == null || change === 0) {
    if (reportResn && reportResn.includes("신규")) return `${ratioStr} (신규)`;
    return ratioStr;
  }
  const sign = change > 0 ? "+" : "";
  return `${ratioStr} (${sign}${change.toFixed(2)}%p)`;
}

export function ratioColorClass(change: number | null): string {
  if (change == null || change === 0) return "text-gray-500 dark:text-gray-400";
  if (change > 0) return "text-green-600 dark:text-green-400";
  return "text-red-600 dark:text-red-400";
}
```

`format-ratio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatStockRatio, ratioColorClass } from "./format-ratio";

describe("formatStockRatio", () => {
  it("returns dash when ratio null", () => {
    expect(formatStockRatio(null, 0.34, null)).toBe("—");
  });
  it("formats ratio + positive change", () => {
    expect(formatStockRatio(5.12, 0.34, null)).toBe("5.12% (+0.34%p)");
  });
  it("formats ratio + negative change", () => {
    expect(formatStockRatio(6.21, -0.50, null)).toBe("6.21% (-0.50%p)");
  });
  it("marks 신규 when change is null and report_resn says 신규", () => {
    expect(formatStockRatio(4.78, null, "신규보고")).toBe("4.78% (신규)");
  });
  it("returns ratio alone when change is 0 and not 신규", () => {
    expect(formatStockRatio(5.00, 0, "변동보고")).toBe("5.00%");
  });
});

describe("ratioColorClass", () => {
  it("green for positive", () => {
    expect(ratioColorClass(0.34)).toContain("green");
  });
  it("red for negative", () => {
    expect(ratioColorClass(-0.5)).toContain("red");
  });
  it("gray for null or zero", () => {
    expect(ratioColorClass(null)).toContain("gray");
    expect(ratioColorClass(0)).toContain("gray");
  });
});
```

### 7. UI 변경

`StocksExplorerClient.tsx`의 expand row `<ul>` 각 `<li>`를 다음으로 변경:

```tsx
import { formatStockRatio, ratioColorClass } from "@/lib/format-ratio";

// ...

<li key={d.rcpNo} className="flex items-center gap-3">
  <span className="font-mono text-gray-500 w-24">{d.rceptDt.slice(0, 10)}</span>
  <span className="flex-1">{d.reportNm}</span>
  <span className={`w-36 text-right font-mono ${ratioColorClass(d.stockRatioChange)}`}>
    {formatStockRatio(d.stockRatio, d.stockRatioChange, d.reportResn)}
  </span>
  <a
    href={d.dartUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
  >
    공시 보기 <ExternalLink size={12} />
  </a>
</li>
```

`w-36` 폭 고정으로 행 정렬. 모든 항목이 — 인 경우(enrichment 안 됨)에도 레이아웃이 흔들리지 않음.

## Verification

### 1. 마이그레이션
```bash
cd apps/company-map
npx prisma migrate dev --name add_vip_stock_ratio
```
검증:
```bash
sqlite3 data/company-map.db "PRAGMA table_info(vip_holdings);" | grep -E "stock_ratio|report_resn"
```

### 2. 수집 (refresh 재실행)
```bash
npx tsx scripts/refresh-vip-holdings.ts
```
출력 예시:
```
[vip] done in <N>s { fetched: ..., matchedVip: 30, mapped: 30, upserted: 30, pruned: 0, enriched: 30 }
```

### 3. DB 검증
```sql
-- 사용자가 든 예시
SELECT rcp_no, corp_name, stock_ratio, stock_ratio_change, report_resn
FROM vip_holdings WHERE rcp_no='20260518000285';
-- 한라IMS의 보유율과 증감이 NULL이 아닌 숫자

-- enrichment 커버리지
SELECT
  SUM(stock_ratio IS NOT NULL) AS with_ratio,
  COUNT(*) AS total
FROM vip_holdings;
-- with_ratio == total 또는 거의 비슷
```

### 4. UI 동작 (dev 재시작 후)
- `/stocks?vip=1` → 임의 종목 expand → 각 공시 항목에 `5.12% (+0.34%p)` 형태 표시
- 증가는 초록, 감소는 빨강, 신규는 회색 `(신규)`
- 행 정렬 흔들리지 않음 (`w-36`)

### 5. 테스트
```bash
npx vitest run
```
Expected: 기존 35 + major-stock 4 + format-ratio 7 = 46 tests pass.

### 6. 회귀
- `/stocks?vip=0`, `/stocks` 기본 → 기존 동작 동일
- 새 컬럼이 모두 nullable이라 기존 Server Action / Prisma client 호환
