-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_infinite_buy_cycles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_seq" INTEGER,
    "principal" REAL NOT NULL,
    "splits" INTEGER NOT NULL DEFAULT 40,
    "profit_target" REAL NOT NULL DEFAULT 10,
    "big_buy_premium" REAL NOT NULL DEFAULT 12,
    "loss_cut" REAL NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'active',
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "round" INTEGER NOT NULL DEFAULT 0,
    "last_run_date" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_infinite_buy_cycles" ("account_seq", "big_buy_premium", "created_at", "dry_run", "id", "last_run_date", "loss_cut", "name", "principal", "profit_target", "round", "splits", "status", "symbol", "updated_at") SELECT "account_seq", "big_buy_premium", "created_at", "dry_run", "id", "last_run_date", "loss_cut", "name", "principal", "profit_target", "round", "splits", "status", "symbol", "updated_at" FROM "infinite_buy_cycles";
DROP TABLE "infinite_buy_cycles";
ALTER TABLE "new_infinite_buy_cycles" RENAME TO "infinite_buy_cycles";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
