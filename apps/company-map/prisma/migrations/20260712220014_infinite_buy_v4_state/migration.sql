-- AlterTable
ALTER TABLE "infinite_buy_cycles" ADD COLUMN "cash_remaining" REAL;
ALTER TABLE "infinite_buy_cycles" ADD COLUMN "note" TEXT;
ALTER TABLE "infinite_buy_cycles" ADD COLUMN "star_base" REAL;
ALTER TABLE "infinite_buy_cycles" ADD COLUMN "t_value" REAL;

-- AlterTable
ALTER TABLE "infinite_buy_orders" ADD COLUMN "state_applied" BOOLEAN;
