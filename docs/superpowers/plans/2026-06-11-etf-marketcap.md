# ETF 시가총액 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks/etf` 상세 헤더에 선택된 ETF의 시가총액을 "1,128억" 형식으로 표시한다.

**Architecture:** 이미 일별 수집 중인 Naver `etfAnalysis` 응답의 `marketValue`(한국어 단위 문자열)를 파서가 BigInt로 변환해 `EtfPdfSnapshot.marketValue`에 저장하고, `getEtfDetail`이 최신 스냅샷 값을 `number`로 변환해 UI에 전달한다. 당일 스냅샷이 이미 있으면 marketValue만 보강 update("updated")해 오늘 바로 값이 채워지게 한다.

**Tech Stack:** Next.js 16 App Router, Prisma(SQLite, BigInt 컬럼), Vitest, 기존 유틸 `parseKoreanMarketValue`/`formatMarcap` 재사용

**Spec:** `docs/superpowers/specs/2026-06-11-etf-marketcap-design.html`

**작업 디렉토리:** 모든 경로는 리포 루트(`/Users/dijer/dev/workspace/fullstack-turborepo-starter`) 기준.

**도메인 컨텍스트 (5분 요약):**
- ETF 스냅샷 수집: `worker/etf-snapshot.ts`의 `snapshotEtf()`가 `worker/fetch-naver-etf.ts` → `src/lib/etf/naver.ts`(`parseNaverEtfAnalysis`, 순수 함수)를 거쳐 일별 1회 저장. 이미 있으면 skip.
- `etfAnalysis` 응답에 `marketValue: "1,128억"` 문자열이 있음 (라이브 확인 완료). ETF는 integration API에 marketValue가 **없으므로** 기존 `fetchMarketValue()`(`src/lib/stocks/price-history.ts`)는 재사용 불가 — 건드리지 말 것.
- 재사용 유틸: `parseKoreanMarketValue()`(`src/lib/stocks/parse-market-value.ts`, "1,128억"→BigInt 원), `formatMarcap()`(`src/lib/format-marcap.ts`, BigInt/number→"1,128억"). `@/` alias는 `src/`를 가리키며 worker 코드에서도 동작한다 (`fetch-naver-etf.ts`가 이미 `@/lib/etf/naver` import).
- ⚠️ Prisma migrate/generate 후 **실행 중인 dev 서버 재시작 필수** (옛 PrismaClient 싱글턴). Task 5에서 수행.
- ⚠️ 워크스페이스 `lint`는 pre-existing 에러 6개로 항상 exit 1 — 검증은 변경 파일만 `npx eslint <files>`.
- ⚠️ server→client로 BigInt는 직렬화 불가 — 액션 반환 전 `Number()` 변환 (시총 ≪ 2^53, 정밀도 안전).

---

### Task 1: 파서 확장 — `parseNaverEtfAnalysis`가 marketValue 반환 (TDD)

