# Intrinsic Value Calculator Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Flask-based intrinsic value calculator (spaceromany/intrinsic-value-calculator) into `apps/company-map` as three new pages (`/calculator`, `/top-stocks`, `/ncav`) plus a separate Node worker that mirrors the original Python `background_update()` thread.

**Architecture:** Next.js 16 App Router pages + server actions for HTTP request handlers, a separate `worker/` Node process for the 2-minute background analysis loop, Prisma + SQLite for persistence (replaces the original JSON file caches), `cheerio` for Naver scraping, native `fetch` for DART OpenAPI, `xlsx` for Excel export. The hamburger menu (`AppMenu.tsx`) gets a new "도구" section pointing at the three new internal routes.

**Tech Stack:** Next.js 16, React 19, Prisma 6.1, SQLite, TypeScript, Tailwind v4, Lucide React, cheerio, xlsx, vitest (new), tsx (new).

**Spec:** [docs/superpowers/specs/2026-05-05-intrinsic-value-calculator-port-design.md](../specs/2026-05-05-intrinsic-value-calculator-port-design.md)

---

## File Structure

### New files

```
apps/company-map/
├── prisma/migrations/<timestamp>_add_stock_calculator/migration.sql   # generated
├── src/
│   ├── app/
│   │   ├── calculator/page.tsx
│   │   ├── top-stocks/page.tsx
│   │   └── ncav/page.tsx
│   ├── actions/
│   │   ├── stocks.ts
│   │   ├── ncav.ts
│   │   └── watchlist.ts
│   ├── lib/
│   │   ├── stocks/
│   │   │   ├── intrinsic-value.ts
│   │   │   ├── intrinsic-value.test.ts
│   │   │   ├── naver-scraper.ts
│   │   │   ├── naver-scraper.test.ts
│   │   │   ├── analyze-stock.ts
│   │   │   └── analyze-all.ts
│   │   ├── dart/
│   │   │   ├── corp-code.ts
│   │   │   ├── financial.ts
│   │   │   ├── financial.test.ts
│   │   │   └── ncav.ts
│   │   └── serialization.ts                  # BigInt → string helper
│   ├── components/stocks/
│   │   ├── QuoteBanner.tsx
│   │   ├── StockSearch.tsx
│   │   ├── StockResultCard.tsx
│   │   ├── TopStocksTable.tsx
│   │   ├── NcavTable.tsx
│   │   └── WatchlistPanel.tsx
│   ├── data/
│   │   ├── krx_stocks.json                   # downloaded from upstream
│   │   └── investment_quotes.json            # downloaded from upstream
│   └── types/stocks.ts
├── worker/
│   ├── index.ts
│   ├── load-krx.ts
│   ├── analyze-loop.ts
│   └── ncav-loop.ts
├── tests/fixtures/
│   ├── naver-main-005930.html                # captured for parser tests
│   ├── naver-wisereport-005930.html
│   └── dart-fnltt-sample.json
└── vitest.config.ts
```

### Modified files

- `apps/company-map/package.json` — add deps + `worker` script
- `apps/company-map/prisma/schema.prisma` — add 3 models
- `apps/company-map/src/components/layout/AppMenu.tsx` — add `TOOLS` section
- `apps/company-map/src/components/layout/Header.tsx` — add nav links
- `apps/company-map/.env.local` — `DART_API_KEY` (already added by user)
- `apps/company-map/.gitignore` — exclude DB if needed (already excluded)

---

## Task 1: Install dependencies

**Files:**
- Modify: `apps/company-map/package.json`

- [ ] **Step 1: Add runtime + dev dependencies**

```bash
yarn workspace company-map add cheerio xlsx
yarn workspace company-map add -D tsx vitest @vitest/ui
```

- [ ] **Step 2: Verify package.json contains the new entries**

Run: `cat apps/company-map/package.json`
Expected: `cheerio`, `xlsx` in `dependencies`; `tsx`, `vitest`, `@vitest/ui` in `devDependencies`.

- [ ] **Step 3: Add scripts**

Edit `apps/company-map/package.json` `scripts` block to add:

```json
"worker": "tsx worker/index.ts",
"worker:once": "tsx worker/index.ts --once",
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/package.json yarn.lock
git commit -m "chore(company-map): add cheerio, xlsx, vitest, tsx for intrinsic-value port"
```

---

## Task 2: Add vitest config

**Files:**
- Create: `apps/company-map/vitest.config.ts`

- [ ] **Step 1: Create vitest config**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 2: Verify it runs (no tests yet)**

