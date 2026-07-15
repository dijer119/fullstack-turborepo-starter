-- CreateTable
CREATE TABLE "vr_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_seq" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'accumulate',
    "formula" TEXT NOT NULL DEFAULT 'skill',
    "g_value" REAL NOT NULL DEFAULT 10,
    "band_pct" REAL NOT NULL DEFAULT 15,
    "contribution" REAL NOT NULL DEFAULT 0,
    "pool_limit_mode" TEXT NOT NULL DEFAULT 'auto',
    "pool_limit_pct" REAL,
    "v_value" REAL NOT NULL,
    "pool" REAL NOT NULL,
    "start_date" TEXT NOT NULL,
    "cycle_index" INTEGER NOT NULL DEFAULT 0,
    "cycle_start_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "last_run_date" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "vr_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "cycle_index" INTEGER NOT NULL,
    "trade_date" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "order_type" TEXT NOT NULL,
    "tif" TEXT NOT NULL,
    "price" REAL,
    "quantity" REAL NOT NULL,
    "filled_qty" REAL,
    "filled_price" REAL,
    "filled_at" TEXT,
    "toss_order_id" TEXT,
    "state_applied" BOOLEAN,
    "dry_run" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vr_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "vr_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vr_cycle_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "cycle_index" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "v_value" REAL NOT NULL,
    "eval_amount" REAL NOT NULL,
    "pool" REAL NOT NULL,
    "contribution" REAL NOT NULL,
    "g_value" REAL NOT NULL,
    "pool_limit_pct" REAL NOT NULL,
    "holding_qty" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vr_cycle_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "vr_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "vr_orders_account_id_trade_date_idx" ON "vr_orders"("account_id", "trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "vr_cycle_logs_account_id_cycle_index_key" ON "vr_cycle_logs"("account_id", "cycle_index");
