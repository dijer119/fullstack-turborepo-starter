-- CreateTable
CREATE TABLE "fund_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fund_code" TEXT NOT NULL,
    "trd_dd" TEXT NOT NULL,
    "nav" REAL,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "fund_holdings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshot_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" REAL,
    "rank" INTEGER NOT NULL,
    CONSTRAINT "fund_holdings_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "fund_snapshots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fund_navs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fund_code" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "nav" REAL NOT NULL
);

-- CreateIndex
CREATE INDEX "fund_snapshots_fund_code_trd_dd_idx" ON "fund_snapshots"("fund_code", "trd_dd");

-- CreateIndex
CREATE UNIQUE INDEX "fund_snapshots_fund_code_trd_dd_key" ON "fund_snapshots"("fund_code", "trd_dd");

-- CreateIndex
CREATE INDEX "fund_holdings_snapshot_id_idx" ON "fund_holdings"("snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "fund_navs_fund_code_date_key" ON "fund_navs"("fund_code", "date");
