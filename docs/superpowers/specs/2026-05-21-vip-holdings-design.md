# 브이아이피자산운용 지분공시 통합 (전종목 조회 페이지)

## Context

이전 작업에서 `/stocks` "전종목 조회" 페이지가 추가되어 KOSPI/KOSDAQ 전 상장사를 필터·정렬로 탐색할 수 있게 되었다. 사용자는 가치투자 운용사인 **브이아이피자산운용**(VIP)이 어떤 종목을 보유 중인지, 최근 6개월간 어떻게 보유 비중이 바뀌었는지를 같은 페이지에서 확인하고 싶어한다.

문제:
- DART 시스템에서 자산운용사가 5% 이상 보유 종목에 대해 제출하는 "주식등의대량보유상황보고서(D001)"·"임원·주요주주특정증권등소유상황보고서(D002)"는 **피보고 회사의 corp_code**로 등록된다. VIP는 `flr_nm`(제출인명) 필드에만 나타난다.
- OpenDART MCP 도구의 `get_disclosurelist`는 corp_code가 필수라 "제출인=VIP" 같은 역방향 검색은 불가.
- 사용자가 VIP 보유 종목을 사전에 알 수 없으므로 전 종목을 일일이 조회하는 것은 비효율.

해결:
- OpenDART `list.json` API를 corp_code 없이 `pblntf_ty=D`(지분공시) + 최근 6개월 윈도우로 호출.
- 응답에서 `flr_nm === "브이아이피자산운용"`인 row만 필터링.
- 각 row를 `VipHolding` 테이블에 upsert.
- `/stocks` 페이지 Server Action이 `StockMaster JOIN VipHolding`으로 종목별 공시 건수·최신 접수일을 함께 반환.
- 표에 "VIP" 컬럼·"VIP 보유만" 필터를 추가하고, 'N건' 셀 클릭 시 row를 expand해 6개월치 공시 이력을 DART 링크와 함께 표시.

전제:
- `DART_API_KEY` 환경변수는 `.env`에 이미 설정되어 있다.
- `StockMaster.market` 컬럼과 KRX 시드는 이전 작업에서 완료되었다 (단, KRX 재시드는 사용자가 별도 실행하는 단계로 남아 있음).
- VIP corp_code는 `00477424` (검증 완료). 다른 자산운용사로 일반화하는 작업은 YAGNI로 보류.

## 사용자 결정사항 요약
- **UI 위치**: `/stocks` 표에 컬럼 추가 + "VIP 보유만" 필터 (별도 메뉴 아님)
- **표시 단위**: 종목당 1행, 'VIP N건' 셀 클릭 시 expand로 최근 6개월 전체 공시 이력
- **공시 범위**: D001 대량보유 + D002 임원·주요주주
- **갱신 주기**: 수동 트리거 스크립트 (cron/worker 없음)

## 변경 파일 목록

| 영역 | 파일 | 상태 |
|---|---|---|
| Prisma | `apps/company-map/prisma/schema.prisma` | 수정 — `VipHolding` 모델 + `StockMaster.vipHoldings` relation |
| Migration | `apps/company-map/prisma/migrations/<ts>_add_vip_holdings/migration.sql` | 신규 |
| DART fetcher | `apps/company-map/src/lib/dart/disclosure-list.ts` | 신규 |
| DART corp 매핑 | `apps/company-map/src/lib/dart/corp-code.ts` | 수정 — `loadCorpCodeReverseMap()` 추가 |
| VIP 수집 로직 | `apps/company-map/src/lib/dart/vip-holdings.ts` | 신규 |
| 수동 트리거 | `apps/company-map/scripts/refresh-vip-holdings.ts` | 신규 |
| Server Action 확장 | `apps/company-map/src/actions/stocks-explorer.ts` | 수정 — `vipOnly`, `vipHoldingsCount`, `vipLatestRceptDt` |
| Expand 상세 | `apps/company-map/src/actions/vip-holdings.ts` | 신규 — `getVipHoldingsByCode(code)` |
| 페이지 | `apps/company-map/src/app/stocks/page.tsx` | 수정 — `vipOnly` 파싱 |
| 클라이언트 | `apps/company-map/src/app/stocks/StocksExplorerClient.tsx` | 수정 — VIP 컬럼·필터·expand row |

## 단계별 설계

### 1. Prisma 스키마

```prisma
model VipHolding {
  rcpNo       String   @id                         // 14자리 접수번호
  code        String                                // 종목코드 6자리 (StockMaster FK)
  corpCode    String   @map("corp_code")            // DART 8자리
  corpName    String   @map("corp_name")
  reportNm    String   @map("report_nm")
  reportType  String   @map("report_type")          // "D001" | "D002"
  flrNm       String   @map("flr_nm")               // 제출인명 (브이아이피자산운용)
  rceptDt     DateTime @map("rcept_dt")
  fetchedAt   DateTime @default(now()) @map("fetched_at")

  master      StockMaster? @relation(fields: [code], references: [code], onDelete: SetNull)

  @@index([code])
  @@index([rceptDt])
  @@index([flrNm])
  @@map("vip_holdings")
}
```

