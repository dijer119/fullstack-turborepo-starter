"use server";

import * as XLSX from "xlsx";
import type { TopStockRow } from "@/types/stocks";

interface ExportOpts {
  sheetName?: string;
  filename: string;
}

export async function exportStocksExcel(
  stocks: TopStockRow[],
  opts: ExportOpts,
): Promise<{ buffer: Uint8Array; filename: string }> {
  const sheetName = opts.sheetName ?? "안전마진";
  const rows = stocks.map((s) => ({
    종목코드: s.code,
    종목명: s.name,
    현재가:
      s.currentPrice != null
        ? Math.round(s.currentPrice).toLocaleString()
        : "",
    내재가치:
      s.intrinsicValue != null
        ? Math.round(s.intrinsicValue).toLocaleString()
        : "",
    안전마진: s.safetyMargin != null ? s.safetyMargin.toFixed(2) : "",
    자사주비율: s.treasuryRatio != null ? s.treasuryRatio.toFixed(2) : "",
    배당수익률: s.dividendYield != null ? s.dividendYield.toFixed(2) : "",
    "마지막 업데이트": new Date(s.lastUpdated).toLocaleString("ko-KR"),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { buffer: new Uint8Array(buffer), filename: opts.filename };
}
