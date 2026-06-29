import Link from "next/link";
import { listCycles } from "@/actions/infinite-buy";
import { InfiniteBuyManager } from "./InfiniteBuyManager";

export const dynamic = "force-dynamic";

export default async function InfiniteBuyPage() {
  const cycles = await listCycles();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/stocks" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← 전종목 조회
      </Link>
      <h1 className="mt-4 mb-2 text-xl font-bold">무한매수법 자동매매</h1>
      <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
        ⚠ 실제 토스 계좌에서 체결됩니다. 사이클은 dryRun(모의)으로 시작하며, 검증 후 LIVE로 전환하세요.
      </p>
      <InfiniteBuyManager cycles={cycles} />
    </main>
  );
}
