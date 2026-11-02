import Link from "next/link";
import { notFound } from "next/navigation";
import { listSplitSimulations } from "@/actions/split";
import { SplitManager } from "../../SplitManager";
import { SplitNavigation } from "../../SplitNavigation";

export const dynamic = "force-dynamic";

export default async function SimulationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const simulations = await listSplitSimulations(id);
  const strategy = simulations[0];
  if (!strategy) notFound();
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <Link href="/stocks/split?mode=simulation" className="text-sm text-blue-ink hover:underline">← 종목 목록</Link>
    <header><h1 className="text-2xl font-bold">{strategy.config.name || strategy.config.symbol} · 모의 진행 현황</h1><p className="mt-2 text-sm text-muted">모의 전용이며 실제 주문을 보내지 않습니다. 실제 체결·호가·거래량을 재현하지 않습니다.</p></header>
    <SplitNavigation />
    <SplitManager key={strategy.id} mode="detail" simulations={simulations} />
  </main>;
}
