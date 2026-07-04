import "server-only";

// 네이버 증권 자동완성 API. 종목명(한글·영문)으로 검색해 종목 코드를 얻는다.
// 토스 Open API엔 이름 검색이 없어, 이름→심볼 변환에 사용. 반환 code는 토스가
// 그대로 받는 심볼(KR 6자리, US 티커)과 동일하다.
const AC_URL = "https://ac.stock.naver.com/ac";

interface NaverAcItem {
  code: string;
  name: string;
  typeCode: string; // KOSPI/KOSDAQ/NASDAQ/NYSE/TOKYO 등
  nationCode: string; // KOR/USA/JPN 등
  category: string; // stock 등
}

export interface StockSearchResult {
  symbol: string;
  name: string;
  market: string; // KOSPI/KOSDAQ/NASDAQ/NYSE
  country: "KR" | "US";
}

// 종목명으로 검색. 토스가 지원하는 KR·US 종목만 반환(일본 등 제외).
export async function searchStocksByName(
  query: string,
): Promise<StockSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const url = `${AC_URL}?q=${encodeURIComponent(q)}&target=stock`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://m.stock.naver.com",
    },
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`네이버 검색 실패: ${resp.status}`);

  const json = (await resp.json()) as { items?: NaverAcItem[] };
  const items = json.items ?? [];

  return items
    .filter((it) => it.nationCode === "KOR" || it.nationCode === "USA")
    .map((it) => ({
      symbol: it.code,
      name: it.name,
      market: it.typeCode,
      country: it.nationCode === "KOR" ? ("KR" as const) : ("US" as const),
    }));
}
