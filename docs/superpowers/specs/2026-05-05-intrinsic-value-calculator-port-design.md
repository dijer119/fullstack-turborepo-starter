# Intrinsic Value Calculator — company-map 이식 디자인

**작성일**: 2026-05-05
**대상 앱**: `apps/company-map`
**원본**: https://github.com/spaceromany/intrinsic-value-calculator (Flask + Python)

## 1. 목적

원본 Flask 앱(spaceromany/intrinsic-value-calculator)의 기능을 `apps/company-map`(Next.js 16 App Router) 하위에 그대로 이식한다. 이 앱은 향후 "금융 포털"의 일부로 확장될 예정이며, 햄버거 메뉴(`AppMenu`)를 통해 진입한다. 기존 `apps/web`의 내재가치 페이지나 `apps/api`의 NestJS 모듈은 **재사용하지 않고**, 원본 Python 구현을 기준으로 새로 구축한다.

## 2. 이식 범위

원본의 전체 기능을 풀 이식한다. 단, 백그라운드 분석은 Python `threading` 대신 별도 Node 프로세스(워커)로 분리한다.

### 포함

- 단일 종목 분석 (네이버 금융 크롤링 → 내재가치/안전마진 계산)
- 전체 KRX 종목 일괄 분석 (워커, 2분 주기, 1시간 캐시)
- 상위 안전마진 종목 페이지 + 배당 필터 + 엑셀 export
- NCAV 스크리닝 (DART OpenAPI, 24시간 캐시)
- 관심종목 (localStorage) + 엑셀 export
- 투자 격언 표시 (`investment_quotes.json` 5개 그대로)
- KRX 종목 마스터: 원본 `krx_stocks.json`을 시드로 사용

### 제외 (원본의 옵션 또는 부가 기능)

- Supabase Storage 백업 — SQLite 사용으로 불필요
- PWA / Service Worker / Open Graph / 구글 사이트 검증 — 추후 추가 가능
- `FinanceDataReader.StockListing('KRX')` 자동 갱신 — Node 동등 라이브러리 부재로 시드 JSON 사용

## 3. 아키텍처

### 폴더 구조

```
apps/company-map/
├── prisma/
│   ├── schema.prisma                      # + StockMaster, StockAnalysis, NcavResult
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── calculator/page.tsx            # NEW: 단일 종목 분석 (= 원본 /)
│   │   ├── top-stocks/page.tsx            # NEW: 상위 안전마진 종목 (= 원본 /top-stocks)
│   │   └── ncav/page.tsx                  # NEW: NCAV 스크리닝
│   ├── actions/
│   │   ├── stocks.ts                      # NEW: searchStocks/getTopStocks/analyzeStockOnDemand
│   │   ├── watchlist.ts                   # NEW: exportWatchlistExcel
│   │   └── ncav.ts                        # NEW: getNcavStocks
│   ├── lib/
│   │   ├── stocks/
│   │   │   ├── naver-scraper.ts           # cheerio 파싱
│   │   │   ├── intrinsic-value.ts         # 가중 EPS, 안전마진 계산식
│   │   │   ├── analyze-stock.ts           # 단일 종목 분석 = analyze_stock()
│   │   │   └── analyze-all.ts             # 전체 분석 = analyze_all_stocks()
│   │   └── dart/
│   │       ├── corp-code.ts               # corpCode.xml 다운로드/파싱
│   │       ├── financial.ts               # fnlttSinglAcnt.json
│   │       └── ncav.ts                    # calculate_ncav_screening()
│   ├── components/
│   │   ├── layout/AppMenu.tsx             # MODIFY: 도구 섹션 + 내부 라우트 3개
│   │   └── stocks/
│   │       ├── StockSearch.tsx
│   │       ├── StockResultCard.tsx
│   │       ├── TopStocksTable.tsx
│   │       ├── NcavTable.tsx
│   │       ├── WatchlistPanel.tsx
│   │       └── QuoteBanner.tsx
│   └── data/
│       ├── krx_stocks.json                # 원본 repo에서 다운로드 (시드, ~200KB)
│       └── investment_quotes.json         # 원본 repo에서 다운로드 (~1.5KB)
└── worker/
    ├── index.ts                           # background_update() 무한 루프
    ├── analyze-loop.ts                    # 종목 분석 루프
    ├── ncav-loop.ts                       # NCAV 스크리닝
    └── load-krx.ts                        # krx_stocks.json → DB upsert
```

