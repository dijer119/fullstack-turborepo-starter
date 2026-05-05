-- CreateTable
CREATE TABLE "stock_masters" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "marcap" BIGINT,
    "corp_code" TEXT,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "stock_analyses" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "current_price" REAL,
    "intrinsic_value" REAL,
    "safety_margin" REAL,
    "treasury_ratio" REAL,
    "dividend_yield" REAL,
    "last_updated" DATETIME NOT NULL,
    CONSTRAINT "stock_analyses_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ncav_results" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ncav" BIGINT NOT NULL,
    "marcap" BIGINT NOT NULL,
    "ncav_ratio" REAL,
    "current_assets" BIGINT NOT NULL,
    "total_liabilities" BIGINT NOT NULL,
    "total_assets" BIGINT NOT NULL,
    "total_equity" BIGINT NOT NULL,
    "bsns_year" INTEGER NOT NULL,
    "ncav_positive" BOOLEAN NOT NULL,
    "last_updated" DATETIME NOT NULL,
    CONSTRAINT "ncav_results_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "stock_masters_name_idx" ON "stock_masters"("name");

-- CreateIndex
CREATE INDEX "stock_analyses_safety_margin_idx" ON "stock_analyses"("safety_margin");

-- CreateIndex
CREATE INDEX "stock_analyses_dividend_yield_idx" ON "stock_analyses"("dividend_yield");

-- CreateIndex
CREATE INDEX "stock_analyses_last_updated_idx" ON "stock_analyses"("last_updated");

-- CreateIndex
CREATE INDEX "ncav_results_ncav_ratio_idx" ON "ncav_results"("ncav_ratio");

-- CreateIndex
CREATE INDEX "ncav_results_ncav_positive_idx" ON "ncav_results"("ncav_positive");
