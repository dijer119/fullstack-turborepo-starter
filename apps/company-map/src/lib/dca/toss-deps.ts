// 토스 클라이언트 → DCA 실행 의존성. 순수 함수(직전 종가 선택·제출 가드)는 테스트 대상.
// 일봉 count는 200이 상한이다 — 300 이상은 토스가 "요청이 올바르지 않습니다"로 거부한다(2026-08-27 실측).
import {
  createOrder,
  getBuyingPower,
  getDailyCandles,
  getDefaultAccountSeq,
  getExchangeRate,
  getOrders,
  getPrices,
} from "@/lib/toss/client";

/** 토스 일봉 조회 상한. peak 시딩 범위(약 10개월)를 결정한다. */
export const PEAK_SEED_COUNT = 200;

/** before(미포함) 직전 거래일의 날짜·종가. 순수 함수 — 테스트 대상. */
export function pickPrevTradeClose(
  candles: Array<{ date: string; close: number }>,
  before: string,
): { date: string; close: number } | null {
  const prev = candles
    .filter((c) => c.date < before)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return prev ? { date: prev.date, close: prev.close } : null;
}

/** 실주문 직전 방어 가드 — 비정상 주문이 브로커로 나가지 않게 throw. 정수 수량만 허용. */
export function assertSubmittable(o: { price: number; quantity: number }): void {
  if (!Number.isFinite(o.quantity) || o.quantity <= 0 || !Number.isInteger(o.quantity)) {
    throw new Error(`invalid order quantity: ${o.quantity}`);
  }
  if (!Number.isFinite(o.price) || o.price <= 0) {
    throw new Error(`invalid LOC price: ${o.price}`);
  }
}

export function tossDcaDeps() {
  return {
    getDefaultAccountSeq,

    async getDailyCandle(symbol: string, date: string) {
      const candles = await getDailyCandles(symbol, PEAK_SEED_COUNT);
      const c = candles.find((x) => x.date === date);
      return c ? { close: c.close, high: c.high } : null;
    },

    async getPrevTradeClose(symbol: string, before: string) {
      const candles = await getDailyCandles(symbol, PEAK_SEED_COUNT);
      return pickPrevTradeClose(candles, before);
    },

    async getCurrentPrice(symbol: string): Promise<number> {
      const [p] = await getPrices([symbol]);
      return Number(p?.lastPrice ?? 0);
    },

    getUsdKrw(): Promise<number> {
      return getExchangeRate("USD", "KRW");
    },

    getBuyingPowerUsd(accountSeq: number): Promise<number> {
      return getBuyingPower(accountSeq, "USD");
    },

    async getClosedOrders(accountSeq: number, symbol: string, from: string) {
      const orders = await getOrders(accountSeq, { status: "CLOSED", symbol, from });
      return orders.map((o) => ({
        orderId: o.orderId,
        filledQuantity: o.filledQuantity,
        averageFilledPrice: o.averageFilledPrice ?? null,
      }));
    },

    async submitOrder(
      accountSeq: number,
      o: { price: number; quantity: number },
      symbol: string,
    ): Promise<{ tossOrderId: string }> {
      assertSubmittable(o);
      const r = await createOrder(accountSeq, {
        symbol,
        side: "BUY",
        orderType: "LIMIT",
        quantity: String(o.quantity),
        price: String(o.price),
        timeInForce: "CLS",
      });
      return { tossOrderId: r.orderId };
    },
  };
}

export const isDcaKilled = (): boolean => process.env.DCA_DISABLED === "1";