### 실행 흐름

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│  yarn workspace dev (3004)   │         │  yarn workspace worker        │
│  (Next.js)                   │         │  (Node 프로세스, 포트 없음)    │
│                              │         │                              │
│  - 페이지 렌더링              │         │  - 2분마다 무한 루프          │
│  - 사용자 검색 시 단일 종목    │         │  - 네이버 크롤링 (~2,500개)   │
│    네이버 즉시 크롤링          │         │  - DART NCAV 계산             │
│  - DB read                   │         │  - DB write                   │
└─────────────┬────────────────┘         └─────────────┬────────────────┘
              │                                         │
              └────────────┬────────────────────────────┘
                           ▼
                  ┌────────────────────┐
                  │ company-map.db      │
                  │ (SQLite, Prisma)     │
                  └────────────────────┘
```

워커는 Next.js와 같은 프로세스에서 띄우지 않는다. 이유:

1. Next dev hot-reload 시 무한 루프가 중복 시작될 수 있음
2. production 멀티 인스턴스 시 작업이 중복됨
3. 장시간 크롤링이 웹 요청 처리에 영향

별도 진입점으로 `tsx worker/index.ts`를 새 npm script(`worker`)로 등록한다. 사용자가 별도 터미널에서 `yarn workspace company-map worker`로 실행한다. 종료는 `Ctrl+C` (`SIGINT`/`SIGTERM` 핸들러로 현재 종목 끝나면 graceful shutdown).

### 원본 → 이식 매핑

| 원본 (Flask) | 이식 (Next.js) |
|---|---|
| `GET /` | `/calculator` 페이지 |
| `GET /top-stocks` | `/top-stocks` 페이지 |
| `GET /ncav` | `/ncav` 페이지 |
| `GET /search?query=` | server action `searchStocks(keyword)` |
| `GET /filter?dividend=&limit=` | server action `getTopStocks({ dividend, limit })` |
| `GET /ncav?positive=&limit=&dividend=` | server action `getNcavStocks({ positive, limit, dividend })` |
| `POST /watchlist/data` | client에서 직접 `getStocksByCodes(codes)` |
| `POST /watchlist/export` | server action `exportWatchlistExcel(stocks)` |
| `POST /watchlist/add` / `remove` | 클라이언트 localStorage (서버 호출 없음) |
| `background_update()` thread | `worker/index.ts` 무한 loop |
| `analyze_stock(ticker)` | `lib/stocks/analyze-stock.ts` |
| `analyze_all_stocks()` | `lib/stocks/analyze-all.ts` (워커에서 호출) |
| `calculate_ncav_screening()` | `lib/dart/ncav.ts` (워커에서 호출) |
| `load_krx_stocks()` | `worker/load-krx.ts` (시드 JSON → DB) |
| `all_safety_margin_results.json` | `StockAnalysis` 테이블 |
| `ncav_results.json` | `NcavResult` 테이블 |
| `krx_stocks.json` | `StockMaster` 테이블 (+ 시드 JSON 파일) |

## 4. 데이터 모델 (Prisma 스키마)

`apps/company-map/prisma/schema.prisma`에 다음 3개 모델을 추가한다. 기존 `Industry`, `Company`, `CompanyIndustry`는 변경하지 않는다.

```prisma
model StockMaster {
  code      String   @id                  // KRX 종목코드
  name      String
  marcap    BigInt?                       // 시가총액 (NCAV)
  corpCode  String?  @map("corp_code")    // DART corp_code (NCAV)
  updatedAt DateTime @updatedAt @map("updated_at")

  analysis    StockAnalysis?
  ncavResult  NcavResult?

  @@index([name])
  @@map("stock_masters")
}

model StockAnalysis {
  code              String   @id
  name              String
  currentPrice      Float?   @map("current_price")
  intrinsicValue    Float?   @map("intrinsic_value")
  safetyMargin      Float?   @map("safety_margin")
  treasuryRatio     Float?   @map("treasury_ratio")
  dividendYield     Float?   @map("dividend_yield")
  lastUpdated       DateTime @map("last_updated")

  master  StockMaster @relation(fields: [code], references: [code], onDelete: Cascade)

  @@index([safetyMargin])
  @@index([dividendYield])
  @@index([lastUpdated])
  @@map("stock_analyses")
}

