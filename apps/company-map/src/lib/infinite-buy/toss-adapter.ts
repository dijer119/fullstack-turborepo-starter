import {
  getDefaultAccountSeq, getHoldings, getPrices, getBuyingPower, createOrder, getOrders, getDailyCandles,
} from "@/lib/toss/client";
import type { PrismaClient } from "@prisma-clients/company-map";
import type { RunDeps, RunPersistence, HoldingSnapshot, OrderLog } from "./run";
import type { V4RunDeps } from "./run-v4";
import type { IntendedOrder } from "./strategy";

// 실주문 직전 방어 가드: 비정상 주문(수량/가격)이 실제 브로커로 가지 않도록 throw.
// run.ts가 throw를 잡아 status:"failed"로 로깅하므로 잘못된 주문은 제출되지 않는다.
export function assertSubmittable(o: IntendedOrder): void {
  if (!Number.isFinite(o.quantity) || o.quantity <= 0) {
    throw new Error(`invalid order quantity: ${o.quantity}`);
  }
  if (o.orderType === "LIMIT" && (o.price == null || !Number.isFinite(o.price) || o.price <= 0)) {
    throw new Error(`invalid LIMIT price: ${o.price}`);
  }
}

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
      assertSubmittable(o);
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
          quantity: o.quantity, avgCost: o.avgCost, tossOrderId: o.tossOrderId,
          dryRun: o.dryRun, status: o.status, error: o.error,
        },
      });
    },
    async updateCycle(id, data) {
      await db.infiniteBuyCycle.update({ where: { id }, data });
    },
  };
}

// 토스 클라이언트 → V4RunDeps. 기존 RunDeps에 체결 조회·일봉 1건 조회를 얹는다.
export function tossV4Deps(): V4RunDeps {
  return {
    ...tossRunDeps(),
    getClosedOrders(accountSeq, symbol, from) {
      return getOrders(accountSeq, { status: "CLOSED", symbol, from });
    },
    async getDailyCandle(symbol, date) {
      const candles = await getDailyCandles(symbol, 30);
      const c = candles.find((x) => x.date === date);
      return c ? { close: c.close, high: c.high } : null;
    },
  };
}

export const isKilled = (): boolean => process.env.INFINITE_BUY_DISABLED === "1";
