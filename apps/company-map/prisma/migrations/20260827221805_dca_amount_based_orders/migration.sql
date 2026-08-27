/*
  Warnings:

  - You are about to drop the column `premium_pct` on the `dca_accounts` table. All the data in the column will be lost.
  - Added the required column `amount_usd` to the `dca_orders` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_dca_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "base_symbol" TEXT NOT NULL DEFAULT 'QQQ',
    "lever_symbol" TEXT NOT NULL DEFAULT 'QLD',
    "account_seq" INTEGER,
    "threshold_pct" REAL NOT NULL DEFAULT 10,
    "daily_amount_krw" REAL NOT NULL DEFAULT 50000,
    "cash_krw" REAL NOT NULL DEFAULT 0,
    "peak_price" REAL NOT NULL,
    "peak_date" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "last_run_date" TEXT,
    "last_accrual_date" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_dca_accounts" ("account_seq", "base_symbol", "cash_krw", "created_at", "daily_amount_krw", "dry_run", "id", "last_accrual_date", "last_run_date", "lever_symbol", "name", "note", "peak_date", "peak_price", "start_date", "status", "threshold_pct", "updated_at") SELECT "account_seq", "base_symbol", "cash_krw", "created_at", "daily_amount_krw", "dry_run", "id", "last_accrual_date", "last_run_date", "lever_symbol", "name", "note", "peak_date", "peak_price", "start_date", "status", "threshold_pct", "updated_at" FROM "dca_accounts";
DROP TABLE "dca_accounts";
ALTER TABLE "new_dca_accounts" RENAME TO "dca_accounts";
CREATE TABLE "new_dca_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "trade_date" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "order_type" TEXT NOT NULL,
    "tif" TEXT,
    "price" REAL,
    "quantity" REAL,
    "amount_usd" REAL NOT NULL,
    "client_order_id" TEXT,
    "amount_krw" REAL NOT NULL,
    "fx_rate" REAL NOT NULL,
    "drawdown_pct" REAL NOT NULL,
    "filled_qty" REAL,
    "filled_price" REAL,
    "filled_at" TEXT,
    "toss_order_id" TEXT,
    "state_applied" BOOLEAN,
    "dry_run" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dca_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "dca_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_dca_orders" ("account_id", "amount_krw", "created_at", "drawdown_pct", "dry_run", "error", "filled_at", "filled_price", "filled_qty", "fx_rate", "id", "kind", "order_type", "price", "quantity", "side", "state_applied", "status", "symbol", "tif", "toss_order_id", "trade_date") SELECT "account_id", "amount_krw", "created_at", "drawdown_pct", "dry_run", "error", "filled_at", "filled_price", "filled_qty", "fx_rate", "id", "kind", "order_type", "price", "quantity", "side", "state_applied", "status", "symbol", "tif", "toss_order_id", "trade_date" FROM "dca_orders";
DROP TABLE "dca_orders";
ALTER TABLE "new_dca_orders" RENAME TO "dca_orders";
CREATE INDEX "dca_orders_account_id_trade_date_idx" ON "dca_orders"("account_id", "trade_date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
