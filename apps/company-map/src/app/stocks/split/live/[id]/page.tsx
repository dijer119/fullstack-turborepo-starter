import Link from "next/link";
import { notFound } from "next/navigation";
import { listSplitLive } from "@/actions/split-live";
import { LiveManager } from "../../LiveManager";
import { SplitNavigation } from "../../SplitNavigation";

export const dynamic = "force-dynamic";

export default async function LiveStrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await listSplitLive(id);
  const strategy = data.strategies[0];
  if (!strategy) notFound();
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <Link href="/stocks/split?mode=live" className="text-sm text-blue-ink hover:underline">← 종목 목록</Link>
    <header><h1 className="text-2xl font-bold">{strategy.name} · 진행 현황</h1><p className="mt-2 text-sm text-muted">{strategy.symbol} · 계좌 {strategy.accountSeq} · 자동 실거래</p></header>
    <SplitNavigation />
    <LiveManager key={strategy.id} mode="detail" data={data} />
  </main>;
}
