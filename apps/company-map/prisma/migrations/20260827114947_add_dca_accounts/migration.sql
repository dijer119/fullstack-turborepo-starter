-- CreateTable
CREATE TABLE "dca_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "base_symbol" TEXT NOT NULL DEFAULT 'QQQ',
    "lever_symbol" TEXT NOT NULL DEFAULT 'QLD',
    "account_seq" INTEGER,
    "threshold_pct" REAL NOT NULL DEFAULT 10,
    "daily_amount_krw" REAL NOT NULL DEFAULT 50000,
    "premium_pct" REAL NOT NULL DEFAULT 5,
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

-- CreateTable
CREATE TABLE "dca_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "trade_date" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "order_type" TEXT NOT NULL,
    "tif" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "quantity" REAL NOT NULL,
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

-- CreateIndex
CREATE INDEX "dca_orders_account_id_trade_date_idx" ON "dca_orders"("account_id", "trade_date");
