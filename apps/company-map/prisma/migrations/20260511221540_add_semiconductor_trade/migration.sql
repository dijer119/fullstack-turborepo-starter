-- CreateTable
CREATE TABLE "semiconductor_trades" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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

-- CreateIndex
CREATE INDEX "semiconductor_trades_year_month_idx" ON "semiconductor_trades"("year_month");

-- CreateIndex
CREATE INDEX "semiconductor_trades_hs_code_idx" ON "semiconductor_trades"("hs_code");

-- CreateIndex
CREATE UNIQUE INDEX "semiconductor_trades_year_month_hs_code_country_cd_key" ON "semiconductor_trades"("year_month", "hs_code", "country_cd");
