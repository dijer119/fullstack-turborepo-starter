import { parseNaverEtfAnalysis } from "@/lib/etf/naver";
import type { Holding } from "@/lib/etf/types";

// Naver 모바일 ETF API로 구성종목(상위 10)을 가져온다. KRX MDC가 이 환경에서
// 차단되어(LOGOUT) 동작하는 Naver로 전환. 단축코드(예: 0074K0)를 그대로 사용.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  Referer: "https://m.stock.naver.com/",
  Accept: "application/json",
};

// 마지막 영업일 yyyymmdd (스냅샷 기준일). 서버는 KST.
export function lastBusinessDay(d = new Date()): string {
  const x = new Date(d);
  const day = x.getDay();
  if (day === 0) x.setDate(x.getDate() - 2);
  else if (day === 6) x.setDate(x.getDate() - 1);
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
}

export async function fetchNaverEtf(
  code: string,
): Promise<{ name: string; holdings: Holding[]; trdDd: string } | null> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/etfAnalysis`,
      { headers: HEADERS, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) {
      console.warn(`[naver-etf] ${code} HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    const { name, holdings } = parseNaverEtfAnalysis(json);
    return { name, holdings, trdDd: lastBusinessDay() };
  } catch (err) {
    console.warn(`[naver-etf] ${code} fetch failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
