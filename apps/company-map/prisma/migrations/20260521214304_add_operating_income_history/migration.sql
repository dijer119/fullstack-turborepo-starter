-- CreateTable
CREATE TABLE "operating_income_history" (
    "code" TEXT NOT NULL,
    "bsns_year" INTEGER NOT NULL,
    "reprt_code" TEXT NOT NULL,
    "thstrm" BIGINT,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("code", "bsns_year", "reprt_code"),
    CONSTRAINT "operating_income_history_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "operating_income_history_code_bsns_year_idx" ON "operating_income_history"("code", "bsns_year");
