import Link from "next/link";
import { listWatchDashboard } from "@/actions/stock-watches";
import { WatchlistDashboard } from "./WatchlistDashboard";

export const metadata = { title: "관심종목 — Company Map" };
export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const data = await listWatchDashboard();
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">관심종목</h1>
        <p className="mt-1 text-sm text-muted">
          최근 본 종목과 관심 그룹을 한곳에서 관리하세요.
        </p>
        <nav className="mt-3 flex flex-wrap gap-4" aria-label="관심종목 메뉴">
          <Link
            href="/stocks"
            className="text-sm text-blue-ink hover:underline "
          >
            ← 전종목 조회
          </Link>
          <Link
            href="/stocks/split"
            className="text-sm text-blue-ink hover:underline "
          >
            매직스플릿
          </Link>
        </nav>
      </header>
      <WatchlistDashboard data={data} />
    </main>
  );
}
