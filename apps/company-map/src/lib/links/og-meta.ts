import * as cheerio from "cheerio";

export interface OgMeta {
  title: string | null;
  siteName: string | null;
  imageUrl: string | null;
}

export type LinkKind = "blog" | "news";

const FETCH_TIMEOUT_MS = 5_000;

const NEWS_HOST_PATTERNS = [
  "news.naver.com",
  "n.news.naver.com",
  "media.naver.com",
  "yna.co.kr",
  "yonhapnews.co.kr",
  "hankyung.com",
  "mk.co.kr",
  "edaily.co.kr",
  "mt.co.kr",
  "sedaily.com",
  "fnnews.com",
  "chosun.com",
  "donga.com",
  "joongang.co.kr",
  "hani.co.kr",
  "khan.co.kr",
  "heraldcorp.com",
  "newsis.com",
  "news1.kr",
];

/** URL 호스트만 안전 추출. 파싱 실패 시 null. */
export function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** 호스트 기반 블로그/뉴스 추정. 언론사 도메인 매칭 시 news, 그 외 blog. */
export function inferKind(url: string): LinkKind {
  const host = hostFromUrl(url);
  if (!host) return "blog";
  return NEWS_HOST_PATTERNS.some((p) => host.includes(p)) ? "news" : "blog";
}

function pick($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = $(sel).first();
    const raw = el.attr("content") ?? el.text();
    const trimmed = raw?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** HTML 문자열에서 OG 메타 추출. 순수 함수 — 네트워크 없음. */
export function parseOgMeta(html: string, url: string): OgMeta {
  const $ = cheerio.load(html);

  const title = pick($, [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    "title",
  ]);

  const siteName = pick($, ['meta[property="og:site_name"]']);

  let imageUrl = pick($, [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
  ]);
  if (imageUrl) {
    try {
      imageUrl = new URL(imageUrl, url).toString();
    } catch {
      // 보정 실패 시 원본 유지
    }
  }

  return { title, siteName, imageUrl };
}

/** URL fetch 후 OG 메타 추출. 실패·타임아웃·비HTML → 모두 null (throw 안 함). */
export async function fetchOgMeta(url: string): Promise<OgMeta> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130 Safari/537.36",
      },
    });
    if (!resp.ok) return { title: null, siteName: null, imageUrl: null };
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.includes("html")) {
      return { title: null, siteName: null, imageUrl: null };
    }
    const html = await resp.text();
    return parseOgMeta(html, url);
  } catch (err) {
    console.warn(
      `[stock-links] og fetch failed ${url}:`,
      err instanceof Error ? err.message : err,
    );
    return { title: null, siteName: null, imageUrl: null };
  }
}
