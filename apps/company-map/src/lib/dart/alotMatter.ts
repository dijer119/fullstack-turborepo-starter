import type { DividendPayload } from "./disclosure-payloads";

interface AlotMatterItem {
  se?: string;
  stock_knd?: string;
  thstrm?: string;
  rcept_no?: string;
  bsns_year?: string;
  reprt_code?: string;
}

export interface AlotMatterResponse {
  status?: string;
  message?: string;
  list?: AlotMatterItem[];
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

function parseNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export async function fetchAlotMatter(params: {
  corpCode: string;
  bsnsYear: number;
  reprtCode: string;
}): Promise<AlotMatterResponse | null> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY not set");
  const url = new URL("https://opendart.fss.or.kr/api/alotMatter.json");
  url.searchParams.set("crtfc_key", apiKey);
  url.searchParams.set("corp_code", params.corpCode);
  url.searchParams.set("bsns_year", String(params.bsnsYear));
  url.searchParams.set("reprt_code", params.reprtCode);

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) return null;
      return (await resp.json()) as AlotMatterResponse;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isRetriable(err)) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      console.warn(
        `[dart] alotMatter fetch failed corp=${params.corpCode} year=${params.bsnsYear}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }
  return null;
}

export function extractDividendPayload(
  response: AlotMatterResponse | null,
): DividendPayload | null {
  if (!response || response.status !== "000" || !response.list) return null;

  const commonItems = response.list.filter(
    (it) => (it.stock_knd ?? "").includes("보통주"),
  );
  const items = commonItems.length > 0 ? commonItems : response.list;

  const findThstrm = (label: RegExp): string | undefined =>
    items.find((it) => label.test(it.se ?? ""))?.thstrm;

  const divPerShare = parseNum(findThstrm(/주당.*현금배당금/));
  const dividendYieldPct = parseNum(findThstrm(/시가배당률/));
  const recordRaw = findThstrm(/현금배당.*기준일|배당.*기준일/);
  const recordDate =
    recordRaw && /\d{4}/.test(recordRaw)
      ? recordRaw.replace(/[^\d]/g, "").replace(/^(\d{4})(\d{2})(\d{2}).*/, "$1-$2-$3")
      : null;

  if (divPerShare == null && dividendYieldPct == null && recordDate == null) {
    return null;
  }
  return {
    divPerShare,
    dividendYieldPct,
    recordDate,
    dividendType: "현금",
  };
}
