import { parseKoreanMarketValue } from "./parse-market-value";

const API = "https://api.finance.naver.com/siseJson.naver";
const INTEGRATION_API = "https://m.stock.naver.com/api/stock";

export interface PriceChange3M {
  currentPrice: number;
  pastPrice: number;
  pastDate: Date;
  pctChange: number;
}

/** 네이버 모바일 stock integration API → 시가총액(BigInt 원 단위). */
export async function fetchMarketValue(code: string): Promise<bigint | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const res = await fetch(`${INTEGRATION_API}/${code}/integration`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const infos = (data as { totalInfos?: Array<{ code?: string; value?: string }> })
    .totalInfos;
  if (!Array.isArray(infos)) return null;
  const mv = infos.find((x) => x.code === "marketValue")?.value;
  return parseKoreanMarketValue(mv);
}

export function toYyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** 네이버 일별 시세에서 3개월 전 종가와 현재 종가 추출. */
export async function fetchPriceChange3M(code: string): Promise<PriceChange3M | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const now = new Date();
  const past = new Date(now);
  past.setMonth(past.getMonth() - 3);

  const qs = new URLSearchParams({
    symbol: code,
    requestType: "1",
    startTime: toYyyymmdd(past),
    endTime: toYyyymmdd(now),
    timeframe: "day",
  });

  const res = await fetch(`${API}?${qs.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  const text = await res.text();

  let rows: unknown[];
  try {
    rows = JSON.parse(text.replace(/'/g, '"'));
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length < 2) return null;

  const dataRows = rows.slice(1) as unknown[][];
  if (dataRows.length === 0) return null;
  const firstRow = dataRows[0];
  const lastRow = dataRows[dataRows.length - 1];

  const pastPrice = Number(firstRow[4]);
  const currentPrice = Number(lastRow[4]);
  if (!Number.isFinite(pastPrice) || !Number.isFinite(currentPrice) || pastPrice === 0) {
    return null;
  }

  const pastDateStr = String(firstRow[0]);
  if (!/^\d{8}$/.test(pastDateStr)) return null;
  const pastDate = new Date(
    `${pastDateStr.slice(0, 4)}-${pastDateStr.slice(4, 6)}-${pastDateStr.slice(6, 8)}T00:00:00Z`,
  );

  return {
    currentPrice,
    pastPrice,
    pastDate,
    pctChange: ((currentPrice - pastPrice) / pastPrice) * 100,
  };
}
