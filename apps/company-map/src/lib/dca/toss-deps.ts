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
import { isAmountOrderWindowOpen } from "./market-window";
import type { DcaRunDeps } from "./run-dca";

/** 토스 일봉 조회 상한. peak 시딩 범위(약 10개월)를 결정한다. */
export const PEAK_SEED_COUNT = 200;

/** 멱등성 키 문자 제약(토스 명세: 최대 36자, 영숫자·하이픈·언더스코어). */
const CLIENT_ORDER_ID_RE = /^[A-Za-z0-9\-_]+$/;

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

/**
 * 실주문 직전 방어 가드 — 비정상 주문이 브로커로 나가지 않게 throw.
 * 금액 기반 주문이므로 검증 대상은 수량이 아니라 "달러 금액과 멱등성 키"다.
 */
export function assertSubmittable(o: { amountUsd: number; clientOrderId: string }): void {
  if (!Number.isFinite(o.amountUsd) || o.amountUsd < 0.01) {
    throw new Error(`invalid order amount: ${o.amountUsd}`);
  }
  // 센트보다 잘게 쪼갠 금액은 토스가 거절한다. 부동소수 오차(1e-8 수준)는 통과시킨다.
  const cents = o.amountUsd * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-6) {
    throw new Error(`invalid order amount precision: ${o.amountUsd}`);
  }
  if (
    !o.clientOrderId ||
    o.clientOrderId.length > 36 ||
    !CLIENT_ORDER_ID_RE.test(o.clientOrderId)
  ) {
    throw new Error(`invalid clientOrderId: ${o.clientOrderId}`);
  }
}

export function tossDcaDeps(): DcaRunDeps {
  return {
    getDefaultAccountSeq,
    isAmountOrderWindowOpen,

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
      o: { amountUsd: number; clientOrderId: string },
      symbol: string,
    ): Promise<{ tossOrderId: string }> {
      assertSubmittable(o);
      // 금액 기반 분기에는 quantity·price·timeInForce가 아예 없다(client.ts의 oneOf 배타 타입).
      const r = await createOrder(accountSeq, {
        symbol,
        side: "BUY",
        orderType: "MARKET",
        orderAmount: String(o.amountUsd),
        clientOrderId: o.clientOrderId,
      });
      return { tossOrderId: r.orderId };
    },
  };
}

export const isDcaKilled = (): boolean => process.env.DCA_DISABLED === "1";
