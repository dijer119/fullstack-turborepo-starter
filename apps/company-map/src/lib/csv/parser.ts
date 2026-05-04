import Papa from "papaparse";
import type { ImportRow } from "@/actions/import";

export type ParseResult = {
  rows: ImportRow[];
  errors: string[];
};

const COLUMN_ALIASES: Record<keyof ImportRow, string[]> = {
  name: ["name", "company", "회사명", "종목명", "기업명"],
  ticker: ["ticker", "code", "종목코드", "단축코드"],
  market: ["market", "시장구분", "시장"],
};

function pickColumn(headers: string[], aliases: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const a of aliases) {
    const idx = lower.indexOf(a.toLowerCase());
    if (idx >= 0) return headers[idx];
  }
  return null;
}

export async function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const errors: string[] = res.errors.map((e) => `행 ${e.row ?? "?"}: ${e.message}`);
        const headers = res.meta.fields ?? [];
        const nameCol = pickColumn(headers, COLUMN_ALIASES.name);
        const tickerCol = pickColumn(headers, COLUMN_ALIASES.ticker);
        const marketCol = pickColumn(headers, COLUMN_ALIASES.market);
        if (!nameCol) {
          if (headers.some((h) => /�/.test(h))) {
            errors.push(
              "헤더가 깨져 있습니다. CSV가 EUC-KR로 저장된 것으로 보입니다. UTF-8로 다시 저장해 주세요. (Excel: 다른 이름으로 저장 → CSV UTF-8)",
            );
          } else {
            errors.push("필수 컬럼 'name'(또는 종목명/회사명) 을 찾지 못했습니다.");
          }
          resolve({ rows: [], errors });
          return;
        }
        const rows: ImportRow[] = res.data.map((r) => ({
          name: r[nameCol] ?? "",
          ticker: tickerCol ? r[tickerCol] || null : null,
          market: marketCol ? r[marketCol] || null : null,
        }));
        resolve({ rows, errors });
      },
      error: (err) => resolve({ rows: [], errors: [err.message] }),
    });
  });
}
