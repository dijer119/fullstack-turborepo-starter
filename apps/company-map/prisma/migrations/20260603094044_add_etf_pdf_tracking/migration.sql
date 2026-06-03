-- CreateTable
CREATE TABLE "etf_watches" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "isin" TEXT,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "etf_pdf_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "etf_code" TEXT NOT NULL,
    "trd_dd" TEXT NOT NULL,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "etf_pdf_snapshots_etf_code_fkey" FOREIGN KEY ("etf_code") REFERENCES "etf_watches" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "etf_pdf_holdings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshot_id" TEXT NOT NULL,
    "constituent_code" TEXT NOT NULL,
    "constituent_name" TEXT NOT NULL,
    "weight" REAL,
    "shares" REAL,
    "amount" REAL,
    CONSTRAINT "etf_pdf_holdings_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "etf_pdf_snapshots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "etf_pdf_snapshots_etf_code_trd_dd_idx" ON "etf_pdf_snapshots"("etf_code", "trd_dd");

-- CreateIndex
CREATE UNIQUE INDEX "etf_pdf_snapshots_etf_code_trd_dd_key" ON "etf_pdf_snapshots"("etf_code", "trd_dd");

-- CreateIndex
CREATE INDEX "etf_pdf_holdings_snapshot_id_idx" ON "etf_pdf_holdings"("snapshot_id");
