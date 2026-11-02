import Link from "next/link";
import { getSplitPerformance } from "@/actions/split-performance";
import { SplitNavigation } from "../SplitNavigation";
import { PerformanceDashboard } from "./PerformanceDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "월별·일별 수익 — 분할매매" };

export default async function PerformancePage() {
  const data = await getSplitPerformance();
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <Link href="/stocks/split" className="text-sm text-blue-ink hover:underline ">← 종목 목록</Link>
    <header><h1 className="text-2xl font-bold">월별·일별 수익</h1><p className="mt-2 text-sm text-muted">매도로 확정한 수익금과 매입원가 대비 수익률을 기간별로 확인하세요.</p></header>
    <SplitNavigation />
    <PerformanceDashboard data={data} />
  </main>;
}
