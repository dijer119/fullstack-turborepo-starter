"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma-clients/company-map";
import { db } from "@/lib/db";

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
  const result: ImportResult = { inserted: 0, skipped: 0, errors: [] };
  if (rows.length === 0) return result;

  // 기존 ticker 미리 로드 (1000개+ 일 때 N+1 회피)
  // 단일 사용자 가정: 동시 import 시 stale Set 위험 있음. ticker UNIQUE 제약이 fallback.
  const existing = await db.company.findMany({
    where: { ticker: { not: null } },
    select: { ticker: true },
  });
  const existingTickers = new Set(existing.map((r) => r.ticker as string));

  const toInsert: { name: string; ticker: string | null; market: string | null }[] = [];
  rows.forEach((row, idx) => {
    if (!row.name || !row.name.trim()) {
      result.errors.push({ row: idx + 1, message: "name 누락" });
      return;
    }
    const ticker = row.ticker?.trim() || null;
    if (ticker && existingTickers.has(ticker)) {
      result.skipped += 1;
      return;
    }
    if (ticker) existingTickers.add(ticker);
    toInsert.push({
      name: row.name.trim(),
      ticker,
      market: row.market?.trim() || null,
    });
  });

  // SQLite의 SQLITE_MAX_VARIABLE_NUMBER 기본값(보통 32766) 회피 + 큰 트랜잭션 회피
  const CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    try {
      await db.company.createMany({ data: chunk });
      result.inserted += chunk.length;
    } catch (e) {
      const msg =
        e instanceof Prisma.PrismaClientKnownRequestError
          ? `${e.code}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      result.errors.push({
        row: i + 1,
        message: `chunk[${i}..${i + chunk.length - 1}] failed (${chunk.length}건): ${msg}`,
      });
    }
  }
  revalidatePath("/companies");
  return result;
}
