import { db } from "@/lib/db";
import { isFresh } from "@/lib/stocks/quant-metrics";
import { toYyyymmdd } from "@/lib/stocks/price-history";

const BASE = "https://ecos.bok.or.kr/api/StatisticSearch";
// 시장금리(일별) 통계표. 항목 기본값은 국고채(10년).
// 2026-06-10 실호출 검증 완료: ITEM_NAME1="국고채(10년)", row는 TIME 오름차순(마지막 행이 최신).
const STAT_CODE = process.env.ECOS_TREASURY_STAT_CODE ?? "817Y002";
const ITEM_CODE = process.env.ECOS_TREASURY_ITEM_CODE ?? "010210000";
const RATE_KIND = "treasury_10y";
const TTL_MS = 24 * 60 * 60 * 1000;

/** ECOS StatisticSearch 응답에서 최신 수익률(%) 추출. */
export function parseEcosYield(data: unknown): number | null {
  const rows = (
    data as {
      StatisticSearch?: { row?: Array<{ DATA_VALUE?: string }> };
    } | null
  )?.StatisticSearch?.row;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const v = Number(rows[rows.length - 1]?.DATA_VALUE);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** ECOS에서 최근 14일 구간의 국고채 수익률 조회. 키 미설정·실패 시 null. */
export async function fetchTreasuryYield(): Promise<number | null> {
  const key = process.env.ECOS_API_KEY;
  if (!key) return null;

  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 14);
  const url = `${BASE}/${key}/json/kr/1/100/${STAT_CODE}/D/${toYyyymmdd(past)}/${toYyyymmdd(now)}/${ITEM_CODE}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  return parseEcosYield(data);
}

/** 24h TTL 캐시(MarketRate). 미스 시 fetch 후 upsert, 실패 시 stale 폴백. */
export async function getTreasuryYield(): Promise<number | null> {
  const cached = await db.marketRate.findUnique({ where: { kind: RATE_KIND } });
  if (cached && isFresh(cached.fetchedAt, new Date(), TTL_MS)) {
    return cached.ratePct;
  }

  try {
    const fresh = await fetchTreasuryYield();
    if (fresh != null) {
      await db.marketRate.upsert({
        where: { kind: RATE_KIND },
        create: { kind: RATE_KIND, ratePct: fresh },
        update: { ratePct: fresh, fetchedAt: new Date() },
      });
      return fresh;
    }
  } catch {
    // 네트워크 실패 → stale 폴백
  }
  return cached?.ratePct ?? null;
}
