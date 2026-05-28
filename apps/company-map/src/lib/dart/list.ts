export interface DartListItem {
  corp_code: string;
  corp_name: string;
  stock_code?: string;
  report_nm: string;
  rcept_no: string;
  rcept_dt: string;
  rm?: string;
}

export interface DartListResponse {
  status?: string;
  message?: string;
  page_no?: number;
  page_count?: number;
  total_count?: number;
  total_page?: number;
  list?: DartListItem[];
}

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

/**
 * DART 공시 목록 호출. corpCode로 한 회사의 공시 검색.
 * pblntfTy: 공시유형 코드 (A=정기, B=주요사항, C=발행, D=지분, F=감사관련, ...).
 */
export async function fetchDartList(params: {
  corpCode: string;
  pblntfTy?: string;
  bgnDe?: string;
  endDe?: string;
  pageNo?: number;
  pageCount?: number;
}): Promise<DartListResponse | null> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY not set");
  const url = new URL("https://opendart.fss.or.kr/api/list.json");
  url.searchParams.set("crtfc_key", apiKey);
  url.searchParams.set("corp_code", params.corpCode);
  if (params.pblntfTy) url.searchParams.set("pblntf_ty", params.pblntfTy);
  if (params.bgnDe) url.searchParams.set("bgn_de", params.bgnDe);
  if (params.endDe) url.searchParams.set("end_de", params.endDe);
  url.searchParams.set("page_no", String(params.pageNo ?? 1));
  url.searchParams.set("page_count", String(params.pageCount ?? 100));

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) return null;
      return (await resp.json()) as DartListResponse;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isRetriable(err)) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      console.warn(
        `[dart] list fetch failed corp=${params.corpCode} (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }
  return null;
}
