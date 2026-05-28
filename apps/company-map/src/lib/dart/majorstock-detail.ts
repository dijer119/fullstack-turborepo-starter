import type { MajorstockDetail } from "./disclosure-payloads";

interface MajorstockItem {
  rcept_no?: string;
  repror?: string;
  stkqy?: string;
  stkrt?: string;
  stkrt_irds?: string;
  report_resn?: string;
  report_tp?: string;
  [k: string]: string | undefined;
}

interface MajorstockResponse {
  status?: string;
  message?: string;
  list?: MajorstockItem[];
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

export async function fetchMajorstockDetail(params: {
  corpCode: string;
  bgnDe: string;
  endDe: string;
}): Promise<MajorstockResponse | null> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY not set");
  const url = new URL("https://opendart.fss.or.kr/api/majorstock.json");
  url.searchParams.set("crtfc_key", apiKey);
  url.searchParams.set("corp_code", params.corpCode);
  url.searchParams.set("bgn_de", params.bgnDe);
  url.searchParams.set("end_de", params.endDe);

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) return null;
      return (await resp.json()) as MajorstockResponse;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isRetriable(err)) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      console.warn(
        `[dart] majorstock-detail fetch failed corp=${params.corpCode}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }
  return null;
}

export async function buildMajorstockMap(params: {
  corpCode: string;
  bgnDe: string;
  endDe: string;
}): Promise<Map<string, MajorstockDetail>> {
  const resp = await fetchMajorstockDetail(params);
  const map = new Map<string, MajorstockDetail>();
  if (!resp || resp.status !== "000" || !resp.list) return map;

  for (const item of resp.list) {
    if (!item.rcept_no) continue;
    const detail: MajorstockDetail = {
      type: "majorstock",
      filer: item.repror ?? null,
      ownedShares: parseSignedNum(item.stkqy),
      ownedRatio: parseSignedNum(item.stkrt),
      changeRatio: parseSignedNum(item.stkrt_irds),
      reason:
        item.report_resn ??
        (item.report_tp ? `${item.report_tp}투자` : null),
    };
    map.set(item.rcept_no, detail);
  }
  return map;
}
