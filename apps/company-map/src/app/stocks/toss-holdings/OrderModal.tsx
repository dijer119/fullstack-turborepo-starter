"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  fetchOrderbook,
  getOrderAvailability,
  placeOrder,
  type OrderAvailability,
  type OrderbookView,
} from "@/actions/orders";
import type { OrderSide, OrderType } from "@/lib/toss/client";

function fmtMoney(currency: "KRW" | "USD", v: number): string {
  if (currency === "USD") {
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₩${Math.round(v).toLocaleString("ko-KR")}`;
}

function fmtQty(v: number): string {
  return Number.isInteger(v)
    ? v.toLocaleString()
    : v.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

interface OrderModalProps {
  symbol: string;
  name: string;
  currency: "KRW" | "USD";
  lastPrice: number | null;
  defaultSide: OrderSide;
  onClose: () => void;
}

function OrderModal({
  symbol,
  name,
  currency,
  lastPrice,
  defaultSide,
  onClose,
}: OrderModalProps) {
  const router = useRouter();
  const [side, setSide] = useState<OrderSide>(defaultSide);
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(lastPrice != null ? String(lastPrice) : "");
  // 가용치: 어떤 side로 조회됐는지 함께 저장해, side 변경 직후 stale 표시를 구분.
  const [availState, setAvailState] = useState<{
    side: OrderSide;
    data?: OrderAvailability;
    error?: string;
  } | null>(null);
  const [orderbook, setOrderbook] = useState<OrderbookView | null>(null);
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [doneOrderId, setDoneOrderId] = useState<string | null>(null);
  const [highValue, setHighValue] = useState(false);
  const [submitting, startSubmit] = useTransition();

  // side 변경 시 가용치(매수가능금액/매도가능수량) 재조회. setState는 await 이후 1회만.
  useEffect(() => {
    let active = true;
    (async () => {
      const r = await getOrderAvailability(symbol, side, currency);
      if (!active) return;
      setAvailState(r.ok ? { side, data: r.data } : { side, error: r.reason });
    })();
    return () => {
      active = false;
    };
  }, [side, symbol, currency]);

  // 호가 조회 (symbol 단위, 1회). setState는 await 이후.
  useEffect(() => {
    let active = true;
    (async () => {
      const r = await fetchOrderbook(symbol);
      if (active && r.ok) setOrderbook(r.data);
    })();
    return () => {
      active = false;
    };
  }, [symbol]);

  // 현재 side에 해당하는 가용치만 사용 (다른 side 응답은 무시).
  const availCurrent = availState?.side === side ? availState : null;
  const avail = availCurrent?.data ?? null;
  const availErr = availCurrent?.error ?? null;
  const availLoading = availCurrent == null;

  const qtyNum = Number(qty);
  const priceNum = Number(price);
  const estPrice = orderType === "LIMIT" ? priceNum : (lastPrice ?? 0);
  const estAmount =
    Number.isFinite(qtyNum) && qtyNum > 0 && estPrice > 0 ? qtyNum * estPrice : 0;

  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0;
  const priceValid = orderType === "MARKET" || (Number.isFinite(priceNum) && priceNum > 0);
  const formValid = qtyValid && priceValid;

  // 가용치 초과 경고 (하드 차단은 아님 — 토스가 최종 검증).
  const overWarn =
    avail == null
      ? null
      : side === "BUY" && avail.kind === "amount" && estAmount > avail.value
        ? `예상 금액이 매수가능금액(${fmtMoney(currency, avail.value)})을 초과합니다.`
        : side === "SELL" && avail.kind === "quantity" && qtyValid && qtyNum > avail.value
          ? `수량이 매도가능수량(${fmtQty(avail.value)})을 초과합니다.`
          : null;

  const sideKo = side === "BUY" ? "매수" : "매도";
  const sideColor = side === "BUY" ? "rose" : "blue";

  const submit = (confirmHighValueOrder = false) =>
    startSubmit(async () => {
      setError(null);
      const r = await placeOrder({
        symbol,
        side,
        orderType,
        quantity: qty,
        price: orderType === "LIMIT" ? price : undefined,
        confirmHighValueOrder,
      });
      if (r.ok) {
        setDoneOrderId(r.orderId);
        setStep("done");
        router.refresh();
      } else if (r.needHighValueConfirm) {
        setHighValue(true);
        setStep("confirm");
        setError(r.reason);
      } else {
        setError(r.reason);
        setStep("form");
      }
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">
              {name} <span className="text-sm font-normal text-gray-400">{symbol}</span>
            </h2>
            <p className="text-xs text-gray-500">
              현재가 {lastPrice != null ? fmtMoney(currency, lastPrice) : "—"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {step === "done" ? (
          <div className="space-y-4">
            <div className="rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200">
              ✅ {sideKo} 주문이 접수되었습니다.
              <div className="mt-1 break-all text-xs text-green-700 dark:text-green-300">
                주문번호: {doneOrderId}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-700"
            >
              닫기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 매수/매도 토글 */}
            <div className="grid grid-cols-2 gap-2">
              {(["BUY", "SELL"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSide(s);
                    setStep("form");
                    setError(null);
                    setHighValue(false);
                  }}
                  className={`rounded-md border px-3 py-2 text-sm font-medium ${
                    side === s
                      ? s === "BUY"
                        ? "border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-400 dark:bg-rose-900/30 dark:text-rose-300"
                        : "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300"
                      : "border-gray-300 text-gray-500 dark:border-gray-700"
                  }`}
                >
                  {s === "BUY" ? "매수" : "매도"}
                </button>
              ))}
            </div>

            {/* 주문유형 */}
            <div className="flex gap-2 text-sm">
              {(["LIMIT", "MARKET"] as const).map((t) => (
                <label key={t} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="orderType"
                    checked={orderType === t}
                    onChange={() => {
                      setOrderType(t);
                      setStep("form");
                    }}
                  />
                  {t === "LIMIT" ? "지정가" : "시장가"}
                </label>
              ))}
            </div>

            {/* 가용치 */}
            <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {availLoading ? (
                "가용치 조회 중…"
              ) : availErr ? (
                <span className="text-red-600 dark:text-red-400">가용치 조회 실패: {availErr}</span>
              ) : avail == null ? (
                "—"
              ) : side === "BUY" ? (
                <>매수가능금액: <b>{fmtMoney(currency, avail.value)}</b></>
              ) : (
                <>매도가능수량: <b>{fmtQty(avail.value)}</b></>
              )}
            </div>

            {/* 호가창 (클릭 시 지정가 입력) */}
            {orderbook && (orderbook.asks.length > 0 || orderbook.bids.length > 0) && (
              <div className="rounded-md border border-gray-200 dark:border-gray-700">
                <div className="border-b border-gray-200 px-2 py-1 text-[11px] text-gray-500 dark:border-gray-700">
                  호가 (클릭 시 지정가 입력) · 좌:가격 우:잔량
                </div>
                {(() => {
                  const asks = orderbook.asks.slice(0, 5);
                  const bids = orderbook.bids.slice(0, 5);
                  const maxVol = Math.max(
                    1,
                    ...asks.map((a) => a.volume),
                    ...bids.map((b) => b.volume),
                  );
                  const Row = ({ l, isAsk }: { l: { price: number; volume: number }; isAsk: boolean }) => (
                    <button
                      type="button"
                      onClick={() => {
                        setOrderType("LIMIT");
                        setPrice(String(l.price));
                        setStep("form");
                      }}
                      className="relative flex w-full items-center justify-between px-2 py-0.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <span
                        className={`absolute inset-y-0 right-0 ${
                          isAsk
                            ? "bg-rose-100 dark:bg-rose-900/20"
                            : "bg-blue-100 dark:bg-blue-900/20"
                        }`}
                        style={{ width: `${(l.volume / maxVol) * 100}%` }}
                      />
                      <span
                        className={`relative z-10 tabular-nums font-medium ${
                          isAsk
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {fmtMoney(currency, l.price)}
                      </span>
                      <span className="relative z-10 tabular-nums text-gray-400">
                        {l.volume.toLocaleString()}
                      </span>
                    </button>
                  );
                  return (
                    <div>
                      {[...asks].reverse().map((l) => (
                        <Row key={`a-${l.price}`} l={l} isAsk />
                      ))}
                      <div className="border-t border-gray-200 dark:border-gray-700" />
                      {bids.map((l) => (
                        <Row key={`b-${l.price}`} l={l} isAsk={false} />
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 수량 */}
            <label className="block text-sm">
              <span className="text-gray-500">수량</span>
              <input
                type="number"
                step="any"
                min="0"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setStep("form");
                }}
                placeholder="수량"
                className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            {/* 가격 (지정가) */}
            {orderType === "LIMIT" && (
              <label className="block text-sm">
                <span className="text-gray-500">지정가 ({currency})</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setStep("form");
                  }}
                  placeholder="가격"
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            )}

            {/* 예상 금액 */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">
                예상 금액{orderType === "MARKET" ? " (현재가 기준)" : ""}
              </span>
              <span className="font-medium tabular-nums">
                {estAmount > 0 ? fmtMoney(currency, estAmount) : "—"}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              수수료: {currency === "KRW" ? "국내 0%" : "미국 0.1%"} (참고)
            </p>

            {overWarn && (
              <p className="text-xs text-amber-600 dark:text-amber-400">⚠ {overWarn}</p>
            )}
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}

            {step === "form" ? (
              <button
                type="button"
                disabled={!formValid}
                onClick={() => {
                  setError(null);
                  setStep("confirm");
                }}
                className={`w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  sideColor === "rose"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {sideKo} 주문 확인
              </button>
            ) : (
              <div className="space-y-2 rounded-md border border-gray-300 p-3 dark:border-gray-600">
                <p className="text-sm font-medium">아래 내용으로 {sideKo} 주문할까요?</p>
                <ul className="space-y-0.5 text-sm text-gray-600 dark:text-gray-300">
                  <li>종목: {name} ({symbol})</li>
                  <li>구분: <b>{sideKo}</b> · {orderType === "LIMIT" ? "지정가" : "시장가"}</li>
                  <li>수량: {qty}</li>
                  {orderType === "LIMIT" && <li>가격: {fmtMoney(currency, priceNum)}</li>}
                  <li>예상 금액: {estAmount > 0 ? fmtMoney(currency, estAmount) : "—"}</li>
                  {highValue && (
                    <li className="text-amber-600 dark:text-amber-400">
                      고액 주문(1억원 이상) 확인이 필요합니다.
                    </li>
                  )}
                </ul>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setStep("form");
                      setHighValue(false);
                    }}
                    className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => submit(highValue)}
                    className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                      sideColor === "rose"
                        ? "bg-rose-600 hover:bg-rose-700"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {submitting ? "주문 중…" : `${sideKo} 확정`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function OrderButton({
  symbol,
  name,
  currency,
  lastPrice,
  defaultSide = "BUY",
  className,
}: {
  symbol: string;
  name: string;
  currency: "KRW" | "USD";
  lastPrice: number | null;
  defaultSide?: OrderSide;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        }
      >
        주문
      </button>
      {open && (
        <OrderModal
          symbol={symbol}
          name={name}
          currency={currency}
          lastPrice={lastPrice}
          defaultSide={defaultSide}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
