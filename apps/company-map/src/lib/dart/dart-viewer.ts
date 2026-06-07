// DART 공시 viewer.do 본문 HTML을 가져오고 표 셀을 추출하는 공통 유틸.
// contract-detail.ts가 자체적으로 갖고 있던 fetch 로직과 같은 패턴이며,
// 자사주(treasury) 등 다른 공시 파서에서 재사용한다.

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetriable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("fetch failed") ||
    m.includes("timeout") ||
    m.includes("network") ||
    m.includes("econnreset") ||
    m.includes("etimedout")
  );
}

export async function fetchDartPage(url: string): Promise<string | null> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130 Safari/537.36",
        },
      });
      if (!resp.ok) return null;
      // DART viewer.do는 공시에 따라 EUC-KR 또는 UTF-8. Content-Type 헤더로 charset 판별.
      const ct = resp.headers.get("content-type") ?? "";
      const charsetMatch = ct.match(/charset=([\w-]+)/i);
      const charset = charsetMatch ? charsetMatch[1].toLowerCase() : "utf-8";
      if (charset === "utf-8" || charset === "utf8") {
        return await resp.text();
      }
      const buf = await resp.arrayBuffer();
      try {
        return new TextDecoder(charset).decode(buf);
      } catch {
        try {
          return new TextDecoder("euc-kr").decode(buf);
        } catch {
          return new TextDecoder("latin1").decode(buf);
        }
      }
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isRetriable(err)) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      console.warn(
        `[dart] page fetch failed ${url}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }
  return null;
}

interface ViewerParams {
  rcpNo: string;
  dcmNo: string;
  eleId: string;
  offset: string;
  length: string;
  dtd: string;
}

export function extractViewerParams(
  mainHtml: string,
  rcpNo: string,
): ViewerParams | null {
  // viewDoc("rcpNo","dcmNo","eleId","offset","length","dtd","tocNo")  (7-arg variant)
  // viewDoc("rcpNo","dcmNo","eleId","offset","length","dtd")           (6-arg variant)
  const re =
    /viewDoc\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*(?:,\s*['"][^'"]*['"]\s*)?\)/;
  const m = mainHtml.match(re);
  if (!m) return null;
  return {
    rcpNo: m[1] || rcpNo,
    dcmNo: m[2],
    eleId: m[3] ?? "0",
    offset: m[4] ?? "0",
    length: m[5] ?? "0",
    dtd: m[6] ?? "",
  };
}

// 공시 메인 페이지 → viewDoc 파라미터 추출 → 본문 viewer.do HTML 반환.
export async function fetchViewerHtml(rcpNo: string): Promise<string | null> {
  const mainUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rcpNo}`;
  const mainHtml = await fetchDartPage(mainUrl);
  if (!mainHtml) return null;

  const params = extractViewerParams(mainHtml, rcpNo);
  if (!params) return null;

  const viewerUrl =
    `https://dart.fss.or.kr/report/viewer.do?` +
    new URLSearchParams({
      rcpNo: params.rcpNo,
      dcmNo: params.dcmNo,
      eleId: params.eleId,
      offset: params.offset,
      length: params.length,
      dtd: params.dtd,
    }).toString();
  return fetchDartPage(viewerUrl);
}

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;|&cmiddot;/g, "·")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// 표 셀(td/th)의 텍스트를 등장 순서대로 추출. 빈 셀은 제외.
export function cellsOf(html: string): string[] {
  const matches = html.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? [];
  const out: string[] = [];
  for (const cell of matches) {
    const inner = cell
      .replace(/^<t[dh][^>]*>/i, "")
      .replace(/<\/t[dh]>$/i, "");
    const text = decodeEntities(stripTags(inner));
    if (text) out.push(text);
  }
  return out;
}

export function parseNum(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.\-]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

// treeData 노드 파라미터로 특정 섹션 viewer.do HTML을 가져온다.
export async function fetchViewerHtmlByParams(params: {
  rcpNo: string;
  dcmNo: string;
  eleId: string;
  offset: string;
  length: string;
  dtd: string;
}): Promise<string | null> {
  const url =
    `https://dart.fss.or.kr/report/viewer.do?` +
    new URLSearchParams({
      rcpNo: params.rcpNo,
      dcmNo: params.dcmNo,
      eleId: params.eleId,
      offset: params.offset,
      length: params.length,
      dtd: params.dtd,
    }).toString();
  return fetchDartPage(url);
}