Run: `cd apps/company-map && yarn test`
Expected: `No test files found` and exit 0 (or vitest 1.0 may exit 1 with "no test files" — either is fine; we'll add tests in subsequent tasks).

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/vitest.config.ts
git commit -m "chore(company-map): add vitest config"
```

---

## Task 3: Add Prisma models

**Files:**
- Modify: `apps/company-map/prisma/schema.prisma`

- [ ] **Step 1: Append three models to schema.prisma**

Append after the existing `CompanyIndustry` model:

```prisma
model StockMaster {
  code      String   @id
  name      String
  marcap    BigInt?
  corpCode  String?  @map("corp_code")
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
  ncavRatio         Float?   @map("ncav_ratio")
  currentAssets     BigInt   @map("current_assets")
  totalLiabilities  BigInt   @map("total_liabilities")
  totalAssets       BigInt   @map("total_assets")
  totalEquity       BigInt   @map("total_equity")
  bsnsYear          Int      @map("bsns_year")
  ncavPositive      Boolean  @map("ncav_positive")
  lastUpdated       DateTime @map("last_updated")

  master  StockMaster @relation(fields: [code], references: [code], onDelete: Cascade)

  @@index([ncavRatio])
  @@index([ncavPositive])
  @@map("ncav_results")
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/company-map && yarn prisma migrate dev --name add_stock_calculator
```

Expected: migration file created at `prisma/migrations/<ts>_add_stock_calculator/migration.sql`, and tables `stock_masters`, `stock_analyses`, `ncav_results` exist in `company-map.db`.

- [ ] **Step 3: Verify with sqlite**

```bash
cd apps/company-map && sqlite3 prisma/company-map.db ".tables"
```

Expected: `_prisma_migrations  companies  company_industries  industries  ncav_results  stock_analyses  stock_masters`

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/prisma/schema.prisma apps/company-map/prisma/migrations
git commit -m "feat(company-map): add StockMaster, StockAnalysis, NcavResult models"
```

---

## Task 4: Add seed JSON files

**Files:**
- Create: `apps/company-map/src/data/krx_stocks.json`
- Create: `apps/company-map/src/data/investment_quotes.json`

- [ ] **Step 1: Download seed files from upstream**

```bash
mkdir -p apps/company-map/src/data
curl -sL https://raw.githubusercontent.com/spaceromany/intrinsic-value-calculator/main/krx_stocks.json -o apps/company-map/src/data/krx_stocks.json
curl -sL https://raw.githubusercontent.com/spaceromany/intrinsic-value-calculator/main/investment_quotes.json -o apps/company-map/src/data/investment_quotes.json
```

- [ ] **Step 2: Verify file sizes are reasonable**

Run: `wc -c apps/company-map/src/data/*.json`
Expected: `krx_stocks.json` ≈ 200KB, `investment_quotes.json` ≈ 1.5KB.

- [ ] **Step 3: Verify shape**

```bash
head -c 200 apps/company-map/src/data/krx_stocks.json
head -c 500 apps/company-map/src/data/investment_quotes.json
```

Expected: krx_stocks.json starts with `[{"Code":"...","Name":"...","Marcap":...},`; investment_quotes.json has `{"quotes":[{"quote":...}]}`.

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/src/data
git commit -m "chore(company-map): add krx_stocks and investment_quotes seed data"
```

---

## Task 5: Add types module

**Files:**
- Create: `apps/company-map/src/types/stocks.ts`

- [ ] **Step 1: Create the types**

```typescript
export interface KrxStockSeed {
  Code: string;
  Name: string;
  Marcap: number;
}

export interface InvestmentQuote {
  quote: string;
  author: string;
  source: string;
  original: string;
}

export interface StockMasterRow {
  code: string;
  name: string;
  marcap: number | null;
  corpCode: string | null;
}

export interface FinancialPeriod {
  PBR: number | null;
  EPS: number | null;
  BPS: number | null;
}

export interface TreasuryStockInfo {
  shares: number;
  ratio: number;
}

export interface AnalyzeStockResult {
  stockName: string;
  currentPrice: number | null;
  intrinsicValue: number | null;
  safetyMargin: number | null;
  treasuryShares: number;
  treasuryRatio: number;
  dividendYield: number | null;
  historicalData: {
    "3년전": FinancialPeriod;
    "2년전": FinancialPeriod;
    "직전년도": FinancialPeriod;
  };
}

export interface TopStockRow {
  code: string;
  name: string;
  currentPrice: number | null;
  intrinsicValue: number | null;
  safetyMargin: number | null;
  treasuryRatio: number | null;
  dividendYield: number | null;
  lastUpdated: string;
  ncavRatio: number | null;
}

export interface NcavRow {
  code: string;
  name: string;
  ncav: string;            // BigInt → string
  marcap: string;
  ncavRatio: number | null;
  currentAssets: string;
  totalLiabilities: string;
  totalAssets: string;
  totalEquity: string;
  bsnsYear: number;
  ncavPositive: boolean;
  dividendYield: number | null;
  lastUpdated: string;
}

export interface DartFinancialResult {
  bsnsYear: number;
  currentAssets: bigint;
  totalLiabilities: bigint;
  totalAssets: bigint;
  totalEquity: bigint;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/company-map/src/types/stocks.ts
git commit -m "feat(company-map): add stock-related TypeScript types"
```

---

## Task 6: Implement intrinsic-value calculator (TDD)

**Files:**
- Create: `apps/company-map/src/lib/stocks/intrinsic-value.test.ts`
- Create: `apps/company-map/src/lib/stocks/intrinsic-value.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/company-map/src/lib/stocks/intrinsic-value.test.ts
import { describe, it, expect } from "vitest";
import {
  calculateWeightedEps,
  calculateIntrinsicValue,
  calculateSafetyMargin,
} from "./intrinsic-value";

describe("calculateWeightedEps", () => {
  it("returns weighted average with descending weights (직전 ×3, 전년 ×2, 전전 ×1) / 6", () => {
    // periods order: [3년전, 2년전, 직전년도]
    expect(calculateWeightedEps([1000, 1500, 2000])).toBeCloseTo(
      (2000 * 3 + 1500 * 2 + 1000 * 1) / 6
    );
  });

  it("returns null when EPS array is not exactly 3 values", () => {
    expect(calculateWeightedEps([1000, 2000])).toBeNull();
    expect(calculateWeightedEps([])).toBeNull();
  });

  it("returns null when any value is null/NaN", () => {
    expect(calculateWeightedEps([1000, null, 2000])).toBeNull();
    expect(calculateWeightedEps([1000, NaN, 2000])).toBeNull();
  });
});

describe("calculateIntrinsicValue", () => {
  it("returns (weightedEps × 10 + latestBps) / 2 without treasury adjustment when ratio = 0", () => {
    const eps = [1000, 1500, 2000];
    const bps = 30000;
    const weighted = (2000 * 3 + 1500 * 2 + 1000 * 1) / 6;
    expect(calculateIntrinsicValue(eps, bps, { shares: 0, ratio: 0 })).toBeCloseTo(
      (weighted * 10 + bps) / 2
    );
  });

  it("multiplies by 100/(100-ratio) when treasury ratio > 0", () => {
    const eps = [1000, 1500, 2000];
    const bps = 30000;
    const ratio = 5;
    const weighted = (2000 * 3 + 1500 * 2 + 1000 * 1) / 6;
    const base = (weighted * 10 + bps) / 2;
    expect(calculateIntrinsicValue(eps, bps, { shares: 1000, ratio })).toBeCloseTo(
      base * (100 / (100 - ratio))
    );
  });

  it("returns null when EPS or BPS is missing", () => {
    expect(calculateIntrinsicValue([null, null, null], 30000, { shares: 0, ratio: 0 })).toBeNull();
    expect(calculateIntrinsicValue([1000, 1500, 2000], null, { shares: 0, ratio: 0 })).toBeNull();
  });
});

describe("calculateSafetyMargin", () => {
  it("returns ((intrinsic - current) / current) × 100", () => {
    expect(calculateSafetyMargin(15000, 10000)).toBeCloseTo(50);
    expect(calculateSafetyMargin(8000, 10000)).toBeCloseTo(-20);
  });

  it("returns null when current price is 0 or null", () => {
    expect(calculateSafetyMargin(15000, 0)).toBeNull();
    expect(calculateSafetyMargin(15000, null)).toBeNull();
    expect(calculateSafetyMargin(null, 10000)).toBeNull();
  });
});
```

- [ ] **Step 2: Verify tests fail**

```bash
cd apps/company-map && yarn test src/lib/stocks/intrinsic-value.test.ts
```

Expected: all tests fail with `Cannot find module './intrinsic-value'`.

- [ ] **Step 3: Implement**

```typescript
// apps/company-map/src/lib/stocks/intrinsic-value.ts
import type { TreasuryStockInfo } from "@/types/stocks";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * 가중 EPS = (직전년도 × 3 + 전년도 × 2 + 전전년도 × 1) / 6
 * 입력 배열 인덱스 순서: [0]=3년전, [1]=2년전, [2]=직전년도 (원본 periods 순서)
 */
export function calculateWeightedEps(eps: Array<number | null>): number | null {
  if (eps.length !== 3) return null;
  if (!eps.every(isFiniteNumber)) return null;
  const [threeYearsAgo, twoYearsAgo, latest] = eps as number[];
  return (latest * 3 + twoYearsAgo * 2 + threeYearsAgo * 1) / 6;
}

export function calculateIntrinsicValue(
  eps: Array<number | null>,
  latestBps: number | null,
  treasury: TreasuryStockInfo
): number | null {
  if (!isFiniteNumber(latestBps)) return null;
  const weighted = calculateWeightedEps(eps);
  if (weighted === null) return null;
  let value = (weighted * 10 + latestBps) / 2;
  if (treasury.ratio > 0) {
    value = value * (100 / (100 - treasury.ratio));
  }
  return value;
}

export function calculateSafetyMargin(
  intrinsicValue: number | null,
  currentPrice: number | null
): number | null {
  if (!isFiniteNumber(intrinsicValue)) return null;
  if (!isFiniteNumber(currentPrice) || currentPrice === 0) return null;
  return ((intrinsicValue - currentPrice) / currentPrice) * 100;
}
```

- [ ] **Step 4: Verify tests pass**

```bash
cd apps/company-map && yarn test src/lib/stocks/intrinsic-value.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/lib/stocks/intrinsic-value.ts apps/company-map/src/lib/stocks/intrinsic-value.test.ts
git commit -m "feat(company-map): add intrinsic-value calculator with tests"
```

---

## Task 7: Capture Naver fixture HTML

**Files:**
- Create: `apps/company-map/tests/fixtures/naver-main-005930.html`
- Create: `apps/company-map/tests/fixtures/naver-wisereport-005930.html`

- [ ] **Step 1: Download fixtures**

```bash
mkdir -p apps/company-map/tests/fixtures
curl -sL -A "Mozilla/5.0" \
  "https://finance.naver.com/item/main.naver?code=005930" \
  -o apps/company-map/tests/fixtures/naver-main-005930.html

curl -sL -A "Mozilla/5.0" -e "https://finance.naver.com" \
  "https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=005930" \
  -o apps/company-map/tests/fixtures/naver-wisereport-005930.html
```

- [ ] **Step 2: Verify fixtures contain expected content**

```bash
grep -c "삼성전자" apps/company-map/tests/fixtures/naver-main-005930.html
grep -c "EPS" apps/company-map/tests/fixtures/naver-main-005930.html
grep -c "자사주" apps/company-map/tests/fixtures/naver-wisereport-005930.html
```

Expected: each grep returns a non-zero count. If wisereport returns 0 for "자사주", investigate (some samples have it under "자기주식" — fall back to that string in the parser).

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/tests/fixtures
git commit -m "test(company-map): add naver finance fixture HTML for 005930"
```

---

## Task 8: Implement Naver scraper (TDD with fixtures)

**Files:**
- Create: `apps/company-map/src/lib/stocks/naver-scraper.test.ts`
- Create: `apps/company-map/src/lib/stocks/naver-scraper.ts`

- [ ] **Step 1: Write failing tests using fixtures**

```typescript
// apps/company-map/src/lib/stocks/naver-scraper.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseNaverMain, parseTreasuryStock } from "./naver-scraper";

const fixturesDir = path.resolve(__dirname, "../../../tests/fixtures");

const mainHtml = readFileSync(path.join(fixturesDir, "naver-main-005930.html"), "utf-8");
const wiseHtml = readFileSync(path.join(fixturesDir, "naver-wisereport-005930.html"), "utf-8");

describe("parseNaverMain", () => {
  it("extracts the stock name as 삼성전자", () => {
    const result = parseNaverMain(mainHtml);
    expect(result.stockName).toBe("삼성전자");
  });

  it("extracts a positive current price", () => {
    const result = parseNaverMain(mainHtml);
    expect(result.currentPrice).not.toBeNull();
    expect(result.currentPrice!).toBeGreaterThan(0);
  });

  it("extracts EPS, BPS, PBR arrays of length 3 (numbers or null)", () => {
    const { historicalData } = parseNaverMain(mainHtml);
    for (const period of ["3년전", "2년전", "직전년도"] as const) {
      expect(historicalData[period]).toBeDefined();
      expect(["number", "object"]).toContain(typeof historicalData[period].EPS); // number | null
    }
  });

  it("returns dividendYield as a finite number or null", () => {
    const { dividendYield } = parseNaverMain(mainHtml);
    expect(dividendYield === null || Number.isFinite(dividendYield)).toBe(true);
  });
});

describe("parseTreasuryStock", () => {
  it("returns shares and ratio as finite non-negative numbers", () => {
    const result = parseTreasuryStock(wiseHtml);
    expect(result.shares).toBeGreaterThanOrEqual(0);
    expect(result.ratio).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.shares)).toBe(true);
    expect(Number.isFinite(result.ratio)).toBe(true);
  });

  it("returns zeros when HTML has no 자사주 row", () => {
    const result = parseTreasuryStock("<html><body>nothing</body></html>");
    expect(result).toEqual({ shares: 0, ratio: 0 });
  });
});
```

- [ ] **Step 2: Verify tests fail**

```bash
cd apps/company-map && yarn test src/lib/stocks/naver-scraper.test.ts
```

Expected: all tests fail with `Cannot find module './naver-scraper'`.

- [ ] **Step 3: Implement parser**

```typescript
// apps/company-map/src/lib/stocks/naver-scraper.ts
import * as cheerio from "cheerio";
import type {
  AnalyzeStockResult,
  FinancialPeriod,
  TreasuryStockInfo,
} from "@/types/stocks";

/** "1,234.5" → 1234.5; "−1,000" → -1000; non-numeric → null. */
function parseNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").replace(/−/g, "-").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "N/A") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseNaverMain(
  html: string
): Pick<AnalyzeStockResult, "stockName" | "currentPrice" | "dividendYield" | "historicalData"> {
  const $ = cheerio.load(html);

  const stockName = $("#middle h2 a").first().text().trim() || "Unknown";
  const currentPrice = parseNumber($("#chart_area p.no_today em .blind").first().text());

  const dvrText = $("#_dvr").first().text().trim().replace("%", "");
  const dividendYield = dvrText && dvrText !== "N/A" ? parseNumber(dvrText) : null;

  // 재무지표 표: #content > div:nth-of-type(5) > div:first-child > table > tbody > tr[N] > td[M]
  // tr 인덱스: 10=EPS, 12=BPS, 13=PBR (원본 동일)
  const tableRows = $("#content > div:nth-of-type(5) > div:first-child > table tbody > tr");

  const cellAt = (rowIdx: number, colIdx: number): number | null => {
    const row = tableRows.eq(rowIdx - 1);
    if (!row.length) return null;
    const td = row.find("td").eq(colIdx - 1);
    if (!td.length) return null;
    return parseNumber(td.text());
  };

  const periods = ["3년전", "2년전", "직전년도"] as const;
  const historicalData = {} as AnalyzeStockResult["historicalData"];
  for (let i = 0; i < 3; i++) {
    const period = periods[i];
    const col = i + 1;
    historicalData[period] = {
      PBR: cellAt(13, col),
      EPS: cellAt(10, col),
      BPS: cellAt(12, col),
    } satisfies FinancialPeriod;
  }

  return { stockName, currentPrice, dividendYield, historicalData };
}

export function parseTreasuryStock(html: string): TreasuryStockInfo {
  const $ = cheerio.load(html);
  let shares = 0;
  let ratio = 0;
  $("tr").each((_, tr) => {
    const text = $(tr).text();
    if (text.includes("자사주") || text.includes("자기주식")) {
      const tds = $(tr).find("td");
      const sharesParsed = parseNumber(tds.eq(1).text());
      const ratioParsed = parseNumber(tds.eq(2).text().replace("%", ""));
      if (sharesParsed !== null) shares = sharesParsed;
      if (ratioParsed !== null) ratio = ratioParsed;
      return false; // break on first match
    }
  });
  return { shares, ratio };
}

const FETCH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNaverMain(ticker: string): Promise<string> {
  const url = `https://finance.naver.com/item/main.naver?code=${ticker}`;
  const resp = await fetchWithTimeout(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!resp.ok) throw new Error(`Naver main fetch failed: ${resp.status}`);
  return await resp.text();
}

export async function fetchWisereport(ticker: string): Promise<string> {
  const url = `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${ticker}`;
  const resp = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://finance.naver.com",
    },
  });
  if (!resp.ok) throw new Error(`Wisereport fetch failed: ${resp.status}`);
  return await resp.text();
}
```

- [ ] **Step 4: Verify tests pass**

```bash
cd apps/company-map && yarn test src/lib/stocks/naver-scraper.test.ts
```

Expected: all tests pass. If `parseNaverMain` returns null for current price, inspect the fixture HTML and adjust the selector — Naver occasionally changes class names.

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/lib/stocks/naver-scraper.ts apps/company-map/src/lib/stocks/naver-scraper.test.ts
git commit -m "feat(company-map): add naver finance scraper with fixture-based tests"
```

