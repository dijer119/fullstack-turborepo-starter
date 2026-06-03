import { db } from "./db";
import { resolveEtf, fetchEtfPdf, lastBusinessDay } from "./fetch-krx-etf";
import { topN } from "@/lib/etf/diff";

// 관심 ETF 1개의 최신 영업일 스냅샷을 저장(상위 10). 이미 있으면 skip.
export async function snapshotEtf(code: string, trdDd = lastBusinessDay()): Promise<"saved" | "skipped" | "failed"> {
  try {
    const watch = await db.etfWatch.findUnique({ where: { code } });
    if (!watch) return "failed";

    let isin = watch.isin;
    if (!isin) {
      const r = await resolveEtf(code, trdDd);
      if (!r) return "failed";
      isin = r.isin;
      await db.etfWatch.update({ where: { code }, data: { isin: r.isin, name: r.name } });
    }

    const existing = await db.etfPdfSnapshot.findUnique({ where: { etfCode_trdDd: { etfCode: code, trdDd } } });
    if (existing) return "skipped";

    const holdings = topN(await fetchEtfPdf(isin, trdDd), 10);
    if (holdings.length === 0) return "failed";

    await db.etfPdfSnapshot.create({
      data: {
        etfCode: code,
        trdDd,
        holdings: {
          create: holdings.map((h) => ({
            constituentCode: h.constituentCode,
            constituentName: h.constituentName,
            weight: h.weight,
            shares: h.shares,
            amount: h.amount,
          })),
        },
      },
    });
    return "saved";
  } catch (err) {
    console.error(`[etf-snapshot] ${code} failed:`, err);
    return "failed";
  }
}

// 모든 관심 ETF 스냅샷. 개별 실패가 전체를 막지 않음.
export async function snapshotAllEtfs(): Promise<void> {
  const watches = await db.etfWatch.findMany();
  const trdDd = lastBusinessDay();
  for (const w of watches) {
    const r = await snapshotEtf(w.code, trdDd);
    console.log(`[etf-snapshot] ${w.code} (${trdDd}): ${r}`);
  }
}
