-- Rename semiconductor_trades -> trade_stats with added `category` column.
-- Existing rows are backfilled with category = 'semiconductor'.

PRAGMA foreign_keys=OFF;

CREATE TABLE "trade_stats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL DEFAULT 'semiconductor',
    "year_month" TEXT NOT NULL,
    "hs_code" TEXT NOT NULL,
    "hs_code_name" TEXT,
    "country_cd" TEXT NOT NULL,
    "country_name" TEXT NOT NULL,
    "exp_dlr" BIGINT NOT NULL,
    "imp_dlr" BIGINT NOT NULL,
    "exp_wgt" BIGINT NOT NULL,
    "imp_wgt" BIGINT NOT NULL,
    "bal_payments" BIGINT NOT NULL,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "trade_stats" (
    "id", "category", "year_month", "hs_code", "hs_code_name",
    "country_cd", "country_name",
    "exp_dlr", "imp_dlr", "exp_wgt", "imp_wgt", "bal_payments", "fetched_at"
)
SELECT
    "id", 'semiconductor', "year_month", "hs_code", "hs_code_name",
    "country_cd", "country_name",
    "exp_dlr", "imp_dlr", "exp_wgt", "imp_wgt", "bal_payments", "fetched_at"
FROM "semiconductor_trades";

DROP TABLE "semiconductor_trades";

CREATE UNIQUE INDEX "trade_stats_category_year_month_hs_code_country_cd_key"
    ON "trade_stats"("category", "year_month", "hs_code", "country_cd");
CREATE INDEX "trade_stats_category_year_month_idx"
    ON "trade_stats"("category", "year_month");
CREATE INDEX "trade_stats_category_hs_code_idx"
    ON "trade_stats"("category", "hs_code");

PRAGMA foreign_keys=ON;
