"use server";

import { getStocksInfo } from "@/lib/toss/client";

export async function lookupSplitStockName(rawSymbol: string, market: string) {
  const symbol = typeof rawSymbol === "string" ? rawSymbol.trim().toUpperCase() : "";
  const valid = market === "KR"
    ? /^[A-Z0-9]{6}$/.test(symbol)
    : market === "US" && /^[A-Z][A-Z0-9.]{0,11}$/.test(symbol);
  if (!valid) return { ok: false as const, message: "종목코드를 확인하세요." };
  try {
    const stocks = await getStocksInfo([symbol]);
    const stock = stocks.find((s) =>
      s.symbol === symbol && s.currency === (market === "KR" ? "KRW" : "USD"),
    );
    if (!stock?.name?.trim())
      return { ok: false as const, message: "종목을 찾지 못했습니다. 코드와 시장을 확인하거나 이름을 직접 입력하세요." };
    return { ok: true as const, name: stock.name.trim().slice(0, 100) };
  } catch {
    return { ok: false as const, message: "종목명 조회에 실패했습니다. 이름을 직접 입력할 수 있습니다." };
  }
}
