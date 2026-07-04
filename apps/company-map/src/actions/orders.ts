"use server";

import { revalidatePath } from "next/cache";
import {
  createOrder,
  getBuyingPower,
  getDefaultAccountSeq,
  getOrderbook,
  getSellableQuantity,
  isTossConfigured,
  TossApiError,
  type OrderSide,
  type OrderType,
} from "@/lib/toss/client";

// 주문 폼에 채울 side별 가용치 (매수: 가능금액 / 매도: 가능수량).
export interface OrderAvailability {
  side: OrderSide;
  currency: "KRW" | "USD";
  // 매수면 현금 매수가능금액, 매도면 매도가능수량
  value: number;
  kind: "amount" | "quantity";
}

export async function getOrderAvailability(
  symbol: string,
  side: OrderSide,
  currency: "KRW" | "USD",
): Promise<{ ok: true; data: OrderAvailability } | { ok: false; reason: string }> {
  if (!isTossConfigured()) {
    return { ok: false, reason: "토스 API가 설정되지 않았습니다." };
  }
  try {
    const accountSeq = await getDefaultAccountSeq();
    if (side === "BUY") {
      const value = await getBuyingPower(accountSeq, currency);
      return { ok: true, data: { side, currency, value, kind: "amount" } };
    }
    const value = await getSellableQuantity(accountSeq, symbol);
    return { ok: true, data: { side, currency, value, kind: "quantity" } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg };
  }
}

export interface OrderbookLevelView {
  price: number;
  volume: number;
}
export interface OrderbookView {
  currency: "KRW" | "USD";
  asks: OrderbookLevelView[]; // 오름차순 (asks[0]=최우선 매도호가)
  bids: OrderbookLevelView[]; // 내림차순 (bids[0]=최우선 매수호가)
}

// 호가 조회 (읽기 전용). 주문 모달의 호가창용.
export async function fetchOrderbook(
  symbol: string,
): Promise<{ ok: true; data: OrderbookView } | { ok: false; reason: string }> {
  if (!isTossConfigured()) {
    return { ok: false, reason: "토스 API가 설정되지 않았습니다." };
  }
  try {
    const ob = await getOrderbook(symbol);
    const map = (l: { price: string; volume: string }) => ({
      price: Number(l.price),
      volume: Number(l.volume),
    });
    return {
      ok: true,
      data: { currency: ob.currency, asks: ob.asks.map(map), bids: ob.bids.map(map) },
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export interface PlaceOrderInput {
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: string;
  price?: string;
  confirmHighValueOrder?: boolean;
}

export type PlaceOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: string; needHighValueConfirm?: boolean };

// 실제 주문 체결. UI의 확인 단계를 거친 뒤 호출됨.
export async function placeOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  if (!isTossConfigured()) {
    return { ok: false, reason: "토스 API가 설정되지 않았습니다." };
  }

  // 1차 검증 (서버 측 방어).
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, reason: "수량을 올바르게 입력하세요." };
  }
  if (input.orderType === "LIMIT") {
    const p = Number(input.price);
    if (!Number.isFinite(p) || p <= 0) {
      return { ok: false, reason: "지정가를 올바르게 입력하세요." };
    }
  }

  try {
    const accountSeq = await getDefaultAccountSeq();
    const result = await createOrder(accountSeq, {
      symbol: input.symbol,
      side: input.side,
      orderType: input.orderType,
      quantity: input.quantity,
      price: input.orderType === "LIMIT" ? input.price : undefined,
      confirmHighValueOrder: input.confirmHighValueOrder,
    });
    // 체결/잔고 변동 반영
    revalidatePath("/stocks/toss-holdings");
    return { ok: true, orderId: result.orderId };
  } catch (e) {
    if (e instanceof TossApiError) {
      // 1억원 이상 주문은 재확인 필요 — UI에서 확인 후 confirmHighValueOrder=true로 재시도.
      if (e.code === "confirm-high-value-required") {
        return {
          ok: false,
          reason: "고액 주문(1억원 이상)입니다. 확인 후 다시 시도하세요.",
          needHighValueConfirm: true,
        };
      }
      return { ok: false, reason: `${e.message}${e.code ? ` (${e.code})` : ""}` };
    }
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
