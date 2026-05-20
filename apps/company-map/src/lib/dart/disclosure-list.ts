const DART_LIST_URL = "https://opendart.fss.or.kr/api/list.json";
const PAGE_DELAY_MS = 200;

export interface DartDisclosureRow {
  corpCode: string;
  corpName: string;
  reportNm: string;
  rcpNo: string;
  flrNm: string;
  rceptDt: string;   // YYYYMMDD
  stockCode: string; // 6자리 or "" 비상장
}

export interface FetchDisclosurePageParams {
  bgnDe: string;
  endDe: string;
  pblntfTy?: string;
  pblntfDetailTy?: string;
  pageNo: number;
  pageCount: number;
}

interface RawListRow {
  corp_code?: string;
  corp_name?: string;
  stock_code?: string;
  report_nm?: string;
  rcept_no?: string;
  flr_nm?: string;
  rcept_dt?: string;
}

interface RawListResponse {
  status: string;
  message?: string;
  total_page?: number;
  list?: RawListRow[];
}

export async function fetchDisclosurePage(
  params: FetchDisclosurePageParams,
): Promise<{ totalPage: number; rows: DartDisclosureRow[] }> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY not set");

  const qs = new URLSearchParams({
    crtfc_key: apiKey,
    bgn_de: params.bgnDe,
    end_de: params.endDe,
    page_count: String(params.pageCount),
    page_no: String(params.pageNo),
  });
  if (params.pblntfTy) qs.set("pblntf_ty", params.pblntfTy);
  if (params.pblntfDetailTy) qs.set("pblntf_detail_ty", params.pblntfDetailTy);

  const res = await fetch(`${DART_LIST_URL}?${qs.toString()}`);
  if (!res.ok) throw new Error(`DART list HTTP ${res.status}`);

  const data = (await res.json()) as RawListResponse;

  if (data.status === "013") {
    return { totalPage: 0, rows: [] };
  }
  if (data.status !== "000") {
    throw new Error(`DART status ${data.status}: ${data.message ?? "unknown"}`);
  }

  const rows: DartDisclosureRow[] = (data.list ?? []).map((r) => ({
    corpCode: r.corp_code ?? "",
    corpName: r.corp_name ?? "",
    reportNm: r.report_nm ?? "",
    rcpNo: r.rcept_no ?? "",
    flrNm: r.flr_nm ?? "",
    rceptDt: r.rcept_dt ?? "",
    stockCode: (r.stock_code ?? "").trim(),
  }));

  return { totalPage: data.total_page ?? 1, rows };
}

export interface IterateDisclosuresParams {
  bgnDe: string;
  endDe: string;
  pblntfTy?: string;
  pblntfDetailTy?: string;
}

/** total_page까지 자동 순회. 페이지 간 짧은 sleep으로 친절히. */
export async function* iterateDartDisclosures(
  params: IterateDisclosuresParams,
): AsyncGenerator<DartDisclosureRow> {
  const PAGE_COUNT = 100;
  let pageNo = 1;
  let totalPage = 1;
  while (pageNo <= totalPage) {
    const page = await fetchDisclosurePage({
      ...params,
      pageNo,
      pageCount: PAGE_COUNT,
    });
    if (pageNo === 1) totalPage = page.totalPage;
    for (const row of page.rows) yield row;
    pageNo++;
    if (pageNo <= totalPage) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
  }
}
