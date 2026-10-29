import type { EtfDividend, EtfPeriodReturn, EtfReturns, Holding } from "./types";
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

interface NaverPerformance {
  periodTypeCode?: string;
  value?: unknown;
  [k: string]: unknown;
}

interface NaverEtfAnalysis {
  itemName?: string;
  marketValue?: string;
  etfTop10MajorConstituentAssets?: NaverConstituent[];
  returnPerformanceReferenceDate?: string;
  returnPerformanceList?: NaverPerformance[];
  navPerformanceReferenceDate?: string;
  navPerformanceList?: NaverPerformance[];
  dividend?: {
    dividendYieldTtm?: unknown;
    dividendPerShareTtm?: unknown;
    dividendCountThisYear?: unknown;
    dividendMonthThisYear?: unknown;
  } | null;
  [k: string]: unknown;
}

function parseDividend(json: NaverEtfAnalysis): EtfDividend | null {
  const d = json.dividend;
  if (d == null || typeof d !== "object") return null;
  const months = (d.dividendMonthThisYear ?? "")
    .toString()
    .split(",")
    .map((m) => Number(m.trim()))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  return {
    perShareTtm: num(d.dividendPerShareTtm),
    yieldTtm: num(d.dividendYieldTtm),
    countThisYear: num(d.dividendCountThisYear),
    monthsThisYear: months,
  };
}

function parsePerformance(list: unknown): EtfPeriodReturn[] {
  if (!Array.isArray(list)) return [];
  return (list as NaverPerformance[])
    .map((r): EtfPeriodReturn | null => {
      const period = (r.periodTypeCode ?? "").toString().trim();
      const value = num(r.value);
      return period && value != null ? { period, value } : null;
    })
    .filter((r): r is EtfPeriodReturn => r !== null);
}

// "2026.10.01" → "20261001". 형식이 다르면 null
function toYmd(v: unknown): string | null {
  const digits = (v ?? "").toString().replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

function parseReturns(json: NaverEtfAnalysis): EtfReturns | null {
  const hasList = Array.isArray(json.returnPerformanceList) || Array.isArray(json.navPerformanceList);
  if (!hasList) return null;
  return {
    referenceDate: toYmd(json.returnPerformanceReferenceDate) ?? toYmd(json.navPerformanceReferenceDate),
    market: parsePerformance(json.returnPerformanceList),
    nav: parsePerformance(json.navPerformanceList),
  };
}

export function parseNaverEtfAnalysis(json: NaverEtfAnalysis): {
  name: string;
  holdings: Holding[];
  marketValue: bigint | null; // 시가총액 (원). etfAnalysis의 "1,128억" 문자열 파싱
  returns: EtfReturns | null; // 기간별 수익률. 목록이 둘 다 없으면 null
  dividend: EtfDividend | null; // 분배금 요약. dividend 필드가 없으면 null
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
    returns: parseReturns(json),
    dividend: parseDividend(json),
  };
}