---

## Task 9: Implement analyze-stock orchestrator

**Files:**
- Create: `apps/company-map/src/lib/stocks/analyze-stock.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/company-map/src/lib/stocks/analyze-stock.ts
import { fetchNaverMain, fetchWisereport, parseNaverMain, parseTreasuryStock } from "./naver-scraper";
import { calculateIntrinsicValue, calculateSafetyMargin } from "./intrinsic-value";
import type { AnalyzeStockResult } from "@/types/stocks";

export async function analyzeStock(ticker: string): Promise<AnalyzeStockResult> {
  const [mainHtml, wiseHtml] = await Promise.all([
    fetchNaverMain(ticker),
    fetchWisereport(ticker),
  ]);

  const main = parseNaverMain(mainHtml);
  const treasury = parseTreasuryStock(wiseHtml);

  // EPS / BPS arrays in periods order: [3년전, 2년전, 직전년도]
  const epsArr = (["3년전", "2년전", "직전년도"] as const).map(
    (p) => main.historicalData[p].EPS
  );
  const latestBps = main.historicalData["직전년도"].BPS;

  const intrinsicValue = calculateIntrinsicValue(epsArr, latestBps, treasury);
  const safetyMargin = calculateSafetyMargin(intrinsicValue, main.currentPrice);

  return {
    stockName: main.stockName,
    currentPrice: main.currentPrice,
    intrinsicValue,
    safetyMargin,
    treasuryShares: treasury.shares,
    treasuryRatio: treasury.ratio,
    dividendYield: main.dividendYield,
    historicalData: main.historicalData,
  };
}
```

- [ ] **Step 2: Manual smoke test (optional, requires network)**

```bash
cd apps/company-map && yarn tsx -e "import('./src/lib/stocks/analyze-stock.ts').then(m => m.analyzeStock('005930')).then(r => console.log(JSON.stringify(r, null, 2)))"
```

Expected: outputs an object with non-null `currentPrice` and a numeric `intrinsicValue` and `safetyMargin`. If it fails with TLS or DNS errors, skip — workers will surface this anyway.

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/src/lib/stocks/analyze-stock.ts
git commit -m "feat(company-map): add analyzeStock orchestrator combining scraper + calculator"
```

---

## Task 10: Add BigInt serialization helper

**Files:**
- Create: `apps/company-map/src/lib/serialization.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/company-map/src/lib/serialization.ts
/** Convert BigInt fields to string for safe serialization to React server components. */
export function bigintToString<T extends Record<string, unknown>>(row: T): {
  [K in keyof T]: T[K] extends bigint ? string : T[K] extends bigint | null ? string | null : T[K]
} {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "bigint" ? v.toString() : v;
  }
  return out as never;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/company-map/src/lib/serialization.ts
git commit -m "feat(company-map): add bigint serialization helper"
```

---

## Task 11: Implement DART corp_code loader

**Files:**
- Create: `apps/company-map/src/lib/dart/corp-code.ts`

- [ ] **Step 1: Install zip + xml dependency**

```bash
yarn workspace company-map add adm-zip fast-xml-parser
yarn workspace company-map add -D @types/adm-zip
```

- [ ] **Step 2: Implement**

```typescript
// apps/company-map/src/lib/dart/corp-code.ts
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const DART_API_KEY = process.env.DART_API_KEY;

let cachedMap: Map<string, string> | null = null;

/**
 * 종목코드 → corp_code 매핑을 DART에서 1회 다운로드해 메모리에 캐싱.
 * 워커 1회 실행당 1번만 호출.
 */
