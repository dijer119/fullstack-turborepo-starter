import {
  getDefaultAccountSeq, getHoldings, getPrices, getBuyingPower, createOrder,
} from "@/lib/toss/client";
import type { PrismaClient } from "@prisma-clients/company-map";
import type { RunDeps, RunPersistence, HoldingSnapshot, OrderLog } from "./run";
import type { IntendedOrder } from "./strategy";

// 토스 클라이언트 → RunDeps. profitLoss.rate는 소수(0.05=5%)라 *100 하여 %로 변환.
export function tossRunDeps(): RunDeps {
  return {
    getDefaultAccountSeq,
    async getHoldingForSymbol(accountSeq, symbol): Promise<HoldingSnapshot | null> {
      const overview = await getHoldings(accountSeq);
      const item = overview.items.find((i) => i.symbol === symbol);
      if (!item) return null;
      return {
        avgPrice: Number(item.averagePurchasePrice),
        quantity: Number(item.quantity),
        currentPrice: Number(item.lastPrice),
        pnlPct: Number(item.profitLoss.rate) * 100,
      };
    },
    async getCurrentPrice(symbol): Promise<number> {
      const [p] = await getPrices([symbol]);
      return Number(p?.lastPrice ?? 0);
    },
    getBuyingPowerUsd(accountSeq): Promise<number> {
      return getBuyingPower(accountSeq, "USD");
    },
    async submitOrder(accountSeq, o: IntendedOrder, symbol) {
      const r = await createOrder(accountSeq, {
        symbol,
        side: o.side,
        orderType: o.orderType,
        quantity: String(o.quantity),
        price: o.orderType === "LIMIT" ? String(o.price) : undefined,
        timeInForce: o.tif,
      });
      return { tossOrderId: r.orderId };
    },
  };
}

// Prisma db → RunPersistence.
export function prismaPersistence(db: PrismaClient): RunPersistence {
  return {
    async logOrder(o: OrderLog) {
      await db.infiniteBuyOrder.create({
        data: {
          cycleId: o.cycleId, tradeDate: o.tradeDate, round: o.round, side: o.side,
          kind: o.kind, orderType: o.orderType, tif: o.tif, price: o.price,
          quantity: o.quantity, tossOrderId: o.tossOrderId, dryRun: o.dryRun,
          status: o.status, error: o.error,
        },
      });
    },
    async updateCycle(id, data) {
      await db.infiniteBuyCycle.update({ where: { id }, data });
    },
  };
}

export const isKilled = (): boolean => process.env.INFINITE_BUY_DISABLED === "1";
