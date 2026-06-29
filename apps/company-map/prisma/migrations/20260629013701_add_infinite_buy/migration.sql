-- CreateTable
CREATE TABLE "infinite_buy_cycles" (
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
    "round" INTEGER NOT NULL DEFAULT 0,
    "last_run_date" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "infinite_buy_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycle_id" TEXT NOT NULL,
    "trade_date" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "order_type" TEXT NOT NULL,
    "tif" TEXT NOT NULL,
    "price" REAL,
    "quantity" REAL NOT NULL,
    "toss_order_id" TEXT,
    "dry_run" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "infinite_buy_orders_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "infinite_buy_cycles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "infinite_buy_orders_cycle_id_trade_date_idx" ON "infinite_buy_orders"("cycle_id", "trade_date");
