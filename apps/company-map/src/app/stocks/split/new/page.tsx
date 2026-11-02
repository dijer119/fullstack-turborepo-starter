import Link from "next/link";
import { getSplitLiveAvailability } from "@/actions/split-live";
import { LiveManager } from "../LiveManager";
import { SplitManager } from "../SplitManager";
import { SplitNavigation } from "../SplitNavigation";

export const dynamic = "force-dynamic";

export default async function NewSplitPage({ searchParams }: { searchParams: Promise<{ mode?: string; entry?: string }> }) {
  const { mode, entry } = await searchParams;
  const simulation = mode === "simulation";
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <Link href={`/stocks/split?mode=${simulation ? "simulation" : "live"}`} className="text-sm text-blue-ink hover:underline">← 종목 목록</Link>
    <header><h1 className="text-2xl font-bold">{simulation ? "모의" : "실거래"} 전략 등록</h1><p className="mt-2 text-sm text-muted">{simulation ? "모의 전용 전략입니다. 실제 주문을 보내지 않습니다." : "종목과 차수별 조건을 입력하세요. 저장 후 정지 상태의 전략 화면으로 이동합니다."}</p></header>
    <SplitNavigation />
    {simulation ? <SplitManager mode="create" simulations={[]} /> : <LiveManager mode="create" reservationMode={entry === "reservation"} data={{ ...await getSplitLiveAvailability(), strategies: [] }} />}
  </main>;
}
