import type { ContractPayload } from "./disclosure-payloads";

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

async function fetchDartPage(url: string): Promise<string | null> {
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
      // DART viewer.do는 EUC-KR 인코딩이고 Content-Type 헤더로 charset 알림.
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
        // fallback: try euc-kr (Node 22 ICU 보통 지원). 실패시 latin1로 raw 반환.
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

function extractViewerParams(mainHtml: string, rcpNo: string): ViewerParams | null {
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

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseNum(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.\-]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function extractCell(html: string, labelRegex: RegExp): string | null {
  // 라벨 td 바로 다음에 오는 td의 값을 캡처. labelRegex 안의 |는 non-capturing group으로 격리.
  const re = new RegExp(
    `<t[dh][^>]*>[\\s\\S]*?(?:${labelRegex.source})[\\s\\S]*?</t[dh]>\\s*<t[dh][^>]*>([\\s\\S]*?)</t[dh]>`,
    "i",
  );
  const m = html.match(re);
  if (!m || !m[1]) return null;
  const value = decodeEntities(stripTags(m[1]));
  return value.length > 0 ? value : null;
}

function splitPeriod(period: string | null): {
  start: string | null;
  end: string | null;
} {
  if (!period) return { start: null, end: null };
  const all = period.match(/\d{4}[.\-]?\d{2}[.\-]?\d{2}/g) ?? [];
  return {
    start: normalizeDate(all[0] ?? null),
    end: normalizeDate(all[1] ?? null),
  };
}

function parseContractBody(viewerHtml: string): Partial<ContractPayload> {
  const content = extractCell(
    viewerHtml,
    /판매[·ㆍ]?공급계약[ ]?내용|계약내용|판매[·ㆍ]?공급계약[ ]?구분|계약[ ]?구분/,
  );
  const counterparty = extractCell(viewerHtml, /계약상대[방]?/);
  const region = extractCell(viewerHtml, /판매[·ㆍ]?공급지역|공급지역/);
  const amountRaw = extractCell(viewerHtml, /계약금액|계약[ ]?금액/);
  const ratioRaw = extractCell(viewerHtml, /매출액[ ]?대비|매출액대비/);
  const startRaw = extractCell(viewerHtml, /시작일/);
  const endRaw = extractCell(viewerHtml, /종료일/);
  const periodCombined = extractCell(viewerHtml, /계약기간/);
  const contractDateRaw = extractCell(
    viewerHtml,
    /계약(?:[(][^)]+[)])?[ ]?일자|계약일/,
  );

  let startDate = normalizeDate(startRaw);
  let endDate = normalizeDate(endRaw);
  if (!startDate && !endDate) {
    const split = splitPeriod(periodCombined);
    startDate = split.start;
    endDate = split.end;
  }

  return {
    contractContent: content,
    counterparty,
    supplyRegion: region,
    amount: parseNum(amountRaw),
    recentSalesRatio: parseNum(ratioRaw),
    startDate,
    endDate,
    contractDate: normalizeDate(contractDateRaw),
  };
}

export async function fetchContractDetail(
  rcpNo: string,
): Promise<ContractPayload | null> {
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
  const viewerHtml = await fetchDartPage(viewerUrl);
  if (!viewerHtml) return null;

  const parsed = parseContractBody(viewerHtml);
  return {
    contractDate: parsed.contractDate ?? null,
    startDate: parsed.startDate ?? null,
    endDate: parsed.endDate ?? null,
    contractContent: parsed.contractContent ?? null,
    counterparty: parsed.counterparty ?? null,
    supplyRegion: parsed.supplyRegion ?? null,
    amount: parsed.amount ?? null,
    recentSalesRatio: parsed.recentSalesRatio ?? null,
  };
}
