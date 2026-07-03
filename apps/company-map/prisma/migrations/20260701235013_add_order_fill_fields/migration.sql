-- AlterTable
ALTER TABLE "infinite_buy_orders" ADD COLUMN "filled_at" TEXT;
ALTER TABLE "infinite_buy_orders" ADD COLUMN "filled_price" REAL;
ALTER TABLE "infinite_buy_orders" ADD COLUMN "filled_qty" REAL;
