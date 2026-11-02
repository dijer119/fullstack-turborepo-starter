ALTER TABLE "split_live_strategies" ADD COLUMN "budgetMode" TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE "split_live_strategies" ADD COLUMN "budgetMultiplier" REAL NOT NULL DEFAULT 1;