model NcavResult {
  code              String   @id
  name              String
  ncav              BigInt
  marcap            BigInt
  ncavRatio         Float?   @map("ncav_ratio")          // ncav / marcap * 100
  currentAssets     BigInt   @map("current_assets")      // 유동자산
  totalLiabilities  BigInt   @map("total_liabilities")   // 부채총계
  totalAssets       BigInt   @map("total_assets")        // 자산총계
  totalEquity       BigInt   @map("total_equity")        // 자본총계
  bsnsYear          Int      @map("bsns_year")
  ncavPositive      Boolean  @map("ncav_positive")       // ncav > marcap
  lastUpdated       DateTime @map("last_updated")

  master  StockMaster @relation(fields: [code], references: [code], onDelete: Cascade)

  @@index([ncavRatio])
  @@index([ncavPositive])
  @@map("ncav_results")
}
```

원본 JSON 캐시(`all_safety_margin_results.json`, `ncav_results.json`)와 1:1 매핑된다. SQLite는 BigInt를 지원하며, Prisma 클라이언트는 JS BigInt로 직렬화 — 클라이언트로 보낼 때는 직렬화 helper로 string 변환한다.

## 5. 페이지 구성 (UI)

원본의 Bootstrap 5 + Font Awesome 디자인을 company-map의 **Tailwind v4 + Lucide React**로 변환한다. 레이아웃과 기능은 원본과 동일하게 유지한다.

### `/calculator` (원본 `/`)

- **격언 배너**: 페이지 상단, `investment_quotes.json` 5개 중 랜덤. SSR 시 서버에서 선택.
- **검색창**: 종목명 입력. 300ms debounce, 2자 이상에서 server action `searchStocks` 호출 (원본 `/search` 동작과 동일 — 분석된 종목만 결과로 노출).
- **검색 결과 드롭다운**: 종목명, 종목코드, 현재가, 안전마진, 마지막 업데이트(상대 시간).
- **결과 카드**: 종목 클릭 시 표시. 항목:
  - 현재가 / 내재가치 / 안전마진(색상 구분: ≥30% emerald, ≥10% green, ≥-10% amber, ≥-30% orange, 그 외 red) / 자사주비율 / 배당수익률 / 마지막 업데이트
  - 우상단 ♥ 토글 (관심종목 추가/제거, localStorage)
  - 우하단 "지금 분석" 버튼 — 캐시 안 된 종목을 즉시 분석. server action `analyzeStockOnDemand(code)` 호출 → 네이버 크롤링 → DB 갱신 → 결과 갱신.
- **관심종목 패널**: localStorage에서 코드 목록 읽어와 server에서 조회한 데이터로 렌더. 엑셀 다운로드 버튼.

### `/top-stocks` (원본 `/top-stocks`)

- **격언 배너** (원본과 동일하게 표시).
- **필터 바**:
  - 상위 N개: 30 / 50 / 100 / 200 / 300 (기본 30)
  - 배당수익률 ≥: 없음 / 1 / 2 / 3 / 5 / 7 (기본 없음)
- **테이블 컬럼**: 종목코드 / 종목명 / 현재가 / 내재가치 / 안전마진(%) / 자사주(%) / 배당(%) / 마지막 업데이트 / NCAV 비율 / 관심종목 ♥
- **정렬**: 안전마진 desc (NaN/null은 뒤로).
- **엑셀 다운로드**: 필터링된 목록 그대로. 파일명: `안전마진_상위{N}종목[_배당수익률{X}%이상].xlsx` (원본 동일).
- **NCAV 비율 컬럼**: `getTopStocks` 쿼리 시 `NcavResult`를 LEFT JOIN — 우선주(`code` 마지막 자리 ≠ '0')는 보통주 코드(`code[:-1] + '0'`)로 fallback 매핑 (원본 동일).

### `/ncav` (원본 `/ncav`)

- **필터**: 상위 N개 (기본 50, 100, 200, 500), `ncavPositive=true` 토글, 배당 필터 (기본 없음, 1%, 3%, 5%).
- **테이블 컬럼**: 종목코드 / 종목명 / NCAV / 시가총액 / NCAV 비율(%) / 유동자산 / 부채총계 / 사업연도 / 배당 / "NCAV>시총" 뱃지.
- **정렬**: NCAV 비율 desc (null은 뒤로).
- **헤더 통계**: 전체 분석 종목 수, NCAV>시총 종목 수.

### 공통

- 페이지 레이아웃: 기존 `Header.tsx` 그대로 사용 (햄버거 + 페이지 우측 네비). 페이지 우측 네비에는 Map / Companies / Industries / Import 가 이미 있음 — 여기에 Calculator / Top Stocks / NCAV 추가.
- 다크 모드: company-map 기존 패턴 따라 `dark:` 클래스 활용.

## 6. 백엔드 / 워커 동작

### Naver Scraper (`lib/stocks/naver-scraper.ts`)

원본 [safety_margin_calc_naver.py](https://github.com/spaceromany/intrinsic-value-calculator/blob/main/safety_margin_calc_naver.py)의 `analyze_stock()`과 `get_treasury_stock_info()`를 그대로 이식.

- HTTP 클라이언트: native `fetch` (Node 18+) — 30초 timeout (`AbortController`).
- HTML 파싱: `cheerio`.
- User-Agent: `Mozilla/5.0`, Referer: `https://finance.naver.com` (자사주 요청 시).
- 엔드포인트:
  - `https://finance.naver.com/item/main.naver?code={ticker}` — 종목명, 현재가, 배당수익률(`#_dvr`), PBR/EPS/BPS (3년치)
  - `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={ticker}` — 자사주 수, 자사주 비율 (`<tr>` 중 "자사주" 포함된 행의 2번째/3번째 `<td>`)
