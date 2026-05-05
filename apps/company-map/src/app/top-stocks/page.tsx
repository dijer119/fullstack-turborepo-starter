import { QuoteBanner } from "@/components/stocks/QuoteBanner";
import { getTopStocks } from "@/actions/stocks";
import { SafetyMarginFormulaTooltip } from "@/components/stocks/SafetyMarginFormulaTooltip";
import { TopStocksClient } from "./TopStocksClient";

export const metadata = { title: "안전마진 상위종목 — Company Map" };
export const dynamic = "force-dynamic";

export default async function TopStocksPage() {
  const initial = await getTopStocks({ limit: 30, dividend: null });
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">안전마진 상위종목</h1>
          <SafetyMarginFormulaTooltip />
        </div>
        <p className="mt-1 text-sm text-gray-500">
          내재가치 대비 현재가가 가장 저평가된 종목 (워커가 분석한 결과 기준).
        </p>
      </header>
      <QuoteBanner />
      <TopStocksClient initial={initial} />
    </main>
  );
}
