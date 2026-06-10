import type { Holding } from "./types";
import { parseKoreanMarketValue } from "@/lib/stocks/parse-market-value";

// Naver 모바일 ETF API(etfAnalysis) 응답에서 상위 10 구성종목을 파싱하는 순수 함수.
// KRX MDC가 이 환경에서 차단되어, 동작하는 Naver API로 데이터 소스를 전환했다.
// etfTop10MajorConstituentAssets: [{ itemCode, itemName, stockCount, etfWeight:"15.83%" }]

function num(v: unknown): number | null {
  if (v == null) return null;
  const cleaned = String(v).replace(/,/g, "").replace(/%/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

interface NaverConstituent {
  itemCode?: string;
  itemName?: string;
  stockCount?: string;
  etfWeight?: string;
  [k: string]: unknown;
}

interface NaverEtfAnalysis {
  itemName?: string;
  marketValue?: string;
  etfTop10MajorConstituentAssets?: NaverConstituent[];
  [k: string]: unknown;
}

export function parseNaverEtfAnalysis(json: NaverEtfAnalysis): {
  name: string;
  holdings: Holding[];
  marketValue: bigint | null; // 시가총액 (원). etfAnalysis의 "1,128억" 문자열 파싱
} {
  const name = (json.itemName ?? "").toString().trim();
  const rows = Array.isArray(json.etfTop10MajorConstituentAssets)
    ? json.etfTop10MajorConstituentAssets
    : [];
  const holdings = rows
    .map((r): Holding | null => {
      const constituentName = (r.itemName ?? "").toString().trim();
      if (!constituentName) return null;
      return {
        constituentCode: (r.itemCode ?? "").toString().trim(),
        constituentName,
        weight: num(r.etfWeight),
        shares: num(r.stockCount),
        amount: null, // Naver top10 응답엔 평가금액이 없음
      };
    })
    .filter((h): h is Holding => h !== null);
  return {
    name,
    holdings,
    marketValue: parseKoreanMarketValue(json.marketValue == null ? null : String(json.marketValue)),
  };
}