- XPath → CSS 셀렉터 변환 매핑:
  - 종목명: `'//*[@id="middle"]/div[1]/div[1]/h2/a'` → `#middle > div:first-child > div:first-child > h2 > a`
  - 현재가: `//*[@id="chart_area"]//p[contains(@class,"no_today")]/em/span[contains(@class,"blind")]` → `#chart_area p.no_today em span.blind`
  - 배당: `//*[@id="_dvr"]` → `#_dvr`
  - 재무지표 표: `//*[@id="content"]/div[5]/div[1]/table/tbody/tr[N]/td[M]` → `#content div:nth-of-type(5) > div:first-child > table > tbody > tr:nth-of-type(N) > td:nth-of-type(M)`
  - tr 인덱스: 10=EPS, 12=BPS, 13=PBR (원본 그대로).
  - 자사주: `//tr[contains(., '자사주')]/td[2]` 등 → cheerio에서 `tr` 순회하며 텍스트로 필터.
- 숫자 정규화: `,` 제거, `−` → `-`, 정수/실수 자동 판정 — 원본 `extract()` 동일.

### 계산기 (`lib/stocks/intrinsic-value.ts`)

원본 `calculate_intrinsic_value()` 그대로:

```
periods = ["3년전", "2년전", "직전년도"]   // 인덱스 [0], [1], [2]
가중EPS = (EPS[2] × 3 + EPS[1] × 2 + EPS[0] × 1) / 6
기본 내재가치 = (가중EPS × 10 + 최근BPS) / 2          // 최근BPS = BPS[2]
자사주 조정: ratio > 0 일 때 내재가치 × (100 / (100 - ratio))
안전마진 = ((내재가치 - 현재가) / 현재가) × 100
```

EPS 또는 BPS가 모두 NaN/null이면 내재가치는 null. EPS 3개가 모두 채워지지 않으면 null. 자사주 ratio가 0이거나 없으면 조정하지 않음.

### Worker (`worker/index.ts`)

원본 `background_update()`를 그대로 이식:

```typescript
async function backgroundUpdate() {
  while (!shuttingDown) {
    try {
      await loadKrxStocks()           // krx_stocks.json → StockMaster upsert (1일 캐시)
      await analyzeAllStocks()        // 1시간 내 갱신된 종목 스킵
      await calculateNcavScreening()  // 24시간 내 분석된 종목 스킵
    } catch (e) {
      console.error('[worker]', e)
    }
    await sleep(120_000)              // 2분
  }
}

process.on('SIGINT',  () => { shuttingDown = true })
process.on('SIGTERM', () => { shuttingDown = true })

backgroundUpdate()
```

