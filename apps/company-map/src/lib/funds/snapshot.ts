import type { PrismaClient } from "@prisma-clients/company-map";
import { FUND, fetchFundPage, fetchFundNav, type FundHolding } from "./kb-fund";

// 스냅샷 기준일(KST yyyymmdd). 주말이면 직전 영업일로.
export function fundStamp(d = new Date()): string {
  const x = new Date(d);
  const day = x.getDay();
  if (day === 0) x.setDate(x.getDate() - 2);
  else if (day === 6) x.setDate(x.getDate() - 1);
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
}

// 보유종목 변동 여부 판정용 시그니처(순위·종목명·비중).
function signature(holdings: { name: string; weight: number | null; rank: number }[]): string {
  return [...holdings]
    .sort((a, b) => a.rank - b.rank)
    .map((h) => `${h.rank}:${h.name}:${h.weight ?? ""}`)
    .join("|");
}

// VIP 펀드의 NAV 시계열을 upsert하고, 보유 TOP10이 직전 스냅샷과 다를 때만
// 새 스냅샷을 남긴다(내용 기반 dedup). 펀드 보유는 운용보고서 기준이라 드물게
// 바뀌므로, 이력이 실제 구성 변동이 있을 때만 늘어난다.
// db는 worker / Next 서버 액션이 각자의 PrismaClient를 주입한다.
export async function snapshotFundWith(
  db: PrismaClient,
  trdDd = fundStamp(),
): Promise<"saved" | "skipped" | "failed"> {
  try {
    const [page, navPoints] = await Promise.all([fetchFundPage(), fetchFundNav()]);
    if (!page || page.holdings.length === 0) return "failed";

    // NAV 시계열 upsert (기존 날짜는 값 갱신).
    for (const p of navPoints) {
      await db.fundNav.upsert({
        where: { fundCode_date: { fundCode: FUND.code, date: p.date } },
        create: { fundCode: FUND.code, date: p.date, nav: p.nav },
        update: { nav: p.nav },
      });
    }
    const latestNav = navPoints.length > 0 ? navPoints[navPoints.length - 1].nav : null;

    // 같은 날 스냅샷이 이미 있으면 skip (재실행 방지).
    const today = await db.fundSnapshot.findUnique({
      where: { fundCode_trdDd: { fundCode: FUND.code, trdDd } },
    });
    if (today) return "skipped";

    // 직전 스냅샷과 보유 구성이 동일하면 새로 만들지 않음.
    const latest = await db.fundSnapshot.findFirst({
      where: { fundCode: FUND.code },
      orderBy: { trdDd: "desc" },
      include: { holdings: true },
    });
    if (latest && signature(latest.holdings) === signature(page.holdings)) {
      return "skipped";
    }

    await db.fundSnapshot.create({
      data: {
        fundCode: FUND.code,
        trdDd,
        nav: latestNav,
        holdings: {
          create: page.holdings.map((h: FundHolding) => ({
            name: h.name,
            weight: h.weight,
            rank: h.rank,
          })),
        },
      },
    });
    return "saved";
  } catch (err) {
    console.error("[fund-snapshot] failed:", err);
    return "failed";
  }
}
