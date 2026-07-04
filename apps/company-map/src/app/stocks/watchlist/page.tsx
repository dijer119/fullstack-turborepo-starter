import Link from "next/link";
import { listWatches } from "@/actions/stock-watches";
import { WatchlistManager } from "./WatchlistManager";

export const metadata = { title: "관심종목 — Company Map" };
export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const watches = await listWatches();
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">관심종목</h1>
        <p className="mt-1 text-sm text-gray-500">
          관심 있는 종목을 저장하고 토스증권 현재가를 확인하세요. (국내·미국 모두 지원)
        </p>
        <Link
          href="/stocks"
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← 전종목 조회
        </Link>
      </header>
      <WatchlistManager initialWatches={watches} />
    </main>
  );
}
