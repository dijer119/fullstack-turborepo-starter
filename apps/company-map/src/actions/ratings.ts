"use server";

import { isValidStockCode } from "@/lib/stocks/stock-code";
import { db } from "@/lib/db";

export type Grade = "high" | "mid" | "low";

const VALID_GRADES: Grade[] = ["high", "mid", "low"];

function isGrade(v: string | null): v is Grade {
  return v != null && (VALID_GRADES as string[]).includes(v);
}

/** 종목 등급 조회. 없으면 null. */
export async function getRatingByCode(code: string): Promise<Grade | null> {
  if (!isValidStockCode(code)) return null;
  const row = await db.stockRating.findUnique({ where: { code } });
  return isGrade(row?.grade ?? null) ? (row!.grade as Grade) : null;
}

/** 등급 저장/삭제. null이면 미지정으로 삭제 (idempotent).
 *  반환값으로 클라이언트가 현재 등급 동기화. */
export async function setRating(
  code: string,
  grade: Grade | null,
): Promise<{ grade: Grade | null }> {
  if (!isValidStockCode(code)) return { grade: null };
  if (grade === null) {
    await db.stockRating.deleteMany({ where: { code } });
    return { grade: null };
  }
  if (!isGrade(grade)) return { grade: null };
  await db.stockRating.upsert({
    where: { code },
    create: { code, grade },
    update: { grade },
  });
  return { grade };
}
