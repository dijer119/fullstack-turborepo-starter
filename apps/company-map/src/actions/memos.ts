"use server";

import { db } from "@/lib/db";

/** 종목 메모 본문 조회. 없으면 null. */
export async function getMemoByCode(code: string): Promise<string | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const row = await db.stockMemo.findUnique({ where: { code } });
  return row?.text ?? null;
}

/** 메모 저장/삭제. trim 후 빈 string이면 delete (idempotent).
 *  반환값으로 클라이언트가 hasMemo 상태 동기화. */
export async function setMemo(
  code: string,
  text: string,
): Promise<{ hasMemo: boolean }> {
  if (!/^\d{6}$/.test(code)) return { hasMemo: false };
  const trimmed = text.trim();
  if (!trimmed) {
    await db.stockMemo.deleteMany({ where: { code } });
    return { hasMemo: false };
  }
  await db.stockMemo.upsert({
    where: { code },
    create: { code, text: trimmed },
    update: { text: trimmed },
  });
  return { hasMemo: true };
}