`analyzeAllStocks`:
- `StockMaster` 전체 조회 → `lastUpdated` 기준 오래된 순 정렬 (원본 동일)
- 각 종목 순회, `StockAnalysis.lastUpdated`가 1시간 이내면 스킵
- 10개마다 batch commit (Prisma transaction), 100개마다 진행 로그
- 종목별 에러는 catch 후 다음 종목으로 진행 (원본 동일)
- 분석 결과 timestamp는 KST로 저장 (원본 `pytz.timezone("Asia/Seoul")` 동일)

`calculateNcavScreening`:
- DART corp_code 매핑은 워커 시작 시 1회만 다운로드 (메모리 캐시).
- `StockMaster` 중 `corpCode != null` 종목만 대상.
- `NcavResult.lastUpdated`가 24시간 이내면 스킵.
- `getLatestFinancial(corpCode)` — 사업연도 결정: 현재 4월 이후면 전년도, 그 외 2년 전. 최대 3년 전까지 시도. 연결재무제표 우선, 없으면 별도재무제표 (원본 동일).
- 50개마다 batch commit.

### Server Actions (`src/actions/`)

```typescript
// stocks.ts
'use server'
export async function searchStocks(keyword: string): Promise<StockListItem[]>
export async function getTopStocks(opts: { limit?: number; dividend?: number }): Promise<TopStockRow[]>
export async function analyzeStockOnDemand(code: string): Promise<StockAnalysisResult>

// ncav.ts
'use server'
export async function getNcavStocks(opts: { positive?: boolean; limit?: number; dividend?: number }): Promise<NcavRow[]>

// watchlist.ts
'use server'
export async function exportWatchlistExcel(codes: string[], opts: { sheetName: string; filename: string }): Promise<{ blob: Uint8Array; filename: string }>
```

`exportWatchlistExcel`은 `xlsx` 패키지로 워크북 생성 → `Uint8Array` 반환. 클라이언트에서 `Blob`/`URL.createObjectURL` 통해 다운로드 트리거.

### 종목 검색 동작 (원본과 동등성 유지)

원본 `/search`는 분석 결과 캐시(`all_safety_margin_results.json`)에서 종목명 부분일치로 검색한다. 즉, **워커가 한 번도 분석하지 않은 종목은 검색 결과에 안 나온다**. 이식판도 같은 동작:

- `searchStocks(keyword)` → `StockAnalysis` 테이블에서 이름 LIKE 검색 (최대 20개).
- 워커 미실행 환경에서도 사용자가 직접 `analyzeStockOnDemand(code)`를 호출할 수 있도록, 결과 카드의 "지금 분석" 버튼을 통해 `StockMaster` 테이블에서 종목코드로 직접 분석 가능.
- 검색창 placeholder에 "종목코드(6자리)도 입력 가능" 안내 — 6자리 숫자 입력 시 `StockMaster`로 직접 fallback 검색 추가 (원본에는 없는 사소한 개선).

### 우선주 → 보통주 NCAV 매핑

원본 `/filter` 응답에서 우선주(`code[-1] != '0'`) 종목의 NCAV 비율이 없으면 보통주(`code[:-1] + '0'`)의 NCAV로 매핑한다. 이식판도 동일하게 `getTopStocks` 쿼리에서 처리.

## 7. 햄버거 메뉴 통합

`apps/company-map/src/components/layout/AppMenu.tsx` 변경.

- 기존 `SERVICES` 배열 (외부 서비스 = 다른 포트의 별도 앱) 변경 없음.
- 같은 앱 내부 라우트는 새로운 `TOOLS` 섹션으로 분리해서 노출:

```typescript
const TOOLS = [
  { key: 'calculator',  name: '내재가치 계산기',  description: '종목 검색 및 안전마진 계산', path: '/calculator', icon: Calculator },
  { key: 'top-stocks',  name: '안전마진 상위종목', description: '상위 N개 종목 + 배당 필터',   path: '/top-stocks', icon: TrendingUp },
  { key: 'ncav',        name: 'NCAV 스크리닝',     description: '청산가치 > 시가총액 종목',     path: '/ncav',       icon: Filter },
]
```

햄버거 패널 본문: 기존 "서비스" 섹션 유지 + 그 아래 "도구" 섹션 추가. 내부 라우트는 `next/link`의 `<Link>`로 SPA 네비게이션. 활성 라우트는 `usePathname()` 비교.

