"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ImportRow = {
  name: string;
  ticker?: string | null;
  market?: string | null;
};

export type ImportResult = {
  inserted: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

export async function importCompaniesAction(rows: ImportRow[]): Promise<ImportResult> {
  const supabase = await createClient();
  const result: ImportResult = { inserted: 0, skipped: 0, errors: [] };

  // 기존 ticker set 미리 로드 (1000개+ 일 때 N+1 회피)
  const { data: existing } = await supabase
    .from("companies")
    .select("ticker")
    .not("ticker", "is", null);
  const existingTickers = new Set((existing ?? []).map((r) => r.ticker as string));

  const toInsert: ImportRow[] = [];
  rows.forEach((row, idx) => {
    if (!row.name || !row.name.trim()) {
      result.errors.push({ row: idx + 1, message: "name 누락" });
      return;
    }
    if (row.ticker && existingTickers.has(row.ticker)) {
      result.skipped += 1;
      return;
    }
    if (row.ticker) existingTickers.add(row.ticker);
    toInsert.push({
      name: row.name.trim(),
      ticker: row.ticker?.trim() || null,
      market: row.market?.trim() || null,
    });
  });

  // 단일 사용자 가정: 동시 import 시 pre-loaded Set이 stale될 수 있음.
  // ticker UNIQUE 제약이 fallback (충돌 시 chunk 전체 실패 → 아래 errors에 명시).
  // 청크 단위 insert (Supabase request 크기 제한 회피)
  const CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const { error } = await supabase.from("companies").insert(chunk);
    if (error) {
      // chunk 전체가 실패함을 명시 (PG insert는 statement 단위 atomic)
      result.errors.push({
        row: i + 1,
        message: `chunk[${i}..${i + chunk.length - 1}] failed (${chunk.length}건): ${error.message}`,
      });
    } else {
      result.inserted += chunk.length;
    }
  }
  revalidatePath("/companies");
  return result;
}
