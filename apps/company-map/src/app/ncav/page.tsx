import { getNcavStocks } from "@/actions/ncav";
import { NcavClient } from "./NcavClient";

export const metadata = { title: "NCAV 스크리닝 — Company Map" };
export const dynamic = "force-dynamic";

export default async function NcavPage() {
  const initial = await getNcavStocks({ limit: 50 });
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">NCAV 스크리닝</h1>
        <p className="mt-1 text-sm text-gray-500">
          (유동자산 - 부채총계) &gt; 시가총액 — 그레이엄 청산가치 전략.
        </p>
      </header>
      <NcavClient initial={initial} />
    </main>
  );
}
