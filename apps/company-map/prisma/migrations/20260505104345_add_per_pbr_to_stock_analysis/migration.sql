-- AlterTable
ALTER TABLE "stock_analyses" ADD COLUMN "pbr" REAL;
ALTER TABLE "stock_analyses" ADD COLUMN "per" REAL;

-- CreateIndex
CREATE INDEX "stock_analyses_per_idx" ON "stock_analyses"("per");

-- CreateIndex
CREATE INDEX "stock_analyses_pbr_idx" ON "stock_analyses"("pbr");
