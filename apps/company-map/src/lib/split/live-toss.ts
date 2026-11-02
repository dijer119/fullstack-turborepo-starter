import type { PrismaClient } from "@prisma-clients/company-map";
import {
  createOrder,
  getAccounts,
  getDefaultAccountSeq,
  getOrder,
  getPrices,
  getHoldings,
  getBuyingPower,
  getSellableQuantity,
  getOrders,
  getStocksInfo,
  getMarketCalendarKR,
  getMarketCalendarUS,
  getExchangeRate,
  TossApiError,
} from "@/lib/toss/client";
import type { LiveDeps } from "./live-run";

export function tickSizeKR(price: number, securityType: string) {
  if (["ETF", "ETN"].includes(securityType)) return price < 2000 ? 1 : 5;
  if (!["STOCK", "REIT"].includes(securityType))
    throw new Error("국내 종목 유형의 호가 단위를 확인할 수 없습니다.");
  return price < 2000
    ? 1
    : price < 5000
      ? 5
      : price < 20000
        ? 10
        : price < 50000
          ? 50
          : price < 200000
            ? 100
            : price < 500000
              ? 500
              : 1000;
}

export function tossLiveDeps(db: PrismaClient): LiveDeps {
  return {
    now: () => new Date(),
    killed: () => process.env.SPLIT_LIVE_DISABLED === "1",
    async detail(account, id) {
      const detail = await getOrder(account, id);
      await new Promise((resolve) => setTimeout(resolve, 220));
      return detail;
    },
    async snapshot(s) {
      const accounts = await getAccounts();
      if (
        !accounts.some(
          (a) => a.accountSeq === s.accountSeq && a.accountType === "BROKERAGE",
        )
      )
        throw new Error("선택한 일반 위탁계좌에 접근할 수 없습니다.");
      const currency = s.market === "KR" ? "KRW" : "USD";
      const [info] = await getStocksInfo([s.symbol]);
      if (
        !info ||
        info.symbol !== s.symbol ||
        info.currency !== currency ||
        info.status !== "ACTIVE"
      )
        throw new Error("종목·통화·거래 상태를 확인하세요.");
      const [quote] = await getPrices([s.symbol]);
      if (!quote || quote.symbol !== s.symbol || quote.currency !== currency)
        throw new Error("종목·통화의 시세가 일치하지 않습니다.");
      const price = Number(quote.lastPrice);
      const tick =
        s.market === "KR"
          ? tickSizeKR(price, info.securityType ?? "")
          : undefined;
      const calendar =
        s.market === "KR"
          ? await getMarketCalendarKR()
          : await getMarketCalendarUS();
      const now = Date.now();
      let sessionEndsAt: Date | null = null;
      for (const day of [
        calendar.previousBusinessDay,
        calendar.today,
        calendar.nextBusinessDay,
      ]) {
        if (!day) continue;
        const session =
          "integrated" in day
            ? day.integrated?.regularMarket
            : day.regularMarket;
        if (
          session &&
          now >= Date.parse(session.startTime) &&
          now < Date.parse(session.endTime)
        )
          sessionEndsAt = new Date(session.endTime);
        // The integrated calendar also includes KRX-only hours. Require both
        // NXT eligibility and its auction-end marker before continuous trading.
        const after = s.market === "KR" && "integrated" in day
          ? day.integrated?.afterMarket
          : null;
        if (
          !sessionEndsAt &&
          info.koreanMarketDetail?.nxtSupported === true &&
          info.koreanMarketDetail.nxtTradingSuspended === false &&
          after?.singlePriceAuctionEndTime &&
          now >= Math.max(
            Date.parse(after.startTime),
            Date.parse(after.singlePriceAuctionEndTime),
          ) &&
          now < Date.parse(after.endTime)
        )
          sessionEndsAt = new Date(after.endTime);
      }
      const holdings = await getHoldings(s.accountSeq);
      const held = holdings.items.find((item) => item.symbol === s.symbol);
      if (held && held.currency !== currency)
        throw new Error("보유 종목 통화가 일치하지 않습니다.");
      const open = await getOrders(s.accountSeq, {
        status: "OPEN",
        symbol: s.symbol,
      });
      const buyingPower = await getBuyingPower(s.accountSeq, currency);
      const sellableQty = await getSellableQuantity(s.accountSeq, s.symbol);
      const defaultSeq = await getDefaultAccountSeq();
      const accountMatch = {
        OR: [
          { accountSeq: s.accountSeq },
          ...(defaultSeq === s.accountSeq ? [{ accountSeq: null }] : []),
        ],
      };
      const infinite = await db.infiniteBuyCycle.findFirst({
        select: { id: true },
        where: {
          dryRun: false,
          symbol: s.symbol,
          AND: [
            accountMatch,
            {
              OR: [
                { status: "active" },
                {
                  orders: {
                    some: {
                      dryRun: false,
                      status: {
                        in: ["submitted", "submitting", "submit_unknown"],
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      });
      const dca = await db.dcaAccount.findFirst({
        select: { id: true },
        where: {
          dryRun: false,
          AND: [
            accountMatch,
            { OR: [{ baseSymbol: s.symbol }, { leverSymbol: s.symbol }] },
            {
              OR: [
                { status: "active" },
                {
                  orders: {
                    some: {
                      dryRun: false,
                      status: {
                        in: ["submitted", "submitting", "submit_unknown"],
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      });
      return {
        price,
        observedAt: new Date(quote.timestamp),
        isOpen: sessionEndsAt !== null,
        sessionEndsAt,
        holdingQty: held ? Number(held.quantity) : 0,
        buyingPower,
        sellableQty,
        openOrderIds: open.map((order) => order.orderId),
        conflict:
          infinite || dca
            ? "같은 계좌·종목을 기존 자동매매 전략이 관리 중입니다."
            : null,
        tickSize: tick,
      };
    },
    async submit(s, o, validUntil) {
      const invalid = (text: string): never => {
        throw new TossApiError(
          422,
          JSON.stringify({ error: { code: "split-preflight", message: text } }),
        );
      };
      if (
        !["BUY", "SELL"].includes(o.side) ||
        !Number.isSafeInteger(o.quantity) ||
        o.quantity <= 0 ||
        !Number.isFinite(o.price) ||
        o.price <= 0 ||
        !/^[A-Za-z0-9_-]{1,36}$/.test(o.clientOrderId)
      )
        invalid("실거래 주문 값이 올바르지 않습니다.");
      const fx = s.market === "KR" ? 1 : await getExchangeRate("USD", "KRW");
      if (
        !Number.isFinite(fx) ||
        fx <= 0 ||
        o.quantity * o.price * fx >= 100000000
      )
        invalid("1억원 이상 주문은 자동 확인하지 않습니다.");
      const result = await createOrder(
        s.accountSeq,
        {
          symbol: s.symbol,
          side: o.side as "BUY" | "SELL",
          orderType: "LIMIT",
          timeInForce: "DAY",
          quantity: String(o.quantity),
          price: String(o.price),
          clientOrderId: o.clientOrderId,
        },
        s.id,
        validUntil,
      );
      return { orderId: result.orderId };
    },
  };
}
