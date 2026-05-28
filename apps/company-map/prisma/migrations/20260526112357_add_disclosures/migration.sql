-- CreateTable
CREATE TABLE "disclosures" (
    "rcp_no" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "corp_code" TEXT NOT NULL,
    "report_nm" TEXT NOT NULL,
    "pblntf_ty" TEXT NOT NULL,
    "rcept_dt" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "payload" TEXT,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "disclosures_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "disclosures_code_rcept_dt_idx" ON "disclosures"("code", "rcept_dt");

-- CreateIndex
CREATE INDEX "disclosures_category_idx" ON "disclosures"("category");
