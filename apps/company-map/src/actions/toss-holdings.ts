"use server";

import {
  getAccounts,
  getExchangeRate,
  getHoldings,
  isTossConfigured,
  TossNotConfiguredError,
  type TossAccountType,
} from "@/lib/toss/client";

export interface TossHoldingRow {
  symbol: string;
  name: string;
  marketCountry: "KR" | "US";
  currency: "KRW" | "USD";
  quantity: number;
  lastPrice: number;
  averagePurchasePrice: number;
  purchaseAmount: number; // 매입금액
  marketValue: number; // 평가금액
  profitLoss: number; // 평가손익
  profitLossRate: number; // 손익률 (0.07 = 7%)
  dailyProfitLoss: number; // 당일손익
  dailyProfitLossRate: number;
  previousClose: number | null; // 전일종가 (당일손익률로 역산)
}

export interface TossMoney {
  krw: number;
  usd: number;
}

export interface TossHoldingsSummary {
  totalPurchase: TossMoney;
  marketValue: TossMoney;
  profitLoss: TossMoney;
  profitLossRate: number;
  dailyProfitLoss: TossMoney;
  dailyProfitLossRate: number;
}

export type TossHoldingsResult =
  | { status: "not_configured" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      account: { accountNo: string; accountSeq: number; accountType: TossAccountType };
      summary: TossHoldingsSummary;
      rows: TossHoldingRow[];
      usdKrwRate: number; // USD→KRW 환율 (합산 환산용). 환율 조회 실패 시 0.
    };

const num = (s: string | null | undefined): number => {
  if (s == null) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const money = (m: { krw: string; usd: string | null }): TossMoney => ({
  krw: num(m.krw),
  usd: num(m.usd),
});

export async function getTossHoldings(): Promise<TossHoldingsResult> {
  if (!isTossConfigured()) return { status: "not_configured" };

  try {
    const accounts = await getAccounts();
    if (accounts.length === 0) {
      return { status: "error", message: "토스증권 계좌가 없습니다." };
    }
    // 계좌 선택: TOSS_ACCOUNT_SEQ 환경변수 우선, 없으면 첫 계좌.
    const envSeq = Number(process.env.TOSS_ACCOUNT_SEQ);
    const account =
      (Number.isFinite(envSeq) &&
        accounts.find((a) => a.accountSeq === envSeq)) ||
      accounts[0];

    const ov = await getHoldings(account.accountSeq);

    // USD 보유분이 있을 때만 환율 조회 (불필요한 호출·rate limit 절약). 실패해도 본문은 표시.
    let usdKrwRate = 0;
    if (ov.items.some((it) => it.currency === "USD")) {
      try {
        usdKrwRate = await getExchangeRate("USD", "KRW");
      } catch (e) {
        console.warn("[toss-holdings] 환율 조회 실패:", e instanceof Error ? e.message : e);
      }
    }

    const rows: TossHoldingRow[] = ov.items.map((it) => ({
      symbol: it.symbol,
      name: it.name,
      marketCountry: it.marketCountry,
      currency: it.currency,
      quantity: num(it.quantity),
      lastPrice: num(it.lastPrice),
      averagePurchasePrice: num(it.averagePurchasePrice),
      purchaseAmount: num(it.marketValue.purchaseAmount),
      marketValue: num(it.marketValue.amount),
      profitLoss: num(it.profitLoss.amount),
      profitLossRate: num(it.profitLoss.rate),
      dailyProfitLoss: num(it.dailyProfitLoss.amount),
      dailyProfitLossRate: num(it.dailyProfitLoss.rate),
      // 전일종가 역산: lastPrice / (1 + 당일손익률). rate=-1(전액손실)이면 불가→null.
      previousClose: (() => {
        const last = num(it.lastPrice);
        const r = num(it.dailyProfitLoss.rate);
        return last > 0 && 1 + r !== 0 ? last / (1 + r) : null;
      })(),
    }));

    const summary: TossHoldingsSummary = {
      totalPurchase: money(ov.totalPurchaseAmount),
      marketValue: money(ov.marketValue.amount),
      profitLoss: money(ov.profitLoss.amount),
      profitLossRate: num(ov.profitLoss.rate),
      dailyProfitLoss: money(ov.dailyProfitLoss.amount),
      dailyProfitLossRate: num(ov.dailyProfitLoss.rate),
    };

    return {
      status: "ok",
      account: {
        accountNo: account.accountNo,
        accountSeq: account.accountSeq,
        accountType: account.accountType,
      },
      summary,
      rows,
      usdKrwRate,
    };
  } catch (err) {
    if (err instanceof TossNotConfiguredError) return { status: "not_configured" };
    const message = err instanceof Error ? err.message : String(err);
    console.error("[toss-holdings]", message);
    return { status: "error", message };
  }
}
