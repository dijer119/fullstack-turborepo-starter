const MAJORSTOCK_URL = "https://opendart.fss.or.kr/api/majorstock.json";

export interface MajorStockRow {
  rcpNo: string;
  stockRatio: number | null;
  stockRatioChange: number | null;
  reportResn: string;
}

interface RawRow {
  rcept_no?: string;
  stkrt?: string;
  stkrt_irds?: string;
  report_resn?: string;
}

interface RawResponse {
  status: string;
  message?: string;
  list?: RawRow[];
}

/** OpenDART는 숫자를 string으로 반환. 빈값/"-"/공백만 → null. NaN → null. */
function parseNumeric(v: string | undefined): number | null {
  if (v == null) return null;
  const trimmed = v.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

export async function fetchMajorStockByCorp(
  corpCode: string,
): Promise<MajorStockRow[]> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY not set");

  const qs = new URLSearchParams({
    crtfc_key: apiKey,
    corp_code: corpCode,
  });

  const res = await fetch(`${MAJORSTOCK_URL}?${qs.toString()}`);
  if (!res.ok) throw new Error(`DART majorstock HTTP ${res.status}`);

  const data = (await res.json()) as RawResponse;

  if (data.status === "013") return [];
  if (data.status !== "000") {
    throw new Error(`DART status ${data.status}: ${data.message ?? "unknown"}`);
  }

  return (data.list ?? []).map<MajorStockRow>((r) => ({
    rcpNo: r.rcept_no ?? "",
    stockRatio: parseNumeric(r.stkrt),
    stockRatioChange: parseNumeric(r.stkrt_irds),
    reportResn: r.report_resn ?? "",
  }));
}