**Files:**
- Modify: `apps/company-map/src/lib/etf/naver.ts`
- Modify: `apps/company-map/src/lib/etf/naver.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`apps/company-map/src/lib/etf/naver.test.ts`에서

기존 `sample` 선언의 `itemName` 줄 아래에 `marketValue` 필드 추가:

```typescript
const sample = {
  itemCode: "0074K0",
  itemName: "KoAct K수출핵심기업TOP30액티브",
  marketValue: "1,128억",
  etfTop10MajorConstituentAssets: [
```

파일 끝 `describe` 블록 안(마지막 `it` 뒤)에 테스트 3개 추가:

```typescript
  it("marketValue를 BigInt 원 단위로 파싱한다", () => {
    const { marketValue } = parseNaverEtfAnalysis(sample);
    expect(marketValue).toBe(112_800_000_000n);
  });

  it("marketValue 필드가 없으면 null", () => {
    const { marketValue } = parseNaverEtfAnalysis({ itemName: "x" });
    expect(marketValue).toBeNull();
  });

  it("조 단위 marketValue도 파싱한다", () => {
    const { marketValue } = parseNaverEtfAnalysis({ itemName: "x", marketValue: "1.2조" });
    expect(marketValue).toBe(1_200_000_000_000n);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn workspace company-map vitest run src/lib/etf/naver.test.ts`
Expected: 신규 3개 FAIL (`marketValue`가 반환 객체에 없음 → undefined), 기존 3개 PASS

- [ ] **Step 3: 파서 구현**

`apps/company-map/src/lib/etf/naver.ts`에서

상단 import에 추가:

```typescript
import { parseKoreanMarketValue } from "@/lib/stocks/parse-market-value";
```

`NaverEtfAnalysis` 인터페이스에 필드 추가:

```typescript
interface NaverEtfAnalysis {
  itemName?: string;
  marketValue?: string;
  etfTop10MajorConstituentAssets?: NaverConstituent[];
  [k: string]: unknown;
}
```

`parseNaverEtfAnalysis` 시그니처·반환 수정 — 기존:

```typescript
export function parseNaverEtfAnalysis(json: NaverEtfAnalysis): {
  name: string;
  holdings: Holding[];
} {
```

를 다음으로:

```typescript
export function parseNaverEtfAnalysis(json: NaverEtfAnalysis): {
  name: string;
  holdings: Holding[];
  marketValue: bigint | null; // 시가총액 (원). etfAnalysis의 "1,128억" 문자열 파싱
} {
```

마지막 `return { name, holdings };`를 다음으로:

```typescript
  return { name, holdings, marketValue: parseKoreanMarketValue(json.marketValue) };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn workspace company-map vitest run src/lib/etf/naver.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 회귀 + 커밋**

Run: `yarn workspace company-map test`
Expected: 전체 PASS (171 tests)

```bash
git add apps/company-map/src/lib/etf/naver.ts apps/company-map/src/lib/etf/naver.test.ts
git commit -m "feat(company-map): etfAnalysis 파서에 시가총액(marketValue) 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `EtfPdfSnapshot.marketValue` 스키마 마이그레이션

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma` (`EtfPdfSnapshot` 모델)
- Create: `apps/company-map/prisma/migrations/<timestamp>_add_etf_snapshot_market_value/` (migrate가 생성)

- [ ] **Step 1: 스키마 수정**

`apps/company-map/prisma/schema.prisma`의 `EtfPdfSnapshot` 모델에서

기존:

```prisma
model EtfPdfSnapshot {
  id        String   @id @default(uuid())
  etfCode   String   @map("etf_code")
  trdDd     String   @map("trd_dd")
  fetchedAt DateTime @default(now()) @map("fetched_at")
```

를 다음으로 교체 (`marketValue` 한 줄 추가):

```prisma
model EtfPdfSnapshot {
  id          String   @id @default(uuid())
  etfCode     String   @map("etf_code")
  trdDd       String   @map("trd_dd")
  marketValue BigInt?  @map("market_value")
  fetchedAt   DateTime @default(now()) @map("fetched_at")
```

(필드 정렬 공백은 위와 같이 모델 내에서 맞춘다. 나머지 부분 — `watch`, `holdings`, `@@unique`, `@@index`, `@@map` — 은 변경 금지.)

- [ ] **Step 2: 마이그레이션 실행**

Run: `yarn workspace company-map prisma migrate dev --name add_etf_snapshot_market_value`
Expected: 적용 + Prisma Client 재생성 성공. ⚠️ 데이터 삭제/리셋 경고가 나오면 중단하고 BLOCKED 보고.

> 마이그레이션 이름에 `add_` 접두사 사용 — 기존 마이그레이션 다수가 동사 접두사 컨벤션 (이전 리뷰 지적 반영).

- [ ] **Step 3: 기존 데이터 확인**

Run: `sqlite3 apps/company-map/data/company-map.db "SELECT COUNT(*), COUNT(market_value) FROM etf_pdf_snapshots;"`
Expected: 행 수 | 0 (전부 NULL — 백필 없음)

- [ ] **Step 4: 회귀 + 커밋**

Run: `yarn workspace company-map test`
Expected: 전체 PASS (171 tests)

```bash
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "feat(company-map): EtfPdfSnapshot.marketValue 컬럼 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 워커 — marketValue 저장 + 당일 보강

**Files:**
- Modify: `apps/company-map/worker/fetch-naver-etf.ts`
- Modify: `apps/company-map/worker/etf-snapshot.ts`

- [ ] **Step 1: `fetchNaverEtf` 반환에 marketValue 전달**

`apps/company-map/worker/fetch-naver-etf.ts`에서

기존:

```typescript
export async function fetchNaverEtf(
  code: string,
): Promise<{ name: string; holdings: Holding[]; trdDd: string } | null> {
```

를:

```typescript
export async function fetchNaverEtf(
  code: string,
): Promise<{ name: string; holdings: Holding[]; marketValue: bigint | null; trdDd: string } | null> {
```

기존:

```typescript
    const { name, holdings } = parseNaverEtfAnalysis(json);
    return { name, holdings, trdDd: lastBusinessDay() };
```

를:

```typescript
    const { name, holdings, marketValue } = parseNaverEtfAnalysis(json);
    return { name, holdings, marketValue, trdDd: lastBusinessDay() };
```

- [ ] **Step 2: `snapshotEtf` — 저장 + 당일 보강 + "updated" 상태**

`apps/company-map/worker/etf-snapshot.ts`에서

함수 시그니처의 반환 유니언에 `"updated"` 추가 — 기존:

```typescript
): Promise<"saved" | "skipped" | "failed"> {
```

를:

```typescript
): Promise<"saved" | "skipped" | "updated" | "failed"> {
```

기존:

```typescript
    const existing = await db.etfPdfSnapshot.findUnique({
      where: { etfCode_trdDd: { etfCode: code, trdDd } },
    });
    if (existing) return "skipped";
```

를 다음으로 교체 (당일 스냅샷의 marketValue가 비어 있으면 그 필드만 보강):

```typescript
    const existing = await db.etfPdfSnapshot.findUnique({
      where: { etfCode_trdDd: { etfCode: code, trdDd } },
    });
    if (existing) {
      if (existing.marketValue == null && res.marketValue != null) {
        await db.etfPdfSnapshot.update({
          where: { id: existing.id },
          data: { marketValue: res.marketValue },
        });
        return "updated";
      }
      return "skipped";
    }
```

스냅샷 create의 `data`에 marketValue 추가 — 기존:

```typescript
      data: {
        etfCode: code,
        trdDd,
        holdings: {
```

를:

```typescript
      data: {
        etfCode: code,
        trdDd,
        marketValue: res.marketValue,
        holdings: {
```

- [ ] **Step 3: 타입·린트 확인**

Run: `cd apps/company-map && npx tsc --noEmit && npx eslint worker/fetch-naver-etf.ts worker/etf-snapshot.ts`
Expected: tsc 에러 0. eslint는 worker 디렉토리가 lint 대상 밖이면 설정 에러가 날 수 있음 — 그 경우 tsc 통과만 확인하고 보고에 명시.

- [ ] **Step 4: 커밋**

```bash
git add apps/company-map/worker/fetch-naver-etf.ts apps/company-map/worker/etf-snapshot.ts
git commit -m "feat(company-map): ETF 스냅샷에 시가총액 저장 + 당일 보강(updated)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 액션 + UI — 헤더에 시가총액 표시

**Files:**
- Modify: `apps/company-map/src/actions/etf.ts` (`EtfDetailView`, `getEtfDetail`)
- Modify: `apps/company-map/src/app/stocks/etf/EtfManager.tsx` (기준일 줄)

- [ ] **Step 1: `EtfDetailView`에 marketValue 추가**

`apps/company-map/src/actions/etf.ts`에서

기존:

```typescript
export interface EtfDetailView {
  code: string;
  name: string;
  latestTrdDd: string | null;
  prevTrdDd: string | null;
  changes: HoldingChange[];
}
```

를:

```typescript
export interface EtfDetailView {
  code: string;
  name: string;
  latestTrdDd: string | null;
  prevTrdDd: string | null;
  marketValue: number | null; // 최신 스냅샷 시가총액(원). BigInt는 직렬화 불가라 Number 변환
  changes: HoldingChange[];
}
```

- [ ] **Step 2: `getEtfDetail` 반환에 값 채우기**

같은 파일 `getEtfDetail`의 return 문 — 기존:

```typescript
  return {
    code: watch.code,
    name: watch.name,
    latestTrdDd: snaps[0]?.trdDd ?? null,
    prevTrdDd: snaps[1]?.trdDd ?? null,
    changes: latest.length ? diffHoldings(latest, prev) : [],
  };
```

를:

```typescript
  return {
    code: watch.code,
    name: watch.name,
    latestTrdDd: snaps[0]?.trdDd ?? null,
    prevTrdDd: snaps[1]?.trdDd ?? null,
    marketValue: snaps[0]?.marketValue != null ? Number(snaps[0].marketValue) : null,
    changes: latest.length ? diffHoldings(latest, prev) : [],
  };
```

- [ ] **Step 3: `EtfManager` 기준일 줄에 표시**

`apps/company-map/src/app/stocks/etf/EtfManager.tsx`에서

상단 import에 추가 (`import { moveCode } from "@/lib/etf/reorder";` 아래):

```typescript
import { formatMarcap } from "@/lib/format-marcap";
```

기존:

```tsx
          <div className="mb-2 text-sm text-gray-500">
            기준일 {detail.latestTrdDd ?? "—"}
            {detail.prevTrdDd ? ` · 직전 ${detail.prevTrdDd} 대비` : " · 비교할 직전 데이터 없음"}
          </div>
```

를:

```tsx
          <div className="mb-2 text-sm text-gray-500">
            기준일 {detail.latestTrdDd ?? "—"}
            {detail.prevTrdDd ? ` · 직전 ${detail.prevTrdDd} 대비` : " · 비교할 직전 데이터 없음"}
            {detail.marketValue != null && ` · 시가총액 ${formatMarcap(detail.marketValue)}`}
          </div>
```

- [ ] **Step 4: 타입·린트 확인**

Run: `cd apps/company-map && npx tsc --noEmit && npx eslint src/actions/etf.ts src/app/stocks/etf/EtfManager.tsx`
Expected: 둘 다 에러 0

- [ ] **Step 5: 커밋**

```bash
git add apps/company-map/src/actions/etf.ts apps/company-map/src/app/stocks/etf/EtfManager.tsx
git commit -m "feat(company-map): ETF 상세 헤더에 시가총액 표시

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 최종 검증 (dev 서버 재시작 + 실데이터 보강)

- [ ] **Step 1: 전체 테스트 + 변경 파일 린트**

Run: `yarn workspace company-map test && cd apps/company-map && npx eslint src/lib/etf/naver.ts src/lib/etf/naver.test.ts src/actions/etf.ts src/app/stocks/etf/EtfManager.tsx`
Expected: 171 tests PASS, eslint 에러 0

- [ ] **Step 2: dev 서버 재시작 (Prisma 재생성 반영)**

```bash
lsof -ti :3004 | xargs ps -o pid,command -p | grep next-server   # next-server PID 확인
kill <PID>
yarn workspace company-map dev   # 백그라운드 재시작
```

⚠️ 3004 포트에는 브라우저 클라이언트 PID도 잡히므로 **next-server만** kill. 워커 프로세스(`worker/index.ts`, `etf-pdf-loop`)가 떠 있으면 그것도 재시작 대상 (`ps aux | grep "company-map.*worker"`로 확인; 없으면 생략).

- [ ] **Step 3: 당일 스냅샷 보강 실행**

```bash
cd apps/company-map && npx tsx scripts/refresh-etf-pdf.ts
```

Expected: 각 ETF에 대해 `updated` 로그 (당일 스냅샷이 이미 있고 marketValue가 null이었으므로). 당일 스냅샷이 없던 ETF는 `saved`.

- [ ] **Step 4: DB·브라우저 확인**

1. `sqlite3 apps/company-map/data/company-map.db "SELECT etf_code, trd_dd, market_value FROM etf_pdf_snapshots WHERE market_value IS NOT NULL ORDER BY trd_dd DESC LIMIT 10;"` → 당일 행들에 값 존재
2. `http://localhost:3004/stocks/etf?code=476850` 헤더에 `· 시가총액 1,1XX억` 표시
3. 과거 스냅샷만 있는 상황 가정 검증은 불필요 (marketValue null → 조각 미표시 로직은 코드 리뷰로 확인)

- [ ] **Step 5: 완료 보고**

확인 결과를 사용자에게 보고. 커밋은 Task별로 완료.
