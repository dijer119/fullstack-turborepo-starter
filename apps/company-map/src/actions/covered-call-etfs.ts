"use server";

import Papa from "papaparse";
import * as cheerio from "cheerio";
import { revalidatePath } from "next/cache";
import {
  getCoveredCallSnapshot,
  saveCoveredCallSnapshot,
} from "@/lib/etf/covered-call-snapshot";

const DISTRIBUTION_EXPORT_URL =
  "https://etf-lab.kr/api/etf/export?desc=true&sort=annual_yield&type=distribution";

type CsvRow = Record<string, string>;

interface DistributionItem {
  code: string;
  name: string;
  frequency: string;
  baseDate: string;
  payDate: string;
  recent: number;
  amount: number;
}

interface EtfDetail {
  price: number;
  priceDate: string;
  count: number;
}

export async function syncCoveredCallEtfs(): Promise<{
  ok: boolean;
  message: string;
  updatedAt?: string;
}> {
  try {
    const current = await getCoveredCallSnapshot();
    const response = await fetch(DISTRIBUTION_EXPORT_URL, {
      cache: "no-store",
      headers: { Accept: "text/csv", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`자료 제공처 응답 오류 (${response.status})`);

    const csv = await response.text();
    const parsed = Papa.parse<CsvRow>(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
    });
    if (parsed.errors.length > 0) throw new Error("분배금 CSV 형식을 읽지 못했습니다.");

    const distributions = parseDistributions(parsed.data);
    const byCode = new Map(distributions.map((row) => [row.code, row]));
    const matches = current.etfs.filter((etf) => byCode.has(etf.code));
    if (matches.length < Math.ceil(current.etfs.length * 0.75)) {
      throw new Error(`기존 ${current.etfs.length}종 중 ${matches.length}종만 확인되어 갱신을 중단했습니다.`);
    }

    const details = await mapWithConcurrency(matches, 6, async (etf) => {
      const detail = await fetchEtfDetail(etf.code);
      return [etf.code, detail] as const;
    });
    const detailByCode = new Map(details);

    const updated = current.etfs.map((etf) => {
      const distribution = byCode.get(etf.code);
      const detail = detailByCode.get(etf.code);
      if (!distribution || !detail) return etf;

      const frequency = distribution.frequency || etf.frequency;
      const count = detail.count;
      const amount = distribution.amount;
      const recent = distribution.recent;
      const annualPayments = annualPaymentCount(frequency);
      return {
        ...etf,
        name: distribution.name || etf.name,
        price: detail.price,
        price_date: detail.priceDate,
        amount,
        recent,
        frequency,
        count,
        base_date: distribution.baseDate || etf.base_date,
        pay_date: distribution.payDate || etf.pay_date,
        full: annualPayments ? count >= annualPayments : etf.full,
        source_basis: "actual_12m",
        yield_ttm: (amount / detail.price) * 100,
        yield_latest: (recent * annualPayments / detail.price) * 100,
        url: `https://etf-lab.kr/${etf.code}`,
      };
    });

    const unavailableDetails = matches.filter((etf) => !detailByCode.get(etf.code)).length;
    if (unavailableDetails > 0) {
      throw new Error(`${unavailableDetails}종의 종가·지급 이력을 가져오지 못해 현재 자료를 유지했습니다.`);
    }

    const savedAt = await saveCoveredCallSnapshot(updated);
    revalidatePath("/stocks/covered-call");
    return {
      ok: true,
      message: `${matches.length}종 ETF 데이터를 동기화했습니다.`,
      updatedAt: savedAt.toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "ETF 데이터 동기화에 실패했습니다.",
    };
  }
}

function parseDistributions(rows: CsvRow[]): DistributionItem[] {
  if (rows.length === 0) throw new Error("분배금 자료가 비어 있습니다.");
  const keys = Object.keys(rows[0]);
  const codeKey = findColumn(keys, ["종목코드", "단축코드", "ticker", "code"]);
  const nameKey = findColumn(keys, ["etf명", "종목명", "상품명", "name"]);
  const frequencyKey = findColumn(keys, ["지급주기", "분배주기", "주기", "frequency"]);
  const baseDateKey = findColumn(keys, ["지급기준일", "기준일", "base_date"]);
  const payDateKey = findColumn(keys, ["실제지급일", "지급일", "pay_date"]);
  const recentKey = findColumn(keys, ["최근분배금", "최근지급액", "최근지급", "recent"]);
  const amountKey = findColumn(keys, ["12개월합계", "12개월분배금", "12m합계", "amount"]);
  if (!nameKey || !recentKey || !amountKey) {
    throw new Error(`CSV 열 구성이 예상과 다릅니다: ${keys.join(", ")}`);
  }

  const results: DistributionItem[] = [];
  for (const row of rows) {
    const values = Object.values(row).map((value) => String(value ?? "").trim());
    const code = (codeKey ? row[codeKey] : undefined)?.trim() ?? values.find((value) => /^[0-9A-Z]{6}$/.test(value));
    const name = row[nameKey]?.trim();
    const recent = parseNumber(row[recentKey]);
    const amount = parseNumber(row[amountKey]);
    if (!code || !name || recent === null || amount === null) continue;
    results.push({
      code,
      name,
      frequency: frequencyKey ? normalizeFrequency(row[frequencyKey]) : "",
      baseDate: baseDateKey ? normalizeDate(row[baseDateKey]) : "",
      payDate: payDateKey ? normalizeDate(row[payDateKey]) : "",
      recent,
      amount,
    });
  }
  if (results.length === 0) throw new Error("ETF 코드와 분배금 정보를 찾지 못했습니다.");
  return results;
}

async function fetchEtfDetail(code: string): Promise<EtfDetail | null> {
  const response = await fetch(`https://etf-lab.kr/${code}`, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;

  const $ = cheerio.load(await response.text());
  const text = $("body").text().replace(/\s+/g, " ");
  const priceMatch = text.match(/([\d,]+)원.{0,60}?(\d{4}-\d{2}-\d{2})\s*종가/);
  const countMatch = text.match(/최근\s*12개월(?:간)?\s*(\d+)\s*회\s*지급/)
    ?? text.match(/최근\s*12개월\s*지급\s*횟수\s*(\d+)\s*회/);
  if (!priceMatch || !countMatch) return null;

  const price = Number(priceMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, priceDate: priceMatch[2], count: Number(countMatch[1]) };
}

function findColumn(keys: string[], candidates: string[]): string | undefined {
  const normalize = (value: string) => value.toLocaleLowerCase("ko-KR").replace(/[\s_()[\]%·-]/g, "");
  return keys.find((key) => candidates.some((candidate) => normalize(key).includes(normalize(candidate))));
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const result = Number(match[0]);
  return Number.isFinite(result) ? result : null;
}

function normalizeDate(value: string | undefined): string {
  if (!value) return "";
  const match = value.trim().match(/^(\d{2,4})[./-]?(\d{2})[./-]?(\d{2})$/);
  if (!match) return "";
  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  return `${year}-${match[2]}-${match[3]}`;
}

function normalizeFrequency(value: string | undefined): string {
  if (!value) return "";
  if (value.includes("주")) return value.includes("격") ? "격주" : "주";
  if (value.includes("월")) return "월";
  if (value.includes("분기")) return "분기";
  if (value.includes("반기")) return "반기";
  if (value.includes("연")) return "연";
  return value.trim();
}

function annualPaymentCount(frequency: string): number {
  if (frequency.includes("격주")) return 26;
  if (frequency.includes("주")) return 52;
  if (frequency.includes("월")) return 12;
  if (frequency.includes("분기")) return 4;
  if (frequency.includes("반기")) return 2;
  if (frequency.includes("연")) return 1;
  return 0;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await map(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
