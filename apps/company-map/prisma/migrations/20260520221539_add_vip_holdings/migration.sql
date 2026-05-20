-- CreateTable
CREATE TABLE "vip_holdings" (
    "rcp_no" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT,
    "corp_code" TEXT NOT NULL,
    "corp_name" TEXT NOT NULL,
    "report_nm" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "flr_nm" TEXT NOT NULL,
    "rcept_dt" DATETIME NOT NULL,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vip_holdings_code_fkey" FOREIGN KEY ("code") REFERENCES "stock_masters" ("code") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "vip_holdings_code_idx" ON "vip_holdings"("code");

-- CreateIndex
CREATE INDEX "vip_holdings_rcept_dt_idx" ON "vip_holdings"("rcept_dt");
