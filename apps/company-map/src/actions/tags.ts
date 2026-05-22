"use server";

import { db } from "@/lib/db";

export interface TagView {
  id: number;
  name: string;
}

/** 모든 tag를 name asc로 반환. 자동완성 + 필터 패널 chip 목록용. */
export async function listTags(): Promise<TagView[]> {
  const rows = await db.tag.findMany({ orderBy: { name: "asc" } });
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/** stockCode에 tagName 추가. Tag가 없으면 자동 생성. 같은 mapping 이미 있으면 no-op. */
export async function addTagToStock(
  stockCode: string,
  tagName: string,
): Promise<TagView | null> {
  const name = tagName.trim();
  if (!name) return null;
  if (!/^\d{6}$/.test(stockCode)) return null;

  const tag = await db.tag.upsert({
    where: { name },
    create: { name },
    update: {},
  });
  await db.stockTag.upsert({
    where: { stockCode_tagId: { stockCode, tagId: tag.id } },
    create: { stockCode, tagId: tag.id },
    update: {},
  });
  return { id: tag.id, name: tag.name };
}

export async function removeTagFromStock(
  stockCode: string,
  tagId: number,
): Promise<void> {
  if (!/^\d{6}$/.test(stockCode)) return;
  await db.stockTag.deleteMany({ where: { stockCode, tagId } });
}
