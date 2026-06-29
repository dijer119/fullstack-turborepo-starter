import {
  getStocksExplorer,
  type MarketFilter,
  type StocksSort,
} from "@/actions/stocks-explorer";
import type { Grade } from "@/actions/ratings";
import { StocksExplorerClient, type StocksExplorerView } from "./StocksExplorerClient";
import { listRefreshStates } from "@/actions/refresh-jobs";
import { listTags } from "@/actions/tags";
import { RefreshMenu } from "./RefreshMenu";
import Link from "next/link";

export const metadata = { title: "전종목 조회 — Company Map" };
export const dynamic = "force-dynamic";

function parseOptionalNumber(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 최소값 필터용: 0과 음수도 허용(예: 순이익 최소 0 = 흑자만). 빈 값/NaN은 null.
function parseMinNumber(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default async function StocksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  const market: MarketFilter =
    sp.market === "KOSPI" || sp.market === "KOSDAQ" ? sp.market : "ALL";
  const sort: StocksSort =
    sp.sort === "name_asc" ||
    sp.sort === "safetyMargin_desc" ||
    sp.sort === "dividendYield_desc" ||
    sp.sort === "yoy_desc"
      ? sp.sort
      : "marcap_desc";
  const rawPage = Number(sp.page ?? "1");
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const tagIds = (sp.tags ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const grades = (sp.grades ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((g): g is Grade => g === "high" || g === "mid" || g === "low");

  const view: StocksExplorerView = {
    market,
    search: sp.search ?? "",
    minMarcapEok: parseOptionalNumber(sp.minMarcap),
    maxMarcapEok: parseOptionalNumber(sp.maxMarcap),
    perMax: parseOptionalNumber(sp.perMax),
    pbrMax: parseOptionalNumber(sp.pbrMax),
    netIncomeYoyMin: parseMinNumber(sp.netYoyMin),
    opIncomeYoyMin: parseMinNumber(sp.opYoyMin),
    dividendYieldMin: parseMinNumber(sp.divMin),
    seojunsikIndexMin: parseMinNumber(sp.seojunsikMin),
    excludeLoss: sp.excludeLoss === "1",
    analyzedOnly: sp.analyzed === "1",
    vipOnly: sp.vip === "1",
    memoOnly: sp.memo === "1",
    tagIds,
    grades,
    sort,
    page,
    pageSize: 50,
  };

  const { rows, total } = await getStocksExplorer(view);
  const refreshStates = await listRefreshStates();
  const allTags = await listTags();

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">전종목 조회</h1>
          <p className="mt-1 text-sm text-gray-500">
            KOSPI · KOSDAQ 전체 상장 종목. 필터·정렬로 탐색하세요.
          </p>
          <div className="flex gap-3">
            <Link href="/stocks/etf" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              액티브 ETF 구성종목 변화 →
            </Link>
            <Link href="/stocks/toss-holdings" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              토스증권 보유종목 →
            </Link>
            <Link href="/stocks/watchlist" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              관심종목 →
            </Link>
            <Link href="/stocks/funds" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              VIP 펀드 →
            </Link>
            <Link href="/stocks/infinite-buy" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              무한매수법 →
            </Link>
          </div>
        </div>
        <RefreshMenu initialStates={refreshStates} />
      </header>
      <StocksExplorerClient rows={rows} total={total} view={view} allTags={allTags} />
    </main>
  );
}
