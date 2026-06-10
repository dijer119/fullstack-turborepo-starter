import Link from "next/link";
import { listEtfWatches, getEtfDetail, getEtfShareHistory } from "@/actions/etf";
import { listRefreshStates } from "@/actions/refresh-jobs";
import { EtfManager } from "./EtfManager";

export const dynamic = "force-dynamic";

export default async function EtfPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const watches = await listEtfWatches();
  const selected = code ?? watches[0]?.code ?? null;
  const [detail, history] = selected
    ? await Promise.all([
        getEtfDetail(selected),
        getEtfShareHistory(selected).catch(() => null),
      ])
    : [null, null];
  const refreshStates = await listRefreshStates();
  const refreshState = refreshStates.find((s) => s.kind === "etf_pdf") ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/stocks" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← 전종목 조회
      </Link>
      <h1 className="mt-4 mb-4 text-xl font-bold">액티브 ETF 구성종목 변화</h1>
      <EtfManager
        watches={watches}
        selected={selected}
        detail={detail}
        history={history}
        refreshState={refreshState}
      />
    </main>
  );
}
