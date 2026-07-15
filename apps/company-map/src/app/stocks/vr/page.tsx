import Link from "next/link";
import { listVrAccounts } from "@/actions/vr";
import { VrManager } from "./VrManager";

export const dynamic = "force-dynamic";

export default async function VrPage() {
  const accounts = await listVrAccounts();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/stocks" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← 전종목 조회
      </Link>
      <h1 className="mt-4 mb-2 text-xl font-bold">밸류리밸런싱 VR</h1>
      <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
        ⚠ dryRun 전용입니다. 실제 주문은 제출되지 않으며, LOC/지정가 체결을 일봉으로 시뮬레이션합니다.
      </p>
      <VrManager accounts={accounts} />
    </main>
  );
}
