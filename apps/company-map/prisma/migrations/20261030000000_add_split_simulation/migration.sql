CREATE TABLE "split_simulations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "symbol" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "market" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "initial_cash" REAL NOT NULL,
  "cash" REAL NOT NULL,
  "tranche_budget" REAL NOT NULL,
  "max_tranches" INTEGER NOT NULL,
  "buy_drop_pct" REAL NOT NULL,
  "take_profit_pct" REAL NOT NULL,
  "fee_pct" REAL NOT NULL DEFAULT 0,
  "sell_tax_pct" REAL NOT NULL DEFAULT 0,
  "dry_run" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'active',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "step_count" INTEGER NOT NULL DEFAULT 0,
  "last_price" REAL,
  "last_observed_at" DATETIME,
  "note" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE TABLE "split_lots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "simulation_id" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "generation" INTEGER NOT NULL,
  "anchor_price" REAL NOT NULL,
  "buy_price" REAL NOT NULL,
  "quantity" INTEGER NOT NULL,
  "remaining_qty" INTEGER NOT NULL,
  "buy_cost" REAL NOT NULL,
  "buy_fee" REAL NOT NULL,
  "sell_price" REAL,
  "sell_fee" REAL NOT NULL DEFAULT 0,
  "sell_tax" REAL NOT NULL DEFAULT 0,
  "realized_pnl" REAL NOT NULL DEFAULT 0,
  "opened_step" INTEGER NOT NULL,
  "closed_step" INTEGER,
  CONSTRAINT "split_lots_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "split_simulations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "split_lots_simulation_id_slot_generation_key" ON "split_lots"("simulation_id", "slot", "generation");

CREATE TABLE "split_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "simulation_id" TEXT NOT NULL,
  "request_key" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "input_json" TEXT NOT NULL,
  "fill_count" INTEGER NOT NULL,
  "observed_at" DATETIME NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "split_runs_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "split_simulations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "split_runs_simulation_id_request_key_key" ON "split_runs"("simulation_id", "request_key");
CREATE INDEX "split_runs_simulation_id_created_at_idx" ON "split_runs"("simulation_id", "created_at");