`StockMaster`에 역방향 relation 추가:
```prisma
model StockMaster {
  // ... 기존 필드
  vipHoldings  VipHolding[]
}
```

마이그레이션: `npx prisma migrate dev --name add_vip_holdings`. 새 테이블 + 인덱스만 생성하므로 기존 데이터 영향 없음.

### 2. OpenDART list.json fetcher

`src/lib/dart/disclosure-list.ts` 신규. 페이지네이션 포함 전체 fetch.

```ts
export interface DartDisclosureRow {
  corpCode: string;        // corp_code
  corpName: string;        // corp_name
  reportNm: string;        // report_nm
  rcpNo: string;           // rcept_no (14자리)
  flrNm: string;           // flr_nm (제출인명)
  rceptDt: string;         // YYYYMMDD
  pblntfDetailTy?: string; // pblntf_detail_ty (D001 등)
}

export interface FetchDisclosureListParams {
  bgnDe: string;           // YYYYMMDD
  endDe: string;
  pblntfTy?: string;       // "D" 등
  pblntfDetailTy?: string; // "D001" 등
}

export async function* iterateDartDisclosures(
  params: FetchDisclosureListParams,
): AsyncGenerator<DartDisclosureRow>;
```

구현:
- `https://opendart.fss.or.kr/api/list.json?crtfc_key=${DART_API_KEY}&bgn_de=...&end_de=...&pblntf_ty=...&page_count=100&page_no=N`
- 응답: `{ status, total_page, list: [...] }`
- `status === "013"` (조회된 데이터 없음) → 빈 결과 정상 종료
- `status !== "000"` → 에러 throw
- `total_page`까지 순차 fetch. 페이지 간 짧은 sleep(200ms)로 친절히.

### 3. corp-code reverse map

`src/lib/dart/corp-code.ts`에 추가:

```ts
let cachedReverseMap: Map<string, string> | null = null;

/** corp_code → stock_code (6자리). loadCorpCodeMap을 invert. */
export async function loadCorpCodeReverseMap(): Promise<Map<string, string>> {
  if (cachedReverseMap) return cachedReverseMap;
  const forward = await loadCorpCodeMap();
  const reverse = new Map<string, string>();
  for (const [stock, corp] of forward) reverse.set(corp, stock);
  cachedReverseMap = reverse;
  return reverse;
}
```

### 4. VIP 수집 로직

`src/lib/dart/vip-holdings.ts` 신규.

```ts
const VIP_FLR_NM = "브이아이피자산운용";
const ALLOWED_DETAIL_TY = new Set(["D001", "D002"]);
const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

export interface RefreshVipHoldingsResult {
  fetched: number;        // 전체 D 공시 row 수
  matchedVip: number;     // flr_nm 매칭 수
  mapped: number;         // stock_code 매핑 성공 수
  upserted: number;
  pruned: number;
}

export async function refreshVipHoldings(
  now: Date = new Date(),
): Promise<RefreshVipHoldingsResult>;
```

흐름:
1. `bgnDe` = now - 6개월, `endDe` = now (YYYYMMDD)
2. `iterateDartDisclosures({ bgnDe, endDe, pblntfTy: "D" })` 순회
3. 매 row마다:
   - `fetched++`
   - `flrNm !== VIP_FLR_NM` → skip
   - `matchedVip++`
   - `pblntfDetailTy`가 set에 없으면 skip
   - corpCode → stockCode 매핑 안 되면 skip (비상장)
   - `mapped++`
   - `db.vipHolding.upsert({ where: { rcpNo }, ... })`, `upserted++`
4. 6개월 윈도우 밖 row delete: `db.vipHolding.deleteMany({ where: { rceptDt: { lt: cutoff } } })`, `pruned`

DART `pblntfDetailTy` 필드는 list.json 응답에 항상 들어가지 않을 수 있음. **fallback**: `reportNm`에 "대량보유" 포함 → D001, "임원·주요주주" 포함 → D002로 분류.

### 5. 수동 트리거 스크립트

`scripts/refresh-vip-holdings.ts`:

```ts
import { refreshVipHoldings } from "@/lib/dart/vip-holdings";

(async () => {
  const result = await refreshVipHoldings();
  console.log("[vip]", result);
  process.exit(0);
})();
```

실행: `cd apps/company-map && npx tsx scripts/refresh-vip-holdings.ts`

### 6. Server Action 확장

`src/actions/stocks-explorer.ts`:

