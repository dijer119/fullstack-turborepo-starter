import { db } from "./db";
import { fetchNaverEtf, lastBusinessDay } from "./fetch-naver-etf";
import { topN } from "@/lib/etf/diff";

// 관심 ETF 1개의 최신 영업일 스냅샷을 저장(상위 10). 이미 있으면 skip.
// 데이터 소스: Naver 모바일 ETF API (KRX MDC는 이 환경에서 차단됨).
export async function snapshotEtf(
  code: string,
  trdDd = lastBusinessDay(),
): Promise<"saved" | "skipped" | "failed"> {
  try {
    const watch = await db.etfWatch.findUnique({ where: { code } });
    if (!watch) return "failed";

    const res = await fetchNaverEtf(code);
    if (!res || res.holdings.length === 0) return "failed";

    // ETF명 보강 (등록 시엔 코드만 저장했으므로)
    if (res.name && res.name !== watch.name) {
      await db.etfWatch.update({ where: { code }, data: { name: res.name } });
    }

    const existing = await db.etfPdfSnapshot.findUnique({
      where: { etfCode_trdDd: { etfCode: code, trdDd } },
    });
    if (existing) return "skipped";

    const holdings = topN(res.holdings, 10);
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
