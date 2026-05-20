-- AlterTable
ALTER TABLE "stock_masters" ADD COLUMN "market" TEXT;

-- CreateIndex
CREATE INDEX "stock_masters_market_idx" ON "stock_masters"("market");

-- CreateIndex
CREATE INDEX "stock_masters_marcap_idx" ON "stock_masters"("marcap");
