import type { DartFinancialResult } from "@/types/stocks";

const DART_API_KEY = process.env.DART_API_KEY;

interface DartListItem {
  sj_nm?: string;
  fs_nm?: string;
  account_nm?: string;
  thstrm_amount?: string;
}

interface DartResponse {
  status?: string;
  message?: string;
  list?: DartListItem[];
}

function parseAmount(raw: string | undefined): bigint | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

/**
 * 재무상태표에서 유동자산/부채총계/자산총계/자본총계 추출.
 * 연결재무제표 우선, 없으면 별도(재무제표) fallback.
 * 유동자산 또는 부채총계가 없으면 null.
 */
export function extractBalanceSheet(
  response: DartResponse,
): Omit<DartFinancialResult, "bsnsYear"> | null {
  if (response.status !== "000") return null;

  const accounts = new Map<string, bigint>();
  for (const item of response.list ?? []) {
    if (item.sj_nm !== "재무상태표") continue;
    const amount = parseAmount(item.thstrm_amount);
    if (amount === null) continue;
    const key = `${item.fs_nm}_${item.account_nm}`;
    accounts.set(key, amount);
  }

  const pick = (account: string): bigint | null =>
    accounts.get(`연결재무제표_${account}`) ??
    accounts.get(`재무제표_${account}`) ??
    null;

  const currentAssets = pick("유동자산");
  const totalLiabilities = pick("부채총계");
  const totalAssets = pick("자산총계");
  const totalEquity = pick("자본총계");

  if (currentAssets === null || totalLiabilities === null) return null;

  return {
    currentAssets,
    totalLiabilities,
    totalAssets: totalAssets ?? 0n,
    totalEquity: totalEquity ?? 0n,
  };
}

export async function fetchDartFinancial(
  corpCode: string,
  bsnsYear: number,
  reprtCode = "11011",
): Promise<DartResponse | null> {
  if (!DART_API_KEY) throw new Error("DART_API_KEY not set");
  const url = new URL("https://opendart.fss.or.kr/api/fnlttSinglAcnt.json");
  url.searchParams.set("crtfc_key", DART_API_KEY);
  url.searchParams.set("corp_code", corpCode);
  url.searchParams.set("bsns_year", String(bsnsYear));
  url.searchParams.set("reprt_code", reprtCode);
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) return null;
    return (await resp.json()) as DartResponse;
  } catch (err) {
    console.warn(`[dart] financial fetch failed for corp=${corpCode}:`, err);
    return null;
  }
}

/**
 * 가장 최근 사업보고서를 찾아 재무상태표 추출.
 * 사업보고서는 보통 3월 말까지 공시 → 4월부터 전년도 사용 가능.
 * 최대 3년 전까지 fallback.
 */
export async function getLatestFinancial(
  corpCode: string,
  now: Date = new Date(),
): Promise<DartFinancialResult | null> {
  const startYear =
    now.getMonth() >= 3 ? now.getFullYear() - 1 : now.getFullYear() - 2;
  for (let year = startYear; year > startYear - 3; year--) {
    const data = await fetchDartFinancial(corpCode, year);
    if (!data) continue;
    const bs = extractBalanceSheet(data);
    if (bs) return { bsnsYear: year, ...bs };
  }
  return null;
}
