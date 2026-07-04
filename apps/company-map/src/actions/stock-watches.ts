"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  getPreviousClose,
  getPriceLimitBase,
  getPrices,
  getStocksInfo,
  isTossConfigured,
} from "@/lib/toss/client";
import {
  searchStocksByName,
  type StockSearchResult,
} from "@/lib/stocks/naver-search";

export interface StockWatchRow {
  symbol: string;
  name: string;
  market: string | null;
  currency: string | null;
  sortOrder: number;
  createdAt: string; // ISO 8601
  // 사용자 입력 구매가 (종목 통화 기준, 미입력 시 null)
  purchasePrice: number | null;
  // 토스 현재가 (조회 실패 시 null)
  lastPrice: number | null;
  // 전일종가 표시값 (일봉 종가, 조회 실패 시 null)
  previousClose: number | null;
  // 등락 계산 기준가 — KR은 정규장 기준가(토스 등락률과 일치), US는 일봉 종가. 조회 실패 시 null
  changeBase: number | null;
}

// 심볼 형식 1차 검증: 영문 대문자·숫자·점(.) 1~12자 (KR 6자리, US 티커/PBR.A 등).
// 실제 존재 여부는 토스 getStocksInfo로 확인한다.
function normalizeSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  return /^[A-Z0-9.]{1,12}$/.test(s) ? s : null;
}

// 저장된 관심종목 + 토스 현재가를 합쳐 반환. sortOrder 오름차순.
export async function listWatches(): Promise<StockWatchRow[]> {
  const rows = await db.stockWatch.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (rows.length === 0) return [];

  // 현재가 배치 조회 (실패해도 목록은 표시).
  const priceMap = new Map<string, { price: number; ts: string }>();
  const prevMap = new Map<string, number>(); // 전일종가(일봉 종가) 표시용
  const baseMap = new Map<string, number>(); // 등락 기준가 (KR=기준가, US=일봉종가)
  if (isTossConfigured()) {
    try {
      const prices = await getPrices(rows.map((r) => r.symbol));
      for (const p of prices) {
        priceMap.set(p.symbol, { price: Number(p.lastPrice), ts: p.timestamp });
      }
    } catch (e) {
      console.warn("[stock-watches] 현재가 조회 실패:", e instanceof Error ? e.message : e);
    }

    // 전일종가(일봉)·기준가는 종목별 조회 — chart/stock rate-limit 고려해 4개씩 묶어 처리.
    const withPrice = rows.filter((r) => priceMap.has(r.symbol));
    const chunk = 4;
    for (let i = 0; i < withPrice.length; i += chunk) {
      const part = withPrice.slice(i, i + chunk);
      await Promise.all(
        part.map(async (r) => {
          const { price, ts } = priceMap.get(r.symbol)!;
          const isKR = r.currency === "KRW";
          // 전일종가(일봉 종가) — 표시용
          try {
            const pc = await getPreviousClose(r.symbol, price, ts);
            if (pc != null) prevMap.set(r.symbol, pc);
          } catch {
            /* 무시 — null 표시 */
          }
          // 등락 기준가: KR은 정규장 기준가(토스 등락률과 일치), US는 일봉 종가 사용
          if (isKR) {
            try {
              const base = await getPriceLimitBase(r.symbol);
              if (base > 0) baseMap.set(r.symbol, base);
            } catch {
              /* 무시 — 일봉으로 폴백 */
            }
          }
        }),
      );
    }
  }

  return rows.map((r) => {
    const prev = prevMap.get(r.symbol) ?? null;
    const price = priceMap.get(r.symbol)?.price ?? null;
    const plBase = baseMap.get(r.symbol) ?? null; // KR 정규장 기준가(있으면)
    // 휴장 시 price-limits 기준가는 다음 거래일 기준(=당일 종가)으로 굴러가 현재가와 같아진다.
    // 그 경우 등락이 0%로 나오므로, 기준가가 현재가와 사실상 같으면 일봉 전일종가로 폴백.
    const baseUsable =
      plBase != null &&
      price != null &&
      Math.abs(plBase - price) > Math.abs(price) * 1e-3;
    const base = baseUsable ? plBase : prev;
    return {
      symbol: r.symbol,
      name: r.name,
      market: r.market,
      currency: r.currency,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt.toISOString(),
      purchasePrice: r.purchasePrice,
      lastPrice: price,
      previousClose: prev,
      changeBase: base,
    };
  });
}

// 관심종목 추가. 토스 getStocksInfo로 검증·이름·통화를 채운다.
export async function addWatch(
  rawSymbol: string,
): Promise<{ ok: boolean; reason?: string }> {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) return { ok: false, reason: "심볼 형식이 올바르지 않습니다." };

  const exists = await db.stockWatch.findUnique({ where: { symbol } });
  if (exists) return { ok: false, reason: "이미 등록된 종목입니다." };

  if (!isTossConfigured()) {
    return { ok: false, reason: "토스 API가 설정되지 않았습니다." };
  }

  let info;
  try {
    const list = await getStocksInfo([symbol]);
    info = list.find((s) => s.symbol === symbol);
  } catch (e) {
    return {
      ok: false,
      reason: `종목 조회 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!info) return { ok: false, reason: "존재하지 않는 종목입니다." };

  const max = await db.stockWatch.aggregate({ _max: { sortOrder: true } });
  await db.stockWatch.create({
    data: {
      symbol,
      name: info.name,
      market: info.market,
      currency: info.currency,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/stocks/watchlist");
  return { ok: true };
}

// 종목명(한글·영문)으로 후보 검색. 네이버 자동완성 기반(KR·US). 자동완성 UI용.
export async function searchWatchCandidates(
  query: string,
): Promise<StockSearchResult[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  try {
    return await searchStocksByName(q);
  } catch (e) {
    console.warn("[stock-watches] 검색 실패:", e instanceof Error ? e.message : e);
    return [];
  }
}

// 구매가 설정/수정. price가 null이거나 0 이하면 구매가 제거(미입력 상태로).
export async function setWatchPurchasePrice(
  symbol: string,
  price: number | null,
): Promise<{ ok: boolean }> {
  const value = price != null && Number.isFinite(price) && price > 0 ? price : null;
  await db.stockWatch
    .update({ where: { symbol }, data: { purchasePrice: value } })
    .catch(() => {});
  revalidatePath("/stocks/watchlist");
  return { ok: true };
}

// 관심종목 삭제. 없으면 no-op (idempotent).
export async function removeWatch(symbol: string): Promise<{ ok: boolean }> {
  await db.stockWatch.delete({ where: { symbol } }).catch(() => {});
  revalidatePath("/stocks/watchlist");
  return { ok: true };
}
