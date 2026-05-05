import * as cheerio from "cheerio";
import type {
  AnalyzeStockResult,
  FinancialPeriod,
  TreasuryStockInfo,
} from "@/types/stocks";

function parseNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").replace(/−/g, "-").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "N/A") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseNaverMain(
  html: string,
): Pick<
  AnalyzeStockResult,
  "stockName" | "currentPrice" | "dividendYield" | "historicalData"
> {
  const $ = cheerio.load(html);

  const stockName = $("#middle h2 a").first().text().trim() || "Unknown";
  const currentPrice = parseNumber(
    $("#chart_area p.no_today em .blind").first().text(),
  );

  const dvrText = $("#_dvr").first().text().trim().replace("%", "");
  const dividendYield = dvrText && dvrText !== "N/A" ? parseNumber(dvrText) : null;

  // 재무지표 표: table.tb_type1.tb_num.tb_type1_ifrs 안에서 th 텍스트로 row 식별.
  // 컬럼 순서 (원본 td[1..3] = 최근 3개 연간 실적):
  //   td[0]=3년전 연간, td[1]=2년전 연간, td[2]=직전년도 연간, td[3]=다음년도(E),
  //   td[4..]=분기 실적
  const finTable = $("#content table.tb_type1.tb_num.tb_type1_ifrs").first();
  const findRow = (label: string) =>
    finTable.find("tbody > tr").filter((_, tr) => {
      const th = $(tr).find("th").first().text().trim();
      return th.startsWith(label);
    }).first();

  const epsRow = findRow("EPS");
  const bpsRow = findRow("BPS");
  const pbrRow = findRow("PBR");
  const perRow = findRow("PER");

  const cellAt = (row: ReturnType<typeof finTable.find>, colIdx: number): number | null => {
    if (!row.length) return null;
    const td = row.find("td").eq(colIdx - 1);
    if (!td.length) return null;
    return parseNumber(td.text());
  };

  const periods = ["3년전", "2년전", "직전년도"] as const;
  const historicalData = {} as AnalyzeStockResult["historicalData"];
  for (let i = 0; i < 3; i++) {
    const period = periods[i];
    const col = i + 1;
    historicalData[period] = {
      PBR: cellAt(pbrRow, col),
      PER: cellAt(perRow, col),
      EPS: cellAt(epsRow, col),
      BPS: cellAt(bpsRow, col),
    } satisfies FinancialPeriod;
  }

  return { stockName, currentPrice, dividendYield, historicalData };
}

export function parseTreasuryStock(html: string): TreasuryStockInfo {
  const $ = cheerio.load(html);
  let shares = 0;
  let ratio = 0;
  $("tr").each((_, tr) => {
    const text = $(tr).text();
    if (text.includes("자사주") || text.includes("자기주식")) {
      const tds = $(tr).find("td");
      const sharesParsed = parseNumber(tds.eq(1).text());
      const ratioParsed = parseNumber(tds.eq(2).text().replace("%", ""));
      if (sharesParsed !== null) shares = sharesParsed;
      if (ratioParsed !== null) ratio = ratioParsed;
      return false;
    }
  });
  return { shares, ratio };
}

const FETCH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNaverMain(ticker: string): Promise<string> {
  const url = `https://finance.naver.com/item/main.naver?code=${ticker}`;
  const resp = await fetchWithTimeout(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!resp.ok) throw new Error(`Naver main fetch failed: ${resp.status}`);
  return await resp.text();
}

export async function fetchWisereport(ticker: string): Promise<string> {
  const url = `https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${ticker}`;
  const resp = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://finance.naver.com",
    },
  });
  if (!resp.ok) throw new Error(`Wisereport fetch failed: ${resp.status}`);
  return await resp.text();
}
