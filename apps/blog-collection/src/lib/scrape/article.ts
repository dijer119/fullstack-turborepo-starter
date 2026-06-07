import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

// 블로그 원문(특히 네이버 블로그)과 그 안의 외부링크 본문을 가져와 정제하는 유틸.
// 네이버 블로그는 본문이 iframe(#mainFrame) 안에 있어 데스크톱 URL로는 못 긁는다.
// 모바일 URL(m.blog.naver.com)은 본문이 .se-main-container 로 바로 노출돼 안정적이다.

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

export interface ArticleContent {
  title: string;
  html: string; // 정제·이미지 프록시 처리된 본문 HTML
}

export interface ExternalLink {
  url: string;
  title: string | null;
}

// blog.naver.com/{id}/{logNo} → m.blog.naver.com/{id}/{logNo}
export function naverToMobile(url: string): string {
  const m = url.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/);
  if (m) return `https://m.blog.naver.com/${m[1]}/${m[2]}`;
  return url;
}

function isNaverBlog(url: string): boolean {
  return /(^|\.)blog\.naver\.com/.test(safeHost(url));
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function decodeBuffer(buf: ArrayBuffer, contentType: string): string {
  const m = contentType.match(/charset=([\w-]+)/i);
  const charset = m ? m[1].toLowerCase() : "utf-8";
  if (charset === "utf-8" || charset === "utf8") {
    return new TextDecoder("utf-8").decode(buf);
  }
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    try {
      return new TextDecoder("euc-kr").decode(buf);
    } catch {
      return new TextDecoder("utf-8").decode(buf);
    }
  }
}

export async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": MOBILE_UA, "Accept-Language": "ko,en;q=0.8" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "text/html; charset=utf-8";
    const buf = await res.arrayBuffer();
    return decodeBuffer(buf, ct);
  } catch (err) {
    console.warn(`[scrape] fetch failed ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function absolutize(src: string, base: string): string | null {
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

// 네이버 블로그 글 URL을 blogId/logNo 정규 키로. 같은 글의 여러 URL 형식
// (/{blogId}/{logNo}, PostView.naver?blogId=&logNo=)을 하나로 묶어 중복 제거에 사용.
function naverPostKey(url: string): string | null {
  let m = url.match(/blog\.naver\.com\/([^/?#]+)\/(\d{6,})/);
  if (m) return `${m[1]}/${m[2]}`;
  const blogId = url.match(/[?&]blogId=([^&#]+)/)?.[1];
  const logNo = url.match(/[?&]logNo=(\d{6,})/)?.[1];
  if (blogId && logNo) return `${blogId}/${logNo}`;
  return null;
}

function canonicalNaverUrl(key: string): string {
  const [blogId, logNo] = key.split("/");
  return `https://m.blog.naver.com/${blogId}/${logNo}`;
}

// 평문 텍스트에서 뽑은 URL의 끝에 붙은 구두점/괄호 제거 + 엔티티 디코드.
function cleanUrl(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .trim()
    .replace(/[.,;)\]}"'》」]+$/, "");
}

// 본문 컨테이너 안의 위험 요소 제거 + 이미지 프록시 경유 + 링크 새 탭.
function cleanScope($: CheerioAPI, scope: Cheerio<AnyNode>, baseUrl: string): void {
  scope.find("script, style, noscript, link, meta").remove();

  // 이벤트 핸들러·javascript: 제거
  scope.find("*").each((_, el) => {
    if (el.type !== "tag") return;
    const attribs = el.attribs ?? {};
    for (const name of Object.keys(attribs)) {
      if (/^on/i.test(name)) $(el).removeAttr(name);
    }
    const href = attribs.href;
    if (href && /^\s*javascript:/i.test(href)) $(el).removeAttr("href");
  });

  // 이미지: lazy 속성 → src 승격 후 image-proxy 경유 (절대 URL로)
  scope.find("img").each((_, el) => {
    const $img = $(el);
    const raw =
      $img.attr("data-lazy-src") ||
      $img.attr("data-src") ||
      $img.attr("src") ||
      "";
    const abs = raw ? absolutize(raw, baseUrl) : null;
    if (abs) {
      $img.attr("src", `/api/image-proxy?url=${encodeURIComponent(abs)}`);
    }
    $img.removeAttr("data-lazy-src");
    $img.removeAttr("data-src");
    $img.removeAttr("srcset");
    $img.removeAttr("loading");
  });

  // 링크: 절대화 + 새 탭
  scope.find("a[href]").each((_, el) => {
    const $a = $(el);
    const abs = absolutize($a.attr("href") ?? "", baseUrl);
    if (abs) {
      $a.attr("href", abs);
      $a.attr("target", "_blank");
      $a.attr("rel", "noopener noreferrer");
    }
  });
}

