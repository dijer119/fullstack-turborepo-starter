import type { ElestockDetail } from "./disclosure-payloads";

interface ElestockItem {
  rcept_no?: string;
  repror?: string;
  isu_exctv_rgist_at?: string;     // "등기임원" | "비등기임원" 등
  isu_exctv_ofcps?: string;        // 직위 (예: 상무)
  isu_main_shrholdr?: string;      // "-" 또는 "주요주주"
  sp_stock_lmp_cnt?: string;       // 거래후 소유 주식수
  sp_stock_lmp_irds_cnt?: string;  // 변동 주식수 (±)
  sp_stock_lmp_rate?: string;      // 소유 비율 %
  sp_stock_lmp_irds_rate?: string; // 비율 변동 (±)
  [k: string]: string | undefined;
}

interface ElestockResponse {
  status?: string;
  message?: string;
  list?: ElestockItem[];
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

function parseSignedNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isMain(v: string | undefined): boolean {
  if (!v) return false;
  return v !== "-" && v.length > 0 && v !== "N";
}

export async function fetchElestock(params: {
  corpCode: string;
  bgnDe: string;
  endDe: string;
}): Promise<ElestockResponse | null> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY not set");
  const url = new URL("https://opendart.fss.or.kr/api/elestock.json");
  url.searchParams.set("crtfc_key", apiKey);
  url.searchParams.set("corp_code", params.corpCode);
  url.searchParams.set("bgn_de", params.bgnDe);
  url.searchParams.set("end_de", params.endDe);

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) return null;
      return (await resp.json()) as ElestockResponse;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isRetriable(err)) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      console.warn(
        `[dart] elestock fetch failed corp=${params.corpCode}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }
  return null;
}

export async function buildElestockMap(params: {
  corpCode: string;
  bgnDe: string;
  endDe: string;
}): Promise<Map<string, ElestockDetail>> {
  const resp = await fetchElestock(params);
  const map = new Map<string, ElestockDetail>();
  if (!resp || resp.status !== "000" || !resp.list) return map;

  for (const item of resp.list) {
    if (!item.rcept_no) continue;
    const detail: ElestockDetail = {
      type: "elestock",
      filer: item.repror ?? null,
      rgistAt: item.isu_exctv_rgist_at ?? null,
      position: item.isu_exctv_ofcps ?? null,
      isMainShareholder: isMain(item.isu_main_shrholdr),
      ownedAfterShares: parseSignedNum(item.sp_stock_lmp_cnt),
      changeShares: parseSignedNum(item.sp_stock_lmp_irds_cnt),
      ownedRatio: parseSignedNum(item.sp_stock_lmp_rate),
      changeRatio: parseSignedNum(item.sp_stock_lmp_irds_rate),
    };
    map.set(item.rcept_no, detail);
  }
  return map;
}