export async function loadCorpCodeMap(): Promise<Map<string, string>> {
  if (cachedMap) return cachedMap;
  if (!DART_API_KEY) throw new Error("DART_API_KEY not set");

  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${DART_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`DART corpCode fetch failed: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());

  const zip = new AdmZip(buffer);
  const entry = zip.getEntries()[0];
  const xml = entry.getData().toString("utf-8");

  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const parsed = parser.parse(xml);
  const list: Array<{ stock_code?: string; corp_code?: string }> =
    parsed?.result?.list ?? [];

  const map = new Map<string, string>();
  for (const item of list) {
    const stock = (item.stock_code ?? "").trim();
    const corp = (item.corp_code ?? "").trim();
    if (stock && corp) map.set(stock, corp);
  }
  cachedMap = map;
  console.log(`[dart] corp_code map loaded: ${map.size} listed companies`);
  return map;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/src/lib/dart/corp-code.ts apps/company-map/package.json yarn.lock
git commit -m "feat(company-map): add DART corp_code loader"
```

---

## Task 12: Implement DART financial fetch (TDD)

**Files:**
- Create: `apps/company-map/tests/fixtures/dart-fnltt-sample.json`
- Create: `apps/company-map/src/lib/dart/financial.test.ts`
- Create: `apps/company-map/src/lib/dart/financial.ts`

- [ ] **Step 1: Build a representative DART response fixture**

Save this content to `apps/company-map/tests/fixtures/dart-fnltt-sample.json`:

```json
{
  "status": "000",
  "message": "정상",
  "list": [
    {"sj_nm": "재무상태표", "fs_nm": "연결재무제표", "account_nm": "유동자산",   "thstrm_amount": "100,000,000,000"},
    {"sj_nm": "재무상태표", "fs_nm": "연결재무제표", "account_nm": "부채총계",   "thstrm_amount": "30,000,000,000"},
    {"sj_nm": "재무상태표", "fs_nm": "연결재무제표", "account_nm": "자산총계",   "thstrm_amount": "200,000,000,000"},
    {"sj_nm": "재무상태표", "fs_nm": "연결재무제표", "account_nm": "자본총계",   "thstrm_amount": "170,000,000,000"},
    {"sj_nm": "재무상태표", "fs_nm": "재무제표",     "account_nm": "유동자산",   "thstrm_amount": "50,000,000,000"},
    {"sj_nm": "재무상태표", "fs_nm": "재무제표",     "account_nm": "부채총계",   "thstrm_amount": "20,000,000,000"}
  ]
}
```

- [ ] **Step 2: Write failing tests**

```typescript
// apps/company-map/src/lib/dart/financial.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractBalanceSheet } from "./financial";

const fixture = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../tests/fixtures/dart-fnltt-sample.json"), "utf-8")
);

describe("extractBalanceSheet", () => {
  it("prefers 연결재무제표 over 재무제표", () => {
    const result = extractBalanceSheet(fixture);
    expect(result).not.toBeNull();
    expect(result!.currentAssets).toBe(100_000_000_000n);
    expect(result!.totalLiabilities).toBe(30_000_000_000n);
    expect(result!.totalAssets).toBe(200_000_000_000n);
    expect(result!.totalEquity).toBe(170_000_000_000n);
  });

  it("falls back to 재무제표 when 연결 is absent", () => {
    const onlyStandalone = {
      status: "000",
      list: fixture.list.filter((x: { fs_nm: string }) => x.fs_nm === "재무제표"),
    };
    const result = extractBalanceSheet(onlyStandalone);
    expect(result).not.toBeNull();
    expect(result!.currentAssets).toBe(50_000_000_000n);
    expect(result!.totalLiabilities).toBe(20_000_000_000n);
  });

  it("returns null when 유동자산 or 부채총계 is missing", () => {
    const incomplete = {
      status: "000",
      list: [
        { sj_nm: "재무상태표", fs_nm: "연결재무제표", account_nm: "자산총계", thstrm_amount: "1,000" },
      ],
    };
    expect(extractBalanceSheet(incomplete)).toBeNull();
  });

  it("returns null when DART status != '000'", () => {
    expect(extractBalanceSheet({ status: "013", message: "조회된 데이타가 없습니다", list: [] })).toBeNull();
  });
});
```

- [ ] **Step 3: Verify tests fail**

```bash
cd apps/company-map && yarn test src/lib/dart/financial.test.ts
```

Expected: tests fail with module not found.

- [ ] **Step 4: Implement**

```typescript
// apps/company-map/src/lib/dart/financial.ts
import type { DartFinancialResult } from "@/types/stocks";

const DART_API_KEY = process.env.DART_API_KEY;

interface DartListItem {
  sj_nm?: string;
  fs_nm?: string;
  account_nm?: string;
  thstrm_amount?: string;
}

interface DartResponse {
  status?: string;
  message?: string;
  list?: DartListItem[];
}

function parseAmount(raw: string | undefined): bigint | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

/**
 * 재무상태표에서 유동자산/부채총계/자산총계/자본총계 추출.
 * 연결재무제표 우선, 없으면 별도(재무제표) fallback.
 * 유동자산 또는 부채총계가 없으면 null.
 */
export function extractBalanceSheet(
  response: DartResponse
): Omit<DartFinancialResult, "bsnsYear"> | null {
  if (response.status !== "000") return null;

  const accounts = new Map<string, bigint>();
  for (const item of response.list ?? []) {
    if (item.sj_nm !== "재무상태표") continue;
    const amount = parseAmount(item.thstrm_amount);
    if (amount === null) continue;
    const key = `${item.fs_nm}_${item.account_nm}`;
    accounts.set(key, amount);
  }

  const pick = (account: string): bigint | null =>
    accounts.get(`연결재무제표_${account}`) ?? accounts.get(`재무제표_${account}`) ?? null;

  const currentAssets = pick("유동자산");
  const totalLiabilities = pick("부채총계");
  const totalAssets = pick("자산총계");
  const totalEquity = pick("자본총계");

  if (currentAssets === null || totalLiabilities === null) return null;

  return {
    currentAssets,
    totalLiabilities,
    totalAssets: totalAssets ?? 0n,
    totalEquity: totalEquity ?? 0n,
  };
}

export async function fetchDartFinancial(
  corpCode: string,
  bsnsYear: number,
  reprtCode = "11011"
): Promise<DartResponse | null> {
  if (!DART_API_KEY) throw new Error("DART_API_KEY not set");
  const url = new URL("https://opendart.fss.or.kr/api/fnlttSinglAcnt.json");
  url.searchParams.set("crtfc_key", DART_API_KEY);
  url.searchParams.set("corp_code", corpCode);
  url.searchParams.set("bsns_year", String(bsnsYear));
  url.searchParams.set("reprt_code", reprtCode);
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) return null;
    return (await resp.json()) as DartResponse;
  } catch (err) {
    console.warn(`[dart] financial fetch failed for corp=${corpCode}:`, err);
    return null;
  }
}

/**
 * 가장 최근 사업보고서를 찾아 재무상태표 추출.
 * 사업보고서는 보통 3월 말까지 공시 → 4월부터 전년도 사용 가능.
 * 최대 3년 전까지 fallback.
 */
export async function getLatestFinancial(
  corpCode: string,
  now: Date = new Date()
): Promise<DartFinancialResult | null> {
  const startYear = now.getMonth() >= 3 ? now.getFullYear() - 1 : now.getFullYear() - 2;
  for (let year = startYear; year > startYear - 3; year--) {
    const data = await fetchDartFinancial(corpCode, year);
    if (!data) continue;
    const bs = extractBalanceSheet(data);
    if (bs) return { bsnsYear: year, ...bs };
  }
  return null;
}
```

- [ ] **Step 5: Verify tests pass**

```bash
cd apps/company-map && yarn test src/lib/dart/financial.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/company-map/src/lib/dart apps/company-map/tests/fixtures/dart-fnltt-sample.json
git commit -m "feat(company-map): add DART financial fetch with balance-sheet extractor tests"
```

---

## Task 13: Implement NCAV screening loop

**Files:**
- Create: `apps/company-map/src/lib/dart/ncav.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/company-map/src/lib/dart/ncav.ts
import { db } from "@/lib/db";
import { loadCorpCodeMap } from "./corp-code";
import { getLatestFinancial } from "./financial";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** 24시간 내 분석된 종목은 스킵. corp_code가 있는 종목만 대상. */
export async function runNcavScreening(): Promise<{
  analyzed: number;
  skipped: number;
  ncavPositive: number;
}> {
  const corpMap = await loadCorpCodeMap();
  const masters = await db.stockMaster.findMany({
    select: { code: true, name: true, marcap: true, corpCode: true },
  });

  const now = Date.now();
  const existing = await db.ncavResult.findMany({ select: { code: true, lastUpdated: true } });
  const existingMap = new Map(existing.map((r) => [r.code, r.lastUpdated.getTime()]));

  let analyzed = 0;
  let skipped = 0;

  for (let i = 0; i < masters.length; i++) {
    const m = masters[i];
    const corpCode = m.corpCode ?? corpMap.get(m.code);
    if (!corpCode) continue;

    // Persist corp_code into master if it was missing (so subsequent loops are faster)
    if (!m.corpCode && corpCode) {
      await db.stockMaster.update({
        where: { code: m.code },
        data: { corpCode },
      });
    }

    const last = existingMap.get(m.code);
    if (last && now - last < TWENTY_FOUR_HOURS_MS) {
      skipped++;
      continue;
    }

    const fin = await getLatestFinancial(corpCode);
    if (!fin) continue;

    const marcap = m.marcap ?? 0n;
    const ncav = fin.currentAssets - fin.totalLiabilities;
    const ncavRatio = marcap > 0n ? Number((ncav * 10000n) / marcap) / 100 : null;
    const ncavPositive = ncav > marcap && marcap > 0n;

    await db.ncavResult.upsert({
      where: { code: m.code },
      create: {
        code: m.code,
        name: m.name,
        ncav,
        marcap,
        ncavRatio,
        currentAssets: fin.currentAssets,
        totalLiabilities: fin.totalLiabilities,
        totalAssets: fin.totalAssets,
        totalEquity: fin.totalEquity,
        bsnsYear: fin.bsnsYear,
        ncavPositive,
        lastUpdated: new Date(),
      },
      update: {
        name: m.name,
        ncav,
        marcap,
        ncavRatio,
        currentAssets: fin.currentAssets,
        totalLiabilities: fin.totalLiabilities,
        totalAssets: fin.totalAssets,
        totalEquity: fin.totalEquity,
        bsnsYear: fin.bsnsYear,
        ncavPositive,
        lastUpdated: new Date(),
      },
    });
    analyzed++;

    if ((i + 1) % 50 === 0) {
      console.log(`[ncav] progress ${i + 1}/${masters.length} (analyzed=${analyzed})`);
    }
  }

  const positiveCount = await db.ncavResult.count({ where: { ncavPositive: true } });
  console.log(`[ncav] done — analyzed=${analyzed}, skipped=${skipped}, positive=${positiveCount}`);
  return { analyzed, skipped, ncavPositive: positiveCount };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/company-map/src/lib/dart/ncav.ts
git commit -m "feat(company-map): add NCAV screening loop using DART API"
```

---

## Task 14: Implement worker — load-krx + analyze-all

**Files:**
- Create: `apps/company-map/worker/load-krx.ts`
- Create: `apps/company-map/worker/analyze-loop.ts`

- [ ] **Step 1: Implement load-krx**

```typescript
// apps/company-map/worker/load-krx.ts
import { db } from "@/lib/db";
import seed from "@/data/krx_stocks.json" with { type: "json" };
import type { KrxStockSeed } from "@/types/stocks";

/** Seed JSON → StockMaster upsert. 기존 corpCode는 보존. */
export async function loadKrxStocks(): Promise<number> {
  const stocks = seed as KrxStockSeed[];
  let upserted = 0;
  for (const s of stocks) {
    if (!s.Code) continue;
    await db.stockMaster.upsert({
      where: { code: s.Code },
      create: {
        code: s.Code,
        name: s.Name,
        marcap: s.Marcap != null ? BigInt(Math.round(s.Marcap)) : null,
      },
      update: {
        name: s.Name,
        marcap: s.Marcap != null ? BigInt(Math.round(s.Marcap)) : null,
      },
    });
    upserted++;
  }
  console.log(`[krx] upserted ${upserted} stock masters`);
  return upserted;
}
```

- [ ] **Step 2: Implement analyze-all loop**

```typescript
// apps/company-map/worker/analyze-loop.ts
import { db } from "@/lib/db";
import { analyzeStock } from "@/lib/stocks/analyze-stock";

const ONE_HOUR_MS = 60 * 60 * 1000;

interface RunOpts {
  shouldStop: () => boolean;
}

/**
 * Iterate all StockMasters, oldest-first; skip if analyzed within 1 hour.
 * Mirrors original analyze_all_stocks() — caller (worker loop) controls cadence.
 */
export async function analyzeAllStocks({ shouldStop }: RunOpts): Promise<{ analyzed: number; skipped: number; failed: number }> {
  const masters = await db.stockMaster.findMany({
    select: { code: true, name: true },
  });
  const analyses = await db.stockAnalysis.findMany({
    select: { code: true, lastUpdated: true },
  });
  const lastByCode = new Map(analyses.map((a) => [a.code, a.lastUpdated.getTime()]));

  // Sort: codes with no analysis first, then oldest lastUpdated
  const ordered = [...masters].sort((a, b) => {
    const la = lastByCode.get(a.code) ?? 0;
    const lb = lastByCode.get(b.code) ?? 0;
    return la - lb;
  });

  const now = Date.now();
  let analyzed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < ordered.length; i++) {
    if (shouldStop()) {
      console.log("[analyze] stop requested, breaking out");
      break;
    }
    const m = ordered[i];
    const last = lastByCode.get(m.code);
    if (last && now - last < ONE_HOUR_MS) {
      skipped++;
      continue;
    }

    try {
      const r = await analyzeStock(m.code);
      await db.stockAnalysis.upsert({
        where: { code: m.code },
        create: {
          code: m.code,
          name: r.stockName,
          currentPrice: r.currentPrice,
          intrinsicValue: r.intrinsicValue,
          safetyMargin: r.safetyMargin,
          treasuryRatio: r.treasuryRatio,
          dividendYield: r.dividendYield,
          lastUpdated: new Date(),
        },
        update: {
          name: r.stockName,
          currentPrice: r.currentPrice,
          intrinsicValue: r.intrinsicValue,
          safetyMargin: r.safetyMargin,
          treasuryRatio: r.treasuryRatio,
          dividendYield: r.dividendYield,
          lastUpdated: new Date(),
        },
      });
      analyzed++;
    } catch (err) {
      failed++;
      console.warn(`[analyze] ${m.code} (${m.name}) failed:`, err instanceof Error ? err.message : err);
    }

    if ((i + 1) % 100 === 0) {
      console.log(`[analyze] progress ${i + 1}/${ordered.length} analyzed=${analyzed} skipped=${skipped} failed=${failed}`);
    }
  }

  console.log(`[analyze] done — analyzed=${analyzed}, skipped=${skipped}, failed=${failed}`);
  return { analyzed, skipped, failed };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/worker/load-krx.ts apps/company-map/worker/analyze-loop.ts
git commit -m "feat(company-map): add worker load-krx and analyze-all loop"
```

---

## Task 15: Implement worker entrypoint

**Files:**
- Create: `apps/company-map/worker/index.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/company-map/worker/index.ts
import { loadKrxStocks } from "./load-krx";
import { analyzeAllStocks } from "./analyze-loop";
import { runNcavScreening } from "@/lib/dart/ncav";

const TWO_MINUTES_MS = 120_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let shuttingDown = false;
let lastKrxLoad = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // unref so the timer doesn't keep process alive past shutdown
    timer.unref?.();
  });
}

async function backgroundUpdate() {
  console.log("[worker] starting background update loop (2min interval)");
  while (!shuttingDown) {
    const startedAt = Date.now();
    try {
      // Load KRX seed once per day
      if (Date.now() - lastKrxLoad > ONE_DAY_MS) {
        await loadKrxStocks();
        lastKrxLoad = Date.now();
      }

      await analyzeAllStocks({ shouldStop: () => shuttingDown });
      if (shuttingDown) break;

      try {
        await runNcavScreening();
      } catch (err) {
        console.error("[worker] NCAV screening error:", err);
      }
    } catch (err) {
      console.error("[worker] cycle error:", err);
    }

    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, TWO_MINUTES_MS - elapsed);
    if (wait > 0 && !shuttingDown) {
      console.log(`[worker] cycle finished in ${elapsed}ms; sleeping ${wait}ms`);
      await sleep(wait);
    }
  }
  console.log("[worker] shutdown complete");
}

process.on("SIGINT", () => {
  console.log("[worker] SIGINT received");
  shuttingDown = true;
});
process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM received");
  shuttingDown = true;
});

// CLI flag --once: run a single cycle and exit (handy for cron)
if (process.argv.includes("--once")) {
  (async () => {
    await loadKrxStocks();
    await analyzeAllStocks({ shouldStop: () => false });
    await runNcavScreening();
    process.exit(0);
  })();
} else {
  backgroundUpdate();
}
```

- [ ] **Step 2: Smoke-test the worker for 1 cycle**

```bash
cd apps/company-map && timeout 30 yarn worker:once || true
```

Expected: log lines `[krx] upserted N stock masters` and `[analyze] progress ...`. May exit with timeout if cycle exceeds 30s — that's OK; we just want to confirm it starts and writes some data.

- [ ] **Step 3: Verify DB has rows**

```bash
sqlite3 apps/company-map/prisma/company-map.db "SELECT COUNT(*) FROM stock_masters;"
```

Expected: ≈ 2,500 (KRX seed size).

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/worker/index.ts
git commit -m "feat(company-map): add worker entrypoint with 2min loop and shutdown signals"
```

---

## Task 16: Implement server actions — stocks (search + topStocks)

**Files:**
- Create: `apps/company-map/src/actions/stocks.ts`

- [ ] **Step 1: Implement search + getTopStocks + analyzeStockOnDemand**

```typescript
// apps/company-map/src/actions/stocks.ts
"use server";

import { db } from "@/lib/db";
import { analyzeStock } from "@/lib/stocks/analyze-stock";
import type { TopStockRow } from "@/types/stocks";

export interface StockListItem {
  code: string;
  name: string;
  currentPrice: number | null;
  safetyMargin: number | null;
  lastUpdated: string;
}

/** 분석된 종목(StockAnalysis)에서 이름/코드 부분일치 검색. 원본 /search 동등. */
export async function searchStocks(keyword: string): Promise<StockListItem[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const isCode = /^\d{6}$/.test(trimmed);
  const where = isCode
    ? { code: trimmed }
    : { OR: [{ name: { contains: trimmed } }, { code: { contains: trimmed } }] };

  const rows = await db.stockAnalysis.findMany({
    where,
    orderBy: [{ safetyMargin: "desc" }, { name: "asc" }],
    take: 20,
  });
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    currentPrice: r.currentPrice,
    safetyMargin: r.safetyMargin,
    lastUpdated: r.lastUpdated.toISOString(),
  }));
}

