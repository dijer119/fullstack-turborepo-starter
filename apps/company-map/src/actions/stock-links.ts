"use server";

import { db } from "@/lib/db";
import {
  fetchOgMeta,
  inferKind,
  hostFromUrl,
  type LinkKind,
} from "@/lib/links/og-meta";

export interface StockLinkView {
  id: string;
  url: string;
  title: string | null;
  siteName: string | null;
  imageUrl: string | null;
  kind: LinkKind;
  memo: string | null;
  createdAt: string; // ISO 8601
}

interface StockLinkRow {
  id: string;
  url: string;
  title: string | null;
  siteName: string | null;
  imageUrl: string | null;
  kind: string;
  memo: string | null;
  createdAt: Date;
}

function toView(row: StockLinkRow): StockLinkView {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    siteName: row.siteName,
    imageUrl: row.imageUrl,
    kind: row.kind === "news" ? "news" : "blog",
    memo: row.memo,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 종목별 링크 목록 (최신순). */
export async function listLinksByCode(code: string): Promise<StockLinkView[]> {
  if (!/^\d{6}$/.test(code)) return [];
  const rows = await db.stockLink.findMany({
    where: { code },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toView);
}

export type AddLinkResult =
  | { ok: true; link: StockLinkView }
  | { ok: false; error: string };

/** URL 저장 + OG 메타 자동 추출. 중복(code,url)이면 기존 row 반환 (idempotent). */
export async function addLink(
  code: string,
  rawUrl: string,
): Promise<AddLinkResult> {
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "잘못된 종목 코드" };
  const url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: "http(s) URL만 저장할 수 있습니다" };
  }

  const master = await db.stockMaster.findUnique({
    where: { code },
    select: { code: true },
  });
  if (!master) return { ok: false, error: "존재하지 않는 종목입니다" };

  const existing = await db.stockLink.findUnique({
    where: { code_url: { code, url } },
  });
  if (existing) return { ok: true, link: toView(existing) };

  const meta = await fetchOgMeta(url);
  const created = await db.stockLink.create({
    data: {
      code,
      url,
      title: meta.title,
      siteName: meta.siteName ?? hostFromUrl(url),
      imageUrl: meta.imageUrl,
      kind: inferKind(url),
      memo: null,
    },
  });
  return { ok: true, link: toView(created) };
}

/** 종류·메모 수동 편집. 빈 메모는 null로 저장. */
export async function updateLink(
  id: string,
  patch: { kind?: LinkKind; memo?: string | null },
): Promise<StockLinkView | null> {
  const data: { kind?: string; memo?: string | null } = {};
  if (patch.kind === "blog" || patch.kind === "news") data.kind = patch.kind;
  if (patch.memo !== undefined) {
    const trimmed = patch.memo?.trim() ?? "";
    data.memo = trimmed === "" ? null : trimmed;
  }
  try {
    const updated = await db.stockLink.update({ where: { id }, data });
    return toView(updated);
  } catch {
    return null;
  }
}

/** 링크 삭제. */
export async function deleteLink(id: string): Promise<{ ok: boolean }> {
  try {
    await db.stockLink.delete({ where: { id } });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
