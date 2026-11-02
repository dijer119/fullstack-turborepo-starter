-- CreateTable
CREATE TABLE "split_live_strategies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSeq" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "initialCash" REAL NOT NULL,
    "cash" REAL NOT NULL,
    "trancheBudget" REAL NOT NULL,
    "maxTranches" INTEGER NOT NULL,
    "buyDropPct" REAL NOT NULL,
    "takeProfitPct" REAL NOT NULL,
    "feeBufferPct" REAL NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'paused',
    "note" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" DATETIME,
    "lastCheckedAt" DATETIME,
    "lastPrice" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "split_live_lots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "generation" INTEGER NOT NULL,
    "boughtQty" INTEGER NOT NULL DEFAULT 0,
    "boughtAmount" REAL NOT NULL DEFAULT 0,
    "buyFees" REAL NOT NULL DEFAULT 0,
    "buyTax" REAL NOT NULL DEFAULT 0,
    "soldQty" INTEGER NOT NULL DEFAULT 0,
    "soldAmount" REAL NOT NULL DEFAULT 0,
    "sellFees" REAL NOT NULL DEFAULT 0,
    "sellTax" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "split_live_lots_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "split_live_strategies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "split_live_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "clientOrderId" TEXT NOT NULL,
    "tossOrderId" TEXT,
    "side" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitting',
    "brokerStatus" TEXT,
    "lastSyncedAt" DATETIME,
    "filledQty" INTEGER NOT NULL DEFAULT 0,
    "filledAmount" REAL NOT NULL DEFAULT 0,
    "commission" REAL NOT NULL DEFAULT 0,
    "tax" REAL NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "split_live_orders_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "split_live_strategies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "split_live_orders_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "split_live_lots" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "split_symbol_owners" (
    "accountSeq" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,

    PRIMARY KEY ("accountSeq", "symbol")
);

-- CreateIndex
CREATE UNIQUE INDEX "split_live_lots_strategyId_slot_generation_key" ON "split_live_lots"("strategyId", "slot", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "split_live_orders_clientOrderId_key" ON "split_live_orders"("clientOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "split_live_orders_tossOrderId_key" ON "split_live_orders"("tossOrderId");

-- CreateIndex
CREATE INDEX "split_live_orders_strategyId_status_idx" ON "split_live_orders"("strategyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "split_live_orders_strategyId_sequence_key" ON "split_live_orders"("strategyId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "split_symbol_owners_strategyId_key" ON "split_symbol_owners"("strategyId");