```ts
export interface StocksExplorerParams {
  // ... 기존
  vipOnly?: boolean;
}

export interface StocksExplorerRow {
  // ... 기존
  vipHoldingsCount: number;
  vipLatestRceptDt: string | null;  // ISO string or null
}
```

쿼리 변경:
- `include: { analysis: true, vipHoldings: { orderBy: { rceptDt: "desc" }, take: 1, select: { rceptDt: true } }, _count: { select: { vipHoldings: true } } }`
- `vipOnly === true` → `where.vipHoldings = { some: {} }`
- 매핑 시 `vipHoldingsCount = m._count.vipHoldings`, `vipLatestRceptDt = m.vipHoldings[0]?.rceptDt.toISOString() ?? null`

`src/actions/vip-holdings.ts` 신규:

```ts
"use server";

export interface VipHoldingRow {
  rcpNo: string;
  reportNm: string;
  reportType: string;
  rceptDt: string;
  dartUrl: string;
}

export async function getVipHoldingsByCode(
  code: string,
): Promise<VipHoldingRow[]> {
  const rows = await db.vipHolding.findMany({
    where: { code },
    orderBy: { rceptDt: "desc" },
  });
  return rows.map((r) => ({
    rcpNo: r.rcpNo,
    reportNm: r.reportNm,
    reportType: r.reportType,
    rceptDt: r.rceptDt.toISOString(),
    dartUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcpNo}`,
  }));
}
```

### 7. 페이지 변경

`src/app/stocks/page.tsx`:
```ts
const view: StocksExplorerView = {
  // ... 기존
  vipOnly: sp.vip === "1",
};
```

### 8. 클라이언트 UI 변경

`StocksExplorerClient.tsx`:

**필터 패널에 체크박스 추가**:
```tsx
<label className="flex items-center gap-2">
  <input type="checkbox" checked={vipOnly} onChange={...} />
  <span>VIP 보유 종목만</span>
</label>
```

`buildQuery` 헬퍼에 `vip=1` 추가.

**표 컬럼**: 안전마진 오른쪽에 "VIP" 컬럼 (`colSpan` 변경).
```tsx
<th className="p-2 font-medium text-right">VIP</th>
```

**셀**:
```tsx
<td className="p-2 text-right">
  {r.vipHoldingsCount > 0 ? (
    <button
      onClick={() => toggleExpand(r.code)}
      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
    >
      {r.vipHoldingsCount}건
      {expanded.has(r.code) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </button>
  ) : "—"}
</td>
```

**Expand row** (해당 row 아래 `<tr><td colSpan={10}>...`):
- 첫 expand 시 `getVipHoldingsByCode(code)`를 `useTransition` 안에서 호출
- 로컬 캐시 `Record<string, VipHoldingRow[]>` 사용
- 공시 리스트는 `<ul>`로 렌더, 각 항목은 `rceptDt` + `reportNm` + `<a target="_blank" rel="noopener" href={dartUrl}>공시 보기</a>`

상태:
```ts
const [expanded, setExpanded] = useState<Set<string>>(new Set());
const [vipDetails, setVipDetails] = useState<Record<string, VipHoldingRow[]>>({});
```

## Verification

### 1. 마이그레이션
```bash
cd apps/company-map
npx prisma migrate dev --name add_vip_holdings
```
→ `vip_holdings` 테이블 + 3개 인덱스 생성 확인.

### 2. 수집 스크립트
```bash
npx tsx scripts/refresh-vip-holdings.ts
```
출력 예시:
```
[vip] { fetched: ~5000, matchedVip: 20~40, mapped: 18~35, upserted: 18~35, pruned: 0 }
```

SQL 검증:
```sql
SELECT COUNT(*), MIN(rcept_dt), MAX(rcept_dt) FROM vip_holdings;
SELECT code, COUNT(*) AS n FROM vip_holdings GROUP BY code ORDER BY n DESC LIMIT 10;
SELECT * FROM vip_holdings WHERE rcp_no = '20260518000285';
-- 사용자가 든 예시 — 한라IMS(017250) row 존재 확인
```

### 3. 페이지 동작 (dev server 재시작 후)
- `/stocks?vip=1` → VIP 보유 종목만
- 필터 패널 "VIP 보유 종목만" 체크 → URL `vip=1`
- 표에 "VIP" 컬럼 노출, 보유 종목은 'N건', 미보유는 '—'
- 'N건' 클릭 → expand row에 공시 이력 + `[공시 보기]` 새 탭으로 DART
- 한 번 펼친 row는 캐시되어 두 번째 클릭 시 즉시 표시

### 4. 회귀
- `/stocks?vip=0`, `/stocks` 기본 동작 → 기존과 동일
- `vipHoldings` relation 추가가 `/companies`, `/top-stocks`, `/ncav`, `/calculator`에 영향 없는지 확인 (Prisma relation 정의는 컬럼 영향 없음 → 안전)