## 8. 시드 / 마이그레이션

### Prisma 마이그레이션
```
yarn workspace company-map prisma migrate dev --name add_stock_calculator
```
3개 테이블 생성: `stock_masters`, `stock_analyses`, `ncav_results`.

### 시드 파일
- `apps/company-map/src/data/krx_stocks.json` — 원본 repo `main` 브랜치에서 그대로 다운로드.
- `apps/company-map/src/data/investment_quotes.json` — 원본 repo `main` 브랜치에서 그대로 다운로드.

워커 첫 실행 시 `loadKrxStocks()`가 JSON을 읽어 `StockMaster`에 upsert. 이후 1일 단위로 갱신 시도(원본 동일하게)하지만, Node 환경에서 KRX 자동 갱신은 미지원 — 시드 JSON 갱신은 수동 작업으로 둔다(별도 npm script `update-krx-seed`로 manage).

격언 데이터는 SSR/server action에서 `import quotes from '@/data/investment_quotes.json'`으로 직접 로드.

### 환경 변수 (`apps/company-map/.env.local`)
- `DATABASE_URL="file:./company-map.db"` (기존)
- `DART_API_KEY=...` (사용자가 추가 완료)

### 의존성 추가
```
yarn workspace company-map add cheerio xlsx
yarn workspace company-map add -D tsx
```

### npm scripts 추가 (`apps/company-map/package.json`)
```
"worker": "tsx worker/index.ts"
```

## 9. 검증 / 테스트 전략

- **단위 테스트**: `lib/stocks/intrinsic-value.ts` — 원본 docstring 예시(EPS=[1000, 1500, 2000], BPS=[…], 자사주 5%)를 fixture로 만들고 결과값 일치 확인.
- **단위 테스트**: `lib/stocks/naver-scraper.ts` — 실제 네이버 페이지 HTML을 fixture로 저장하고 파싱 결과 검증 (테스트 시 네트워크 호출 X).
- **단위 테스트**: `lib/dart/financial.ts` — DART API 응답 mock으로 연결재무제표 우선 + 별도재무제표 fallback + 3년 사업연도 fallback 동작 검증.
- **통합 검증** (수동): 실제 종목 2개로 end-to-end 작동 확인:
  - `005930` (삼성전자, 자사주 보유, 배당 있음)
  - `000660` (SK하이닉스, 자사주 비율 변동 검증)
  - 결과를 원본 Flask 앱(직접 띄워서)과 비교하여 ±1% 이내 일치 확인.
- **워커 검증** (수동): `yarn workspace company-map worker` 실행 후 5분 이내에 ≥10개 종목 분석 완료, `StockAnalysis` 테이블에 KST 타임스탬프로 데이터 적재되는지 확인. `Ctrl+C` 시 graceful shutdown 확인.

## 10. 알려진 차이점 / 트레이드오프

1. **KRX 종목 마스터 자동 갱신 없음** — 원본은 `FinanceDataReader`로 매일 갱신 시도. 이식판은 시드 JSON 수동 갱신. 향후 KRX OpenAPI 또는 다른 데이터 소스로 자동화 가능.
2. **워커는 별도 프로세스** — 원본은 Flask 앱과 같은 프로세스의 thread. 이식판은 분리. 사용자가 `/top-stocks`/`/ncav`를 사용하려면 별도 터미널에서 워커를 띄워야 함.
3. **Supabase 백업 없음** — 원본의 fallback 메커니즘(로컬 파일 없으면 Supabase에서 다운로드)은 미이식. SQLite 파일이 곧 단일 진실 원천.
4. **PWA / SEO 메타 없음** — MVP 범위 외.
5. **investment_quotes**는 5개로 작음 — 원본 그대로.

## 11. 작업 추정

- 데이터 모델 / 마이그레이션 / 시드 — S
- Naver scraper + 계산기 + 단위 테스트 — M
- DART corp_code / financial / NCAV — M
- 워커 무한 루프 + 종료 시그널 — S
- 페이지 3개 + 컴포넌트 — M
- 햄버거 메뉴 / Header 네비 / 격언 — S
- 엑셀 export — S
- 통합 검증 / 실제 종목 비교 — M

총: ~M-L (며칠 단위 단일 작업으로 가능).
