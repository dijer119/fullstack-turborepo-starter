-- AlterTable
ALTER TABLE "financial_snapshots" ADD COLUMN "net_income" BIGINT;
ALTER TABLE "financial_snapshots" ADD COLUMN "net_income_yoy_base" BIGINT;
ALTER TABLE "financial_snapshots" ADD COLUMN "net_income_yoy_pct" REAL;
