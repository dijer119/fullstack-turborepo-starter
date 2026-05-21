-- CreateTable
CREATE TABLE "financial_snapshots" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "latest_bsns_year" INTEGER NOT NULL,
    "latest_reprt_code" TEXT NOT NULL,
    "op_income" BIGINT,
    "op_income_yoy_base" BIGINT,
    "op_income_prev_report" BIGINT,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_snapshots_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);