/**
 * 안전마진 상위 종목 + 배당 필터.
 * NCAV 비율은 보통주(코드 끝 0)로 fallback 매핑.
 */
export async function getTopStocks(opts: {
  limit?: number;
  dividend?: number | null;
}): Promise<TopStockRow[]> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 30));
  const where: Record<string, unknown> = { safetyMargin: { not: null } };
  if (opts.dividend != null) {
    where.dividendYield = { gte: opts.dividend };
  }

  const rows = await db.stockAnalysis.findMany({
    where,
    orderBy: [{ safetyMargin: "desc" }],
    take: limit,
  });

  // Fetch NCAV results for these codes + their corresponding common-stock codes
  const allCodes = new Set<string>();
  for (const r of rows) {
    allCodes.add(r.code);
    if (!r.code.endsWith("0")) allCodes.add(r.code.slice(0, -1) + "0");
  }
  const ncavRows = await db.ncavResult.findMany({
    where: { code: { in: Array.from(allCodes) } },
    select: { code: true, ncavRatio: true },
  });
  const ncavMap = new Map(ncavRows.map((n) => [n.code, n.ncavRatio]));

  return rows.map((r) => {
    const direct = ncavMap.get(r.code) ?? null;
    const fallback = !r.code.endsWith("0") ? ncavMap.get(r.code.slice(0, -1) + "0") ?? null : null;
    return {
      code: r.code,
      name: r.name,
      currentPrice: r.currentPrice,
      intrinsicValue: r.intrinsicValue,
      safetyMargin: r.safetyMargin,
      treasuryRatio: r.treasuryRatio,
      dividendYield: r.dividendYield,
      lastUpdated: r.lastUpdated.toISOString(),
      ncavRatio: direct ?? fallback,
    } satisfies TopStockRow;
  });
}

/** 즉시 네이버 크롤링 + DB 갱신. 워커 안 도는 환경에서 사용. */
export async function analyzeStockOnDemand(code: string): Promise<TopStockRow> {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) throw new Error("종목코드는 6자리 숫자여야 합니다");

  const r = await analyzeStock(trimmed);
  const now = new Date();
  await db.stockMaster.upsert({
    where: { code: trimmed },
    create: { code: trimmed, name: r.stockName },
    update: { name: r.stockName },
  });
  const saved = await db.stockAnalysis.upsert({
    where: { code: trimmed },
    create: {
      code: trimmed,
      name: r.stockName,
      currentPrice: r.currentPrice,
      intrinsicValue: r.intrinsicValue,
      safetyMargin: r.safetyMargin,
      treasuryRatio: r.treasuryRatio,
      dividendYield: r.dividendYield,
      lastUpdated: now,
    },
    update: {
      name: r.stockName,
      currentPrice: r.currentPrice,
      intrinsicValue: r.intrinsicValue,
      safetyMargin: r.safetyMargin,
      treasuryRatio: r.treasuryRatio,
      dividendYield: r.dividendYield,
      lastUpdated: now,
    },
  });
  const ncav = await db.ncavResult.findUnique({ where: { code: trimmed } });
  return {
    code: saved.code,
    name: saved.name,
    currentPrice: saved.currentPrice,
    intrinsicValue: saved.intrinsicValue,
    safetyMargin: saved.safetyMargin,
    treasuryRatio: saved.treasuryRatio,
    dividendYield: saved.dividendYield,
    lastUpdated: saved.lastUpdated.toISOString(),
    ncavRatio: ncav?.ncavRatio ?? null,
  };
}

