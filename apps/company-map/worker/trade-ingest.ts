import { db } from "./db";
import { syncMonth, type SyncMonthResult } from "../src/lib/trade/upsert";
import type { CategoryKey } from "../src/lib/trade/categories";

export type IngestResult = SyncMonthResult;

export async function ingestMonth(
  category: CategoryKey,
  yearMonth6: string,
): Promise<IngestResult> {
  return syncMonth(db, category, yearMonth6);
}

export function listMonths(start: string, end: string): string[] {
  const sy = Number(start.slice(0, 4));
  const sm = Number(start.slice(4, 6));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(4, 6));
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      y += 1;
      m = 1;
    }
  }
  return out;
}

export async function ingestRange(
  category: CategoryKey,
  start: string,
  end: string,
  opts: { sleepMs?: number; onProgress?: (r: IngestResult) => void } = {},
): Promise<IngestResult[]> {
  const months = listMonths(start, end);
  const results: IngestResult[] = [];
  for (const ym of months) {
    const r = await ingestMonth(category, ym);
    results.push(r);
    opts.onProgress?.(r);
    if (opts.sleepMs && opts.sleepMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, opts.sleepMs));
    }
  }
  return results;
}
