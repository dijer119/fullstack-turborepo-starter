-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_stock_masters" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "market" TEXT,
    "marcap" BIGINT,
    "corp_code" TEXT,
    "treasury_cancel_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_stock_masters" ("code", "corp_code", "marcap", "market", "name", "updated_at") SELECT "code", "corp_code", "marcap", "market", "name", "updated_at" FROM "stock_masters";
DROP TABLE "stock_masters";
ALTER TABLE "new_stock_masters" RENAME TO "stock_masters";
CREATE INDEX "stock_masters_name_idx" ON "stock_masters"("name");
CREATE INDEX "stock_masters_market_idx" ON "stock_masters"("market");
CREATE INDEX "stock_masters_marcap_idx" ON "stock_masters"("marcap");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
