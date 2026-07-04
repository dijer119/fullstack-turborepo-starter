// KB증권 펀드 상세에서 종목별 보유 TOP10과 기준가(NAV) 시계열을 수집한다.
// 단일 펀드(VIP한국형가치투자) 하드코딩. ETF의 Naver 소스와 달리 브라우저 없이
// 서버사이드 fetch + EUC-KR 디코드 + HTML 파싱으로 충분하다.

export const FUND = {
  code: "K553W5E17302", // KB amak_stnd_cd
  name: "VIP한국형가치투자증권자투자신탁[주식]A-e클래스",
  manager: "브이아이피자산운용",
  holdingsUrl:
    "https://m.kbsec.com/go.able?linkcd=s010100030000&amak_stnd_cd=K553W5E17302",
  navUrl:
    "https://m.kbsec.com/chart/data/MOBI_02_0039_JSON.jsp?dd=1&amak_stnd_cd=K553W5E17302",
} as const;

export interface FundHolding {
  name: string;
  weight: number | null; // 비중 %
  rank: number; // 1-based
}

export interface FundNavPoint {
  date: string; // YYYYMMDD
  nav: number; // 기준가(원)
}

export interface FundMeta {
  name: string;
  manager: string;
  grade: string | null; // 평가등급 (예: "5등급")
  riskLevel: string | null; // 위험등급 (예: "높은위험")
}

export interface FundPage {
  meta: FundMeta;
  holdings: FundHolding[];
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Referer: "https://m.kbsec.com/",
};

function num(v: string | null | undefined): number | null {
  if (v == null) return null;
  const cleaned = v.replace(/,/g, "").replace(/%/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

function matchText(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? unescapeHtml(m[1]) : null;
}

// 펀드 상세(운용자산 탭) HTML에서 메타 + 종목별 비중 TOP10을 파싱하는 순수 함수.
export function parseFundHoldingsHtml(html: string): FundPage {
  const meta: FundMeta = {
    name: matchText(html, /<h2 class="tit">([^<]+)<\/h2>/) ?? FUND.name,
    manager:
      matchText(
        html,
        /<span class="txt">([^<]*(?:자산운용|투자운용|투신운용|운용)[^<]*)<\/span>/,
      ) ?? FUND.manager,
    riskLevel: matchText(html, /class="itxt iriskTy\d+">([^<]+)</),
    grade: matchText(html, /class="i-rating[^"]*">([^<]+)</),
  };

  // "주식종목별비중TOP10" caption 표의 행만 추출. (종목별 표의 셀은 `<td >`로
  // 공백이 들어가므로 정규식에 \s* 를 둔다.)
  const capIdx = html.indexOf("주식종목별비중TOP10");
  let holdings: FundHolding[] = [];
  if (capIdx >= 0) {
    const end = html.indexOf("</table>", capIdx);
    const segment = html.slice(capIdx, end >= 0 ? end : undefined);
    const rows = [
      ...segment.matchAll(/<td\s*>([^<]*)<\/td>\s*<td\s*>([^<]*)<\/td>/g),
    ];
    holdings = rows
      .map((m, i): FundHolding | null => {
        const name = unescapeHtml(m[1]);
        if (!name) return null;
        return { name, weight: num(m[2]), rank: i + 1 };
      })
      .filter((h): h is FundHolding => h !== null);
  }

  return { meta, holdings };
}

// MOBI_02_0039 응답({data:[{date,fnd}]})에서 NAV 시계열을 파싱하는 순수 함수.
export function parseFundNavJson(text: string): FundNavPoint[] {
  let json: unknown;
  try {
    json = JSON.parse(text.trim());
  } catch {
    return [];
  }
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .map((row): FundNavPoint | null => {
      const r = row as { date?: unknown; fnd?: unknown };
      const date = r.date == null ? "" : String(r.date).trim();
      const nav = num(r.fnd == null ? null : String(r.fnd));
      if (!/^\d{8}$/.test(date) || nav == null) return null;
      return { date, nav };
    })
    .filter((p): p is FundNavPoint => p !== null);
}

// 펀드 상세 페이지(EUC-KR)를 가져와 메타 + 보유종목을 반환. 실패 시 null.
export async function fetchFundPage(): Promise<FundPage | null> {
  try {
    const res = await fetch(FUND.holdingsUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[kb-fund] holdings HTTP ${res.status}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const html = new TextDecoder("euc-kr").decode(buf);
    const page = parseFundHoldingsHtml(html);
    if (page.holdings.length === 0) return null;
    return page;
  } catch (err) {
    console.warn(
      "[kb-fund] holdings fetch failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// 기준가(NAV) 주간 시계열을 가져온다. 실패 시 빈 배열.
export async function fetchFundNav(): Promise<FundNavPoint[]> {
  try {
    const res = await fetch(FUND.navUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[kb-fund] nav HTTP ${res.status}`);
      return [];
    }
    return parseFundNavJson(await res.text());
  } catch (err) {
    console.warn(
      "[kb-fund] nav fetch failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
