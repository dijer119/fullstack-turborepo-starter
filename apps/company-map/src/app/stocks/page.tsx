import {
  getStocksExplorer,
  type MarketFilter,
  type StocksSort,
} from "@/actions/stocks-explorer";
import { StocksExplorerClient, type StocksExplorerView } from "./StocksExplorerClient";

export const metadata = { title: "전종목 조회 — Company Map" };
export const dynamic = "force-dynamic";

function parseOptionalNumber(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
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
    sp.sort === "name_asc" || sp.sort === "safetyMargin_desc"
      ? sp.sort
      : "marcap_desc";
  const rawPage = Number(sp.page ?? "1");
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const view: StocksExplorerView = {
    market,
    search: sp.search ?? "",
    minMarcapEok: parseOptionalNumber(sp.minMarcap),
    maxMarcapEok: parseOptionalNumber(sp.maxMarcap),
    perMax: parseOptionalNumber(sp.perMax),
    pbrMax: parseOptionalNumber(sp.pbrMax),
    analyzedOnly: sp.analyzed === "1",
    vipOnly: sp.vip === "1",
    sort,
    page,
    pageSize: 50,
  };

  const { rows, total } = await getStocksExplorer(view);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">전종목 조회</h1>
        <p className="mt-1 text-sm text-gray-500">
          KOSPI · KOSDAQ 전체 상장 종목. 필터·정렬로 탐색하세요.
        </p>
      </header>
      <StocksExplorerClient rows={rows} total={total} view={view} />
    </main>
  );
}
