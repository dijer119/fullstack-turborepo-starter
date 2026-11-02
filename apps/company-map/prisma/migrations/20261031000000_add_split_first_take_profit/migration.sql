ALTER TABLE "split_live_strategies" ADD COLUMN "firstTakeProfitPct" REAL NOT NULL DEFAULT 10;
UPDATE "split_live_strategies" SET "firstTakeProfitPct" = "takeProfitPct";