function pickGenericContent($: CheerioAPI): Cheerio<AnyNode> {
  // 본문 후보: article > main > 가장 텍스트가 많은 블록.
  const article = $("article").first();
  if (article.length && article.text().trim().length > 200) return article;

  let best: Cheerio<AnyNode> | null = null;
  let bestLen = 0;
  $("main, .article, .post, .entry-content, .content, #content").each((_, el) => {
    const len = $(el).text().trim().length;
    if (len > bestLen) {
      bestLen = len;
      best = $(el);
    }
  });
  if (best && bestLen > 200) return best;

  return $("body");
}

// 페이지 HTML에서 본문 컨테이너를 골라 정제된 HTML과 제목을 반환.
export function extractArticle(html: string, pageUrl: string): ArticleContent | null {
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    "(제목 없음)";

  let scope: Cheerio<AnyNode>;
  const host = safeHost(pageUrl);

  if (/blog\.naver\.com/.test(host)) {
    scope = $(".se-main-container").first();
    if (!scope.length) scope = $("#postViewArea").first();
    if (!scope.length) scope = $("#viewTypeSelector").first();
  } else if (/news\.naver\.com/.test(host)) {
    scope =
      $("#dic_area").first().length
        ? $("#dic_area").first()
        : $("#newsct_article, .newsct_article").first();
  } else {
    scope = pickGenericContent($);
  }

  if (!scope || !scope.length) return null;

  cleanScope($, scope, pageUrl);
  const out = scope.html();
  if (!out || out.trim().length === 0) return null;
  return { title, html: out };
}

// 본문이 참조하는 링크 수집. 네이버 블로그는 링크카드(se-oglink)의
// data-linkdata JSON, 일반 앵커, 그리고 평문 텍스트 URL까지 모두 본다.
// 같은 글 자신과 정적 자산/시스템 링크는 제외하고, 같은 블로그의 "다른 글"이나
// 외부 뉴스/사이트 링크는 포함한다. 네이버 글은 정규 키로 중복 제거.
export function extractExternalLinks(
  html: string,
  pageUrl: string,
  max = 10,
): ExternalLink[] {
  const $ = cheerio.load(html);
  const host = safeHost(pageUrl);
  const selfKey = naverPostKey(pageUrl);

  let scope: Cheerio<AnyNode> = $(".se-main-container").first();
  if (!scope.length) scope = isNaverBlog(pageUrl) ? $("body") : pickGenericContent($);

  // 정적 자산·시스템(로그인/검색/공유 등) 호스트는 콘텐츠 링크가 아니다.
  const JUNK_HOST = /pstatic\.net|navercorp|static\.naver|nid\.naver|search\.naver|cr\.naver|ssl\.pstatic/;

  const found = new Map<string, ExternalLink>();

  const consider = (rawUrl: string | undefined, title: string | null) => {
    if (!rawUrl) return;
    const url = cleanUrl(rawUrl);
    if (!/^https?:\/\//i.test(url)) return;
    const h = safeHost(url);
    if (!h || JUNK_HOST.test(h)) return;

    const postKey = naverPostKey(url);
    // 자기 자신(같은 글) 제외
    if (postKey && selfKey && postKey === selfKey) return;
    // 네이버 글이 아닌데 페이지와 같은 호스트면 블로그 홈/네비게이션 → 제외
    if (!postKey && h === host) return;

    const dedupeKey = postKey ?? url;
    if (found.has(dedupeKey)) return;
    found.set(dedupeKey, {
      url: postKey ? canonicalNaverUrl(postKey) : url,
      title: title?.replace(/\s+/g, " ").trim() || null,
    });
  };

  // 1) 네이버 링크카드
  scope.find("[data-linkdata]").each((_, el) => {
    const ld = $(el).attr("data-linkdata");
    if (!ld) return;
    try {
      const j = JSON.parse(ld) as { link?: string; title?: string };
      consider(j.link, j.title ?? $(el).text());
    } catch {
      /* ignore */
    }
  });

  // 2) 일반 앵커
  scope.find("a[href^='http']").each((_, el) => {
    consider($(el).attr("href"), $(el).text());
  });

  // 3) 본문 평문 텍스트 URL (앵커가 아닌 채로 적힌 링크)
  const text = scope.text();
  for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    consider(m[0], null);
  }

  return [...found.values()].slice(0, max);
}
