-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_etf_watches" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "isin" TEXT,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_etf_watches" ("code", "created_at", "isin", "name") SELECT "code", "created_at", "isin", "name" FROM "etf_watches";
DROP TABLE "etf_watches";
ALTER TABLE "new_etf_watches" RENAME TO "etf_watches";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