export async function getStocksByCodes(codes: string[]): Promise<TopStockRow[]> {
  if (codes.length === 0) return [];
  const rows = await db.stockAnalysis.findMany({ where: { code: { in: codes } } });
  const ncavRows = await db.ncavResult.findMany({ where: { code: { in: codes } } });
  const ncavMap = new Map(ncavRows.map((n) => [n.code, n.ncavRatio]));
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    currentPrice: r.currentPrice,
    intrinsicValue: r.intrinsicValue,
    safetyMargin: r.safetyMargin,
    treasuryRatio: r.treasuryRatio,
    dividendYield: r.dividendYield,
    lastUpdated: r.lastUpdated.toISOString(),
    ncavRatio: ncavMap.get(r.code) ?? null,
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/company-map/src/actions/stocks.ts
git commit -m "feat(company-map): add stocks server actions (search/top/analyzeOnDemand/byCodes)"
```

---

## Task 17: Implement server actions — ncav

**Files:**
- Create: `apps/company-map/src/actions/ncav.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/company-map/src/actions/ncav.ts
"use server";

import { db } from "@/lib/db";
import { bigintToString } from "@/lib/serialization";
import type { NcavRow } from "@/types/stocks";

export async function getNcavStocks(opts: {
  positive?: boolean;
  limit?: number;
  dividend?: number | null;
}): Promise<{ stocks: NcavRow[]; total: number; positiveCount: number }> {
  const limit = Math.max(1, Math.min(1000, opts.limit ?? 50));

  const where: Record<string, unknown> = {};
  if (opts.positive) where.ncavPositive = true;

  const rows = await db.ncavResult.findMany({
    where,
    orderBy: [{ ncavRatio: "desc" }],
    take: limit,
  });

  // Join dividend yield from StockAnalysis (with 우선주 → 보통주 fallback)
  const allCodes = new Set<string>();
  for (const r of rows) {
    allCodes.add(r.code);
    if (!r.code.endsWith("0")) allCodes.add(r.code.slice(0, -1) + "0");
  }
  const analyses = await db.stockAnalysis.findMany({
    where: { code: { in: Array.from(allCodes) } },
    select: { code: true, dividendYield: true },
  });
  const divMap = new Map(analyses.map((a) => [a.code, a.dividendYield]));

  let mapped: NcavRow[] = rows.map((r) => {
    const direct = divMap.get(r.code) ?? null;
    const fallback = !r.code.endsWith("0") ? divMap.get(r.code.slice(0, -1) + "0") ?? null : null;
    const dividendYield = direct ?? fallback;
    return {
      ...bigintToString({
        ncav: r.ncav,
        marcap: r.marcap,
        currentAssets: r.currentAssets,
        totalLiabilities: r.totalLiabilities,
        totalAssets: r.totalAssets,
        totalEquity: r.totalEquity,
      }),
      code: r.code,
      name: r.name,
      ncavRatio: r.ncavRatio,
      bsnsYear: r.bsnsYear,
      ncavPositive: r.ncavPositive,
      dividendYield,
      lastUpdated: r.lastUpdated.toISOString(),
    } satisfies NcavRow;
  });

  if (opts.dividend != null) {
    mapped = mapped.filter((r) => r.dividendYield != null && r.dividendYield >= opts.dividend!);
  }

  const [total, positiveCount] = await Promise.all([
    db.ncavResult.count(),
    db.ncavResult.count({ where: { ncavPositive: true } }),
  ]);

  return { stocks: mapped, total, positiveCount };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/company-map/src/actions/ncav.ts
git commit -m "feat(company-map): add ncav server actions"
```

---

## Task 18: Implement watchlist Excel export

**Files:**
- Create: `apps/company-map/src/actions/watchlist.ts`

- [ ] **Step 1: Implement**

```typescript
// apps/company-map/src/actions/watchlist.ts
"use server";

import * as XLSX from "xlsx";
import type { TopStockRow } from "@/types/stocks";

interface ExportOpts {
  sheetName?: string;
  filename: string;
}

const COLUMN_HEADERS: Record<keyof Pick<TopStockRow, "code" | "name" | "currentPrice" | "intrinsicValue" | "safetyMargin" | "treasuryRatio" | "dividendYield" | "lastUpdated">, string> = {
  code: "종목코드",
  name: "종목명",
  currentPrice: "현재가",
  intrinsicValue: "내재가치",
  safetyMargin: "안전마진",
  treasuryRatio: "자사주비율",
  dividendYield: "배당수익률",
  lastUpdated: "마지막 업데이트",
};

export async function exportStocksExcel(
  stocks: TopStockRow[],
  opts: ExportOpts
): Promise<{ buffer: Uint8Array; filename: string }> {
  const sheetName = opts.sheetName ?? "안전마진";
  const rows = stocks.map((s) => ({
    [COLUMN_HEADERS.code]: s.code,
    [COLUMN_HEADERS.name]: s.name,
    [COLUMN_HEADERS.currentPrice]: s.currentPrice != null ? Math.round(s.currentPrice).toLocaleString() : "",
    [COLUMN_HEADERS.intrinsicValue]: s.intrinsicValue != null ? Math.round(s.intrinsicValue).toLocaleString() : "",
    [COLUMN_HEADERS.safetyMargin]: s.safetyMargin != null ? s.safetyMargin.toFixed(2) : "",
    [COLUMN_HEADERS.treasuryRatio]: s.treasuryRatio != null ? s.treasuryRatio.toFixed(2) : "",
    [COLUMN_HEADERS.dividendYield]: s.dividendYield != null ? s.dividendYield.toFixed(2) : "",
    [COLUMN_HEADERS.lastUpdated]: new Date(s.lastUpdated).toLocaleString("ko-KR"),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { buffer: new Uint8Array(buffer), filename: opts.filename };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/company-map/src/actions/watchlist.ts
git commit -m "feat(company-map): add watchlist Excel export server action"
```

---

## Task 19: Add QuoteBanner component

**Files:**
- Create: `apps/company-map/src/components/stocks/QuoteBanner.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/company-map/src/components/stocks/QuoteBanner.tsx
import quotesData from "@/data/investment_quotes.json" with { type: "json" };
import type { InvestmentQuote } from "@/types/stocks";

const quotes = (quotesData as { quotes: InvestmentQuote[] }).quotes;

function pickQuote(): InvestmentQuote | null {
  if (!quotes.length) return null;
  return quotes[Math.floor(Math.random() * quotes.length)];
}

export function QuoteBanner() {
  const q = pickQuote();
  if (!q) return null;
  return (
    <blockquote className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 text-sm text-gray-700 dark:border-gray-800 dark:from-gray-900 dark:to-gray-950 dark:text-gray-300">
      <p className="font-medium">"{q.quote}"</p>
      <footer className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>— {q.author}{q.source ? `, ${q.source}` : ""}</span>
        {q.original ? <span className="italic opacity-70">"{q.original}"</span> : null}
      </footer>
    </blockquote>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/company-map/src/components/stocks/QuoteBanner.tsx
git commit -m "feat(company-map): add QuoteBanner component"
```

---

## Task 20: Add StockSearch + StockResultCard + WatchlistPanel components

**Files:**
- Create: `apps/company-map/src/components/stocks/StockSearch.tsx`
- Create: `apps/company-map/src/components/stocks/StockResultCard.tsx`
- Create: `apps/company-map/src/components/stocks/WatchlistPanel.tsx`

- [ ] **Step 1: Implement StockSearch**

```tsx
// apps/company-map/src/components/stocks/StockSearch.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, Loader2 } from "lucide-react";
import { searchStocks, analyzeStockOnDemand, type StockListItem } from "@/actions/stocks";
import type { TopStockRow } from "@/types/stocks";

interface Props {
  onSelect: (row: TopStockRow) => void;
}

export function StockSearch({ onSelect }: Props) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<StockListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, startSearch] = useTransition();
  const [analyzing, startAnalyze] = useTransition();

  useEffect(() => {
    if (input.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => {
      startSearch(async () => {
        const data = await searchStocks(input.trim());
        setResults(data);
        setOpen(true);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const handleAnalyzeDirect = async () => {
    const trimmed = input.trim();
    if (!/^\d{6}$/.test(trimmed)) return;
    startAnalyze(async () => {
      try {
        const row = await analyzeStockOnDemand(trimmed);
        onSelect(row);
        setOpen(false);
      } catch (e) {
        console.error(e);
        alert(e instanceof Error ? e.message : "분석 실패");
      }
    });
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="종목명 또는 6자리 종목코드를 입력하세요"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-28 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
        />
        {(searching || analyzing) && (
          <Loader2 size={16} className="absolute right-24 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
        )}
        {/^\d{6}$/.test(input.trim()) && (
          <button
            type="button"
            onClick={handleAnalyzeDirect}
            disabled={analyzing}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            지금 분석
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
          {results.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => {
                  onSelect({
                    code: r.code,
                    name: r.name,
                    currentPrice: r.currentPrice,
                    intrinsicValue: null,
                    safetyMargin: r.safetyMargin,
                    treasuryRatio: null,
                    dividendYield: null,
                    lastUpdated: r.lastUpdated,
                    ncavRatio: null,
                  });
                  setOpen(false);
                  setInput(r.name);
                }}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span>
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-gray-500">{r.code}</span>
                </span>
                {r.safetyMargin != null && (
                  <span className={r.safetyMargin >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {r.safetyMargin.toFixed(1)}%
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement StockResultCard**

```tsx
// apps/company-map/src/components/stocks/StockResultCard.tsx
"use client";

import { Heart } from "lucide-react";
import type { TopStockRow } from "@/types/stocks";

function safetyColor(margin: number | null): string {
  if (margin == null) return "text-gray-500";
  if (margin >= 30) return "text-emerald-600";
  if (margin >= 10) return "text-green-600";
  if (margin >= -10) return "text-amber-600";
  if (margin >= -30) return "text-orange-600";
  return "text-red-600";
}

interface Props {
  row: TopStockRow;
  isFavorite: boolean;
  onToggleFavorite: (code: string) => void;
}

export function StockResultCard({ row, isFavorite, onToggleFavorite }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">{row.name}</h2>
          <p className="text-sm text-gray-500">{row.code}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggleFavorite(row.code)}
          aria-label="관심종목 토글"
          className="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Heart size={20} className={isFavorite ? "fill-red-500 text-red-500" : "text-gray-400"} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="현재가" value={row.currentPrice != null ? `${Math.round(row.currentPrice).toLocaleString()}원` : "-"} />
        <Metric label="내재가치" value={row.intrinsicValue != null ? `${Math.round(row.intrinsicValue).toLocaleString()}원` : "-"} />
        <Metric label="안전마진" value={row.safetyMargin != null ? `${row.safetyMargin > 0 ? "+" : ""}${row.safetyMargin.toFixed(1)}%` : "-"} valueClass={safetyColor(row.safetyMargin)} />
        <Metric label="자사주비율" value={row.treasuryRatio != null ? `${row.treasuryRatio.toFixed(2)}%` : "-"} />
        <Metric label="배당수익률" value={row.dividendYield != null ? `${row.dividendYield.toFixed(2)}%` : "-"} />
        <Metric label="NCAV 비율" value={row.ncavRatio != null ? `${row.ncavRatio.toFixed(1)}%` : "-"} />
      </div>

      <p className="mt-4 text-xs text-gray-500">
        마지막 업데이트: {new Date(row.lastUpdated).toLocaleString("ko-KR")}
      </p>
    </div>
  );
}

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 3: Implement WatchlistPanel**

```tsx
// apps/company-map/src/components/stocks/WatchlistPanel.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { Download, X } from "lucide-react";
import { getStocksByCodes } from "@/actions/stocks";
import { exportStocksExcel } from "@/actions/watchlist";
import type { TopStockRow } from "@/types/stocks";

const STORAGE_KEY = "company-map.watchlist";

export function readWatchlistCodes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function writeWatchlistCodes(codes: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
}

export function toggleWatchlistCode(code: string): string[] {
  const cur = readWatchlistCodes();
  const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
  writeWatchlistCodes(next);
  return next;
}

export function WatchlistPanel({
  codes,
  onRemove,
}: {
  codes: string[];
  onRemove: (code: string) => void;
}) {
  const [rows, setRows] = useState<TopStockRow[]>([]);
  const [loading, startLoad] = useTransition();
  const [exporting, startExport] = useTransition();

  useEffect(() => {
    if (codes.length === 0) {
      setRows([]);
      return;
    }
    startLoad(async () => {
      const data = await getStocksByCodes(codes);
      setRows(data);
    });
  }, [codes]);

  const handleExport = () => {
    if (rows.length === 0) return;
    startExport(async () => {
      const { buffer, filename } = await exportStocksExcel(rows, {
        sheetName: "관심종목",
        filename: "관심종목.xlsx",
      });
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  };

  if (codes.length === 0) {
    return <p className="text-sm text-gray-500">관심종목이 비어 있습니다.</p>;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">관심종목 ({codes.length})</h3>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || rows.length === 0}
          className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Download size={14} /> 엑셀
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">로딩 중...</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.code} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
              <span>
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 text-xs text-gray-500">{r.code}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className={r.safetyMargin != null && r.safetyMargin >= 0 ? "text-emerald-600" : "text-red-600"}>
                  {r.safetyMargin != null ? `${r.safetyMargin.toFixed(1)}%` : "-"}
                </span>
                <button type="button" onClick={() => onRemove(r.code)} aria-label="제거">
                  <X size={14} className="text-gray-400 hover:text-red-500" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/src/components/stocks
git commit -m "feat(company-map): add stock search, result card, watchlist panel components"
```

---

## Task 21: Add `/calculator` page

**Files:**
- Create: `apps/company-map/src/app/calculator/page.tsx`
- Create: `apps/company-map/src/app/calculator/CalculatorClient.tsx`

- [ ] **Step 1: Implement client wrapper (state, watchlist, selected stock)**

```tsx
// apps/company-map/src/app/calculator/CalculatorClient.tsx
"use client";

import { useEffect, useState } from "react";
import { StockSearch } from "@/components/stocks/StockSearch";
import { StockResultCard } from "@/components/stocks/StockResultCard";
import {
  WatchlistPanel,
  readWatchlistCodes,
  toggleWatchlistCode,
} from "@/components/stocks/WatchlistPanel";
import type { TopStockRow } from "@/types/stocks";

export function CalculatorClient() {
  const [selected, setSelected] = useState<TopStockRow | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setFavorites(readWatchlistCodes());
  }, []);

  const handleToggle = (code: string) => {
    setFavorites(toggleWatchlistCode(code));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <StockSearch onSelect={setSelected} />
        {selected ? (
          <StockResultCard
            row={selected}
            isFavorite={favorites.includes(selected.code)}
            onToggleFavorite={handleToggle}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
            종목을 검색하거나 6자리 종목코드를 입력해 분석하세요.
          </p>
        )}
      </div>
      <aside>
        <WatchlistPanel codes={favorites} onRemove={(c) => setFavorites(toggleWatchlistCode(c))} />
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Implement page**

```tsx
// apps/company-map/src/app/calculator/page.tsx
import { QuoteBanner } from "@/components/stocks/QuoteBanner";
import { CalculatorClient } from "./CalculatorClient";

export const metadata = { title: "내재가치 계산기 — Company Map" };

export default function CalculatorPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">내재가치 계산기</h1>
        <p className="mt-1 text-sm text-gray-500">
          벤자민 그레이엄의 가치투자 공식 — 가중 EPS + BPS 기반.
        </p>
      </header>
      <QuoteBanner />
      <CalculatorClient />
    </main>
  );
}
```

- [ ] **Step 3: Verify page renders**

Run: `cd apps/company-map && yarn dev`
Open: `http://localhost:3004/calculator`
Expected: page renders without runtime errors. Search box visible, watchlist panel says "관심종목이 비어 있습니다." on first load.

- [ ] **Step 4: Commit**

```bash
git add apps/company-map/src/app/calculator
git commit -m "feat(company-map): add /calculator page"
```

---

## Task 22: Add `/top-stocks` page

**Files:**
- Create: `apps/company-map/src/components/stocks/TopStocksTable.tsx`
- Create: `apps/company-map/src/app/top-stocks/page.tsx`
- Create: `apps/company-map/src/app/top-stocks/TopStocksClient.tsx`

- [ ] **Step 1: Implement TopStocksTable**

```tsx
// apps/company-map/src/components/stocks/TopStocksTable.tsx
"use client";

import { Heart, Download } from "lucide-react";
import type { TopStockRow } from "@/types/stocks";

interface Props {
  rows: TopStockRow[];
  favorites: Set<string>;
  onToggle: (code: string) => void;
  onExport: () => void;
  exporting: boolean;
}

function safetyClass(margin: number | null): string {
  if (margin == null) return "text-gray-400";
  if (margin >= 30) return "text-emerald-600";
  if (margin >= 10) return "text-green-600";
  if (margin >= -10) return "text-amber-600";
  if (margin >= -30) return "text-orange-600";
  return "text-red-600";
}

export function TopStocksTable({ rows, favorites, onToggle, onExport, exporting }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-800">
        <p className="text-sm text-gray-500">총 {rows.length}개 종목</p>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting || rows.length === 0}
          className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Download size={14} /> 엑셀
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-950">
          <tr>
            <th className="px-3 py-2 text-left">종목</th>
            <th className="px-3 py-2 text-right">현재가</th>
            <th className="px-3 py-2 text-right">내재가치</th>
            <th className="px-3 py-2 text-right">안전마진</th>
            <th className="px-3 py-2 text-right">자사주</th>
            <th className="px-3 py-2 text-right">배당</th>
            <th className="px-3 py-2 text-right">NCAV</th>
            <th className="px-3 py-2 text-right">업데이트</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-t border-gray-100 hover:bg-gray-50 dark:border-gray-900 dark:hover:bg-gray-800">
              <td className="px-3 py-2">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-gray-500">{r.code}</div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.currentPrice != null ? Math.round(r.currentPrice).toLocaleString() : "-"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.intrinsicValue != null ? Math.round(r.intrinsicValue).toLocaleString() : "-"}
              </td>
              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${safetyClass(r.safetyMargin)}`}>
                {r.safetyMargin != null ? `${r.safetyMargin > 0 ? "+" : ""}${r.safetyMargin.toFixed(1)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.treasuryRatio != null ? `${r.treasuryRatio.toFixed(2)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.dividendYield != null ? `${r.dividendYield.toFixed(2)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.ncavRatio != null ? `${r.ncavRatio.toFixed(1)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-right text-xs text-gray-500">
                {new Date(r.lastUpdated).toLocaleString("ko-KR")}
              </td>
              <td className="px-3 py-2">
                <button type="button" onClick={() => onToggle(r.code)} aria-label="관심종목 토글">
                  <Heart size={16} className={favorites.has(r.code) ? "fill-red-500 text-red-500" : "text-gray-300"} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Implement client wrapper with filters**

```tsx
// apps/company-map/src/app/top-stocks/TopStocksClient.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { TopStocksTable } from "@/components/stocks/TopStocksTable";
import { getTopStocks } from "@/actions/stocks";
import { exportStocksExcel } from "@/actions/watchlist";
import { readWatchlistCodes, toggleWatchlistCode } from "@/components/stocks/WatchlistPanel";
import type { TopStockRow } from "@/types/stocks";

const LIMIT_OPTIONS = [30, 50, 100, 200, 300];
const DIVIDEND_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "전체", value: null },
  { label: "≥ 1%", value: 1 },
  { label: "≥ 2%", value: 2 },
  { label: "≥ 3%", value: 3 },
  { label: "≥ 5%", value: 5 },
  { label: "≥ 7%", value: 7 },
];

export function TopStocksClient({ initial }: { initial: TopStockRow[] }) {
  const [rows, setRows] = useState<TopStockRow[]>(initial);
  const [limit, setLimit] = useState(30);
  const [dividend, setDividend] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, startLoad] = useTransition();
  const [exporting, startExport] = useTransition();

  useEffect(() => {
    setFavorites(new Set(readWatchlistCodes()));
  }, []);

  useEffect(() => {
    startLoad(async () => {
      const data = await getTopStocks({ limit, dividend });
      setRows(data);
    });
  }, [limit, dividend]);

  const handleToggle = (code: string) => {
    setFavorites(new Set(toggleWatchlistCode(code)));
  };

  const handleExport = () => {
    startExport(async () => {
      const filename = dividend != null
        ? `안전마진_상위${limit}종목_배당수익률${dividend}%이상.xlsx`
        : `안전마진_상위${limit}종목.xlsx`;
      const { buffer } = await exportStocksExcel(rows, { sheetName: "안전마진 상위종목", filename });
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-gray-900">
        <label className="flex items-center gap-2">
          상위
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}개</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          배당
          <select
            value={dividend ?? ""}
            onChange={(e) => setDividend(e.target.value === "" ? null : Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {DIVIDEND_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>{opt.label}</option>
            ))}
          </select>
        </label>
        {loading && <span className="text-xs text-gray-500">로딩 중...</span>}
      </div>
      <TopStocksTable
        rows={rows}
        favorites={favorites}
        onToggle={handleToggle}
        onExport={handleExport}
        exporting={exporting}
      />
    </div>
  );
}
```

- [ ] **Step 3: Implement page**

```tsx
// apps/company-map/src/app/top-stocks/page.tsx
import { QuoteBanner } from "@/components/stocks/QuoteBanner";
import { getTopStocks } from "@/actions/stocks";
import { TopStocksClient } from "./TopStocksClient";

export const metadata = { title: "안전마진 상위종목 — Company Map" };
export const dynamic = "force-dynamic";

export default async function TopStocksPage() {
  const initial = await getTopStocks({ limit: 30, dividend: null });
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">안전마진 상위종목</h1>
        <p className="mt-1 text-sm text-gray-500">
          내재가치 대비 현재가가 가장 저평가된 종목 (워커가 분석한 결과 기준).
        </p>
      </header>
      <QuoteBanner />
      <TopStocksClient initial={initial} />
    </main>
  );
}
```

- [ ] **Step 4: Verify page renders**

Open: `http://localhost:3004/top-stocks`
Expected: 페이지 렌더, 데이터가 없으면 빈 테이블 (워커 미실행 상태). 워커 실행 후에는 종목 행 표시.

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/app/top-stocks apps/company-map/src/components/stocks/TopStocksTable.tsx
git commit -m "feat(company-map): add /top-stocks page with filters and excel export"
```

---

## Task 23: Add `/ncav` page

**Files:**
- Create: `apps/company-map/src/components/stocks/NcavTable.tsx`
- Create: `apps/company-map/src/app/ncav/page.tsx`
- Create: `apps/company-map/src/app/ncav/NcavClient.tsx`

- [ ] **Step 1: Implement NcavTable**

```tsx
// apps/company-map/src/components/stocks/NcavTable.tsx
"use client";

import type { NcavRow } from "@/types/stocks";

function fmtBig(v: string): string {
  // BigInt-as-string → "12,345,678"
  return BigInt(v).toLocaleString();
}

export function NcavTable({ rows }: { rows: NcavRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-950">
          <tr>
            <th className="px-3 py-2 text-left">종목</th>
            <th className="px-3 py-2 text-right">NCAV</th>
            <th className="px-3 py-2 text-right">시가총액</th>
            <th className="px-3 py-2 text-right">NCAV 비율</th>
            <th className="px-3 py-2 text-right">유동자산</th>
            <th className="px-3 py-2 text-right">부채총계</th>
            <th className="px-3 py-2 text-right">사업연도</th>
            <th className="px-3 py-2 text-right">배당</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-t border-gray-100 dark:border-gray-900">
              <td className="px-3 py-2">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-gray-500">{r.code}</div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtBig(r.ncav)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtBig(r.marcap)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.ncavRatio != null ? `${r.ncavRatio.toFixed(1)}%` : "-"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtBig(r.currentAssets)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtBig(r.totalLiabilities)}</td>
              <td className="px-3 py-2 text-right">{r.bsnsYear}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.dividendYield != null ? `${r.dividendYield.toFixed(2)}%` : "-"}
              </td>
              <td className="px-3 py-2">
                {r.ncavPositive && (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    NCAV&gt;시총
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Implement client wrapper**

```tsx
// apps/company-map/src/app/ncav/NcavClient.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { NcavTable } from "@/components/stocks/NcavTable";
import { getNcavStocks } from "@/actions/ncav";
import type { NcavRow } from "@/types/stocks";

const LIMIT_OPTIONS = [50, 100, 200, 500];
const DIVIDEND_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "전체", value: null },
  { label: "≥ 1%", value: 1 },
  { label: "≥ 3%", value: 3 },
  { label: "≥ 5%", value: 5 },
];

interface Props {
  initial: { stocks: NcavRow[]; total: number; positiveCount: number };
}

export function NcavClient({ initial }: Props) {
  const [rows, setRows] = useState<NcavRow[]>(initial.stocks);
  const [total, setTotal] = useState(initial.total);
  const [positive, setPositive] = useState(initial.positiveCount);
  const [limit, setLimit] = useState(50);
  const [onlyPositive, setOnlyPositive] = useState(false);
  const [dividend, setDividend] = useState<number | null>(null);
  const [loading, startLoad] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const data = await getNcavStocks({ limit, positive: onlyPositive, dividend });
      setRows(data.stocks);
      setTotal(data.total);
      setPositive(data.positiveCount);
    });
  }, [limit, onlyPositive, dividend]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-gray-900">
        <span className="text-gray-500">전체 분석 {total.toLocaleString()}개 · NCAV&gt;시총 {positive.toLocaleString()}개</span>
        <label className="ml-auto flex items-center gap-2">
          상위
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}개</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyPositive} onChange={(e) => setOnlyPositive(e.target.checked)} />
          NCAV&gt;시총만
        </label>
        <label className="flex items-center gap-2">
          배당
          <select
            value={dividend ?? ""}
            onChange={(e) => setDividend(e.target.value === "" ? null : Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {DIVIDEND_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>{opt.label}</option>
            ))}
          </select>
        </label>
        {loading && <span className="text-xs text-gray-500">로딩 중...</span>}
      </div>
      <NcavTable rows={rows} />
    </div>
  );
}
```

- [ ] **Step 3: Implement page**

```tsx
// apps/company-map/src/app/ncav/page.tsx
import { getNcavStocks } from "@/actions/ncav";
import { NcavClient } from "./NcavClient";

export const metadata = { title: "NCAV 스크리닝 — Company Map" };
export const dynamic = "force-dynamic";

export default async function NcavPage() {
  const initial = await getNcavStocks({ limit: 50 });
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">NCAV 스크리닝</h1>
        <p className="mt-1 text-sm text-gray-500">
          (유동자산 - 부채총계) &gt; 시가총액 — 그레이엄 청산가치 전략.
        </p>
      </header>
      <NcavClient initial={initial} />
    </main>
  );
}
```

- [ ] **Step 4: Verify page renders**

Open: `http://localhost:3004/ncav`
Expected: 페이지 렌더 (워커 미실행 시 빈 테이블).

- [ ] **Step 5: Commit**

```bash
git add apps/company-map/src/app/ncav apps/company-map/src/components/stocks/NcavTable.tsx
git commit -m "feat(company-map): add /ncav screening page"
```

---

## Task 24: Update AppMenu with TOOLS section

**Files:**
- Modify: `apps/company-map/src/components/layout/AppMenu.tsx`

- [ ] **Step 1: Add TOOLS array and render second section**

Add this constant after the existing `SERVICES` declaration:

```typescript
import { Calculator, TrendingUp, Filter } from "lucide-react";

type Tool = {
  key: string;
  name: string;
  description: string;
  path: string;
  icon: typeof MapIcon;
};

const TOOLS: Tool[] = [
  {
    key: "calculator",
    name: "내재가치 계산기",
    description: "종목 검색 및 안전마진 계산",
    path: "/calculator",
    icon: Calculator,
  },
  {
    key: "top-stocks",
    name: "안전마진 상위종목",
    description: "상위 N개 종목 + 배당 필터",
    path: "/top-stocks",
    icon: TrendingUp,
  },
  {
    key: "ncav",
    name: "NCAV 스크리닝",
    description: "청산가치 > 시가총액 종목",
    path: "/ncav",
    icon: Filter,
  },
];
```

Then inside the `<nav>` block (after the existing services map), add:

```tsx
<div className="mt-6 text-xs font-semibold uppercase tracking-wider text-gray-500 px-2 mb-2">
  도구
</div>
{TOOLS.map((t) => {
  const Icon = t.icon;
  const active = pathname === t.path || (t.path !== "/" && pathname.startsWith(t.path));
  return (
    <Link
      key={t.key}
      href={t.path}
      onClick={() => setOpen(false)}
      className={`block rounded p-2 transition ${
        active ? "bg-blue-50 dark:bg-blue-950" : "hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon size={18} className="mt-0.5 text-blue-600" />
        <div className="flex-1">
          <div className="font-medium text-sm">{t.name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t.description}</div>
        </div>
      </div>
    </Link>
  );
})}
```

- [ ] **Step 2: Verify menu renders both sections**

Open `http://localhost:3004/`, click the hamburger button.
Expected: 패널 안에 "서비스" 섹션 (Company Map / Blog Collection) + "도구" 섹션 (계산기 / 상위종목 / NCAV)이 동시에 보임.

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/src/components/layout/AppMenu.tsx
git commit -m "feat(company-map): add 도구 section in hamburger menu"
```

---

## Task 25: Update Header nav links

**Files:**
- Modify: `apps/company-map/src/components/layout/Header.tsx`

- [ ] **Step 1: Add three new links**

Replace the `<nav>` block with:

```tsx
<nav className="ml-auto flex gap-4 text-sm text-gray-600 dark:text-gray-400">
  <Link href="/map" className="hover:underline">Map</Link>
  <Link href="/companies" className="hover:underline">Companies</Link>
  <Link href="/industries" className="hover:underline">Industries</Link>
  <Link href="/import" className="hover:underline">Import</Link>
  <span className="select-none text-gray-300 dark:text-gray-700">|</span>
  <Link href="/calculator" className="hover:underline">계산기</Link>
  <Link href="/top-stocks" className="hover:underline">상위종목</Link>
  <Link href="/ncav" className="hover:underline">NCAV</Link>
</nav>
```

- [ ] **Step 2: Verify**

Reload `http://localhost:3004/calculator` and confirm 7 nav links visible.

- [ ] **Step 3: Commit**

```bash
git add apps/company-map/src/components/layout/Header.tsx
git commit -m "feat(company-map): add calculator/top-stocks/ncav links to header"
```

---

## Task 26: End-to-end smoke verification

**Files:** none (manual verification)

- [ ] **Step 1: Run worker once and verify analyses**

```bash
cd apps/company-map && yarn worker:once
```

Wait until exit. Expected log lines: `[krx] upserted N`, `[analyze] progress ...`, `[ncav] done`.

- [ ] **Step 2: Verify DB has analysis rows**

```bash
sqlite3 apps/company-map/prisma/company-map.db \
  "SELECT COUNT(*) FROM stock_analyses; SELECT COUNT(*) FROM ncav_results;"
```

Expected: stock_analyses ≥ 1 (whatever the worker had time to analyze before completing one pass; if --once does the full run it could be hundreds).

- [ ] **Step 3: Verify pages reflect data**

In a browser, open:
- `http://localhost:3004/calculator` — search "삼성" — drop-down should list 삼성 종목들
- click 삼성전자 → result card shows current price, intrinsic value, safety margin
- toggle ♥ → reload page → favorite persists
- `http://localhost:3004/top-stocks` — table populated, sortable by limit/dividend filters, excel export downloads a `.xlsx` that opens correctly
- `http://localhost:3004/ncav` — table populated when worker has analyzed at least some NCAV; "NCAV>시총" badge appears on ncavPositive rows

- [ ] **Step 4: Compare a known stock against original Flask app (manual sanity check)**

Run the original Python app locally (or use the deployed instance) and compare 005930 (삼성전자) values:
- 현재가 should match within ~1% (price moves intraday)
- 내재가치 (조정 포함) should match within ~1%
- 안전마진 should match within ~1%

If values differ by more than 5%, investigate:
- selector mismatch in `parseNaverMain` (Naver may have changed HTML structure since fixture capture)
- treasury ratio parsing (some stocks list 자기주식 instead of 자사주)

- [ ] **Step 5: Commit a verification note**

```bash
git commit --allow-empty -m "chore(company-map): verified intrinsic-value port end-to-end against upstream"
```

---

## Self-Review Checklist (filled in)

**1. Spec coverage:**

| Spec section | Implementing task |
|---|---|
| §3 폴더 구조 | Tasks 1-25 (each task creates the listed files) |
| §4 Prisma 모델 | Task 3 |
| §5 `/calculator` 페이지 | Task 21 |
| §5 `/top-stocks` 페이지 | Task 22 |
| §5 `/ncav` 페이지 | Task 23 |
| §6 Naver scraper | Tasks 7-8 |
| §6 계산기 (intrinsic value) | Task 6 |
| §6 Worker 무한 루프 + 시그널 처리 | Task 15 |
| §6 Server Actions | Tasks 16-18 |
| §6 우선주 → 보통주 NCAV 매핑 | Task 16 (`getTopStocks`) + Task 17 (`getNcavStocks`) |
| §7 햄버거 메뉴 통합 | Task 24 |
| §7 Header 네비 | Task 25 |
| §8 시드 / 마이그레이션 / 의존성 | Tasks 1, 3, 4 |
| §8 격언 표시 | Task 19 |
| §9 검증 / 테스트 | Tasks 6, 8, 12 (unit), Task 26 (manual integration) |
| §10 차이점 (KRX 자동 갱신 없음) | Documented in spec; worker reloads krx_stocks.json daily as designed |

**2. Placeholder scan:** No "TBD" / "implement later" / "add appropriate handling" found. Each step contains either complete code or exact commands.

**3. Type consistency:** `TopStockRow`, `NcavRow`, `AnalyzeStockResult`, `TreasuryStockInfo`, `DartFinancialResult` are all defined in Task 5 and used consistently in subsequent tasks. `StockListItem` is exported from `actions/stocks.ts` (Task 16) and consumed in Task 20 (`StockSearch`). `WatchlistPanel` exports `readWatchlistCodes` / `toggleWatchlistCode` (Task 20) consumed in Tasks 21 and 22.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-05-intrinsic-value-calculator-port.md`. 26 tasks total (~3-5 days of focused work).

Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task with two-stage review between tasks. Cleaner context, slower wall-clock.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`. Batch checkpoints for review. Faster wall-clock.
