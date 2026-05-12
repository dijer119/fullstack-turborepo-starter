import {
  getMonthlySummary,
  getMonthlyBreakdown,
  getTopCountries,
  listMonths,
} from "@/actions/trade";
import { CATEGORIES, type CategoryKey } from "@/lib/trade/categories";
import { TradeClient, type CategoryBundle } from "./TradeClient";

export const metadata = { title: "수출입 동향 — Company Map" };
export const dynamic = "force-dynamic";

async function loadCategory(key: CategoryKey): Promise<CategoryBundle> {
  const [summary, breakdown, months] = await Promise.all([
    getMonthlySummary(key),
    getMonthlyBreakdown(key),
    listMonths(key),
  ]);
  const latest = months[months.length - 1] ?? "";
  const topCountries = latest ? await getTopCountries(key, latest, 10) : [];
  return { key, summary, breakdown, months, latest, topCountries };
}

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const initialTab: CategoryKey =
    sp.tab === "cosmetics" ? "cosmetics" : "semiconductor";

  const bundles = await Promise.all(
    CATEGORIES.map((c) => loadCategory(c.key)),
  );

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">수출입 동향</h1>
        <p className="mt-1 text-sm text-gray-500">
          관세청 OpenAPI 기준 월별 통관 실적. 2025-01 이후 데이터.
        </p>
      </header>
      <TradeClient bundles={bundles} initialTab={initialTab} />
    </main>
  );
}
