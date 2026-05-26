import type { PrismaClient } from "@prisma-clients/company-map";
import { fetchTradeRaw, type RawTradeItem } from "./customs-api";
import { getCategory, type CategoryKey } from "./categories";

export type SyncMonthResult = {
  category: CategoryKey;
  yearMonth: string;
  fetched: number;
  saved: number;
};

function toBigInt(v: string | number | undefined): bigint {
  if (v === undefined || v === null || v === "" || v === "-") return 0n;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.trunc(n));
}

function isTotalRow(item: RawTradeItem): boolean {
  return item.year === "총계" || item.hsCd === "-" || item.statCd === "-";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 단일 월(YYYYMM) 데이터를 가져와 upsert. 카테고리에 여러 hsSgn이 있으면
 * 모두 호출 후 합산. PrismaClient는 주입 — worker / server actions 공용.
 */
export async function syncMonth(
  db: PrismaClient,
  category: CategoryKey,
  yearMonth6: string,
): Promise<SyncMonthResult> {
  const def = getCategory(category);
  let totalFetched = 0;
  let totalSaved = 0;

  for (let i = 0; i < def.hsSgnList.length; i += 1) {
    const hsSgn = def.hsSgnList[i];
    const raw = await fetchTradeRaw({
      startYm: yearMonth6,
      endYm: yearMonth6,
      hsSgn,
    });
    totalFetched += raw.length;

    for (const item of raw) {
      if (isTotalRow(item)) continue;
      await db.tradeStat.upsert({
        where: {
          uniq_cat_ym_hs_cnty: {
            category,
            yearMonth: item.year,
            hsCode: item.hsCd,
            countryCd: item.statCd,
          },
        },
        create: {
          category,
          yearMonth: item.year,
          hsCode: item.hsCd,
          hsCodeName: item.statKor,
          countryCd: item.statCd,
          countryName: item.statCdCntnKor1,
          expDlr: toBigInt(item.expDlr),
          impDlr: toBigInt(item.impDlr),
          expWgt: toBigInt(item.expWgt),
          impWgt: toBigInt(item.impWgt),
          balPayments: toBigInt(item.balPayments),
        },
        update: {
          hsCodeName: item.statKor,
          countryName: item.statCdCntnKor1,
          expDlr: toBigInt(item.expDlr),
          impDlr: toBigInt(item.impDlr),
          expWgt: toBigInt(item.expWgt),
          impWgt: toBigInt(item.impWgt),
          balPayments: toBigInt(item.balPayments),
          fetchedAt: new Date(),
        },
      });
      totalSaved += 1;
    }

    // 같은 카테고리 내 다른 hsSgn 호출 사이엔 약간 sleep — 게이트웨이 burst 방지.
    if (i < def.hsSgnList.length - 1) await sleep(150);
  }

  return {
    category,
    yearMonth: yearMonth6,
    fetched: totalFetched,
    saved: totalSaved,
  };
}
