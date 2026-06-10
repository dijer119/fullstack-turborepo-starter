import { isValidStockCode } from "./stock-code";
import { db } from "@/lib/db";
import { isFresh } from "./quant-metrics";
import { toYyyymmdd } from "./price-history";

const API = "https://api.finance.naver.com/siseJson.naver";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface Week52Range {
  high: number;
  low: number;
  asOfDate: Date;
}

/** siseJson 텍스트(작은따옴표 JS 배열)에서 52주 고가/저가/기준일 추출. */
export function parseWeek52(text: string): Week52Range | null {
  let rows: unknown[];
  try {
    rows = JSON.parse(text.replace(/'/g, '"'));
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length < 2) return null;

  const dataRows = (rows.slice(1) as unknown[][]).filter(
    (r) => Array.isArray(r) && /^\d{8}$/.test(String(r[0])),
  );
  if (dataRows.length === 0) return null;

  let high = -Infinity;
  let low = Infinity;
  for (const r of dataRows) {
    const h = Number(r[2]);
    const l = Number(r[3]);
    if (Number.isFinite(h) && h > 0 && h > high) high = h;
    if (Number.isFinite(l) && l > 0 && l < low) low = l;
  }
  if (high <= 0 || low === Infinity) return null;

  const last = String(dataRows[dataRows.length - 1][0]);
  const asOfDate = new Date(
    `${last.slice(0, 4)}-${last.slice(4, 6)}-${last.slice(6, 8)}T00:00:00Z`,
  );
  return { high, low, asOfDate };
}

/** 네이버 일별 시세 1년 범위 조회 → 52주 고저. 실패 시 null. */
export async function fetchWeek52Range(code: string): Promise<Week52Range | null> {
  if (!isValidStockCode(code)) return null;
  const now = new Date();
  const past = new Date(now);
  past.setFullYear(past.getFullYear() - 1);

  const qs = new URLSearchParams({
    symbol: code,
    requestType: "1",
    startTime: toYyyymmdd(past),
    endTime: toYyyymmdd(now),
    timeframe: "day",
  });

  const res = await fetch(`${API}?${qs.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return parseWeek52(await res.text());
}

/** 24h TTL 캐시. 미스 시 fetch 후 upsert, fetch 실패 시 stale 레코드 폴백. */
export async function getWeek52Price(code: string) {
  const cached = await db.week52Price.findUnique({ where: { code } });
  if (cached && isFresh(cached.fetchedAt, new Date(), TTL_MS)) return cached;

  try {
    const fresh = await fetchWeek52Range(code);
    if (fresh) {
      return await db.week52Price.upsert({
        where: { code },
        create: { code, ...fresh },
        update: { ...fresh, fetchedAt: new Date() },
      });
    }
  } catch {
    // 네트워크 실패 → stale 폴백
  }
  return cached;
}
