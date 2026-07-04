import Link from "next/link";
import {
  getFundDetail,
  getFundWeightHistory,
  getFundNavHistory,
} from "@/actions/funds";
import { FundView } from "./FundView";

export const dynamic = "force-dynamic";

export default async function FundPage() {
  const [detail, history, nav] = await Promise.all([
    getFundDetail(),
    getFundWeightHistory().catch(() => ({ dates: [], rows: [] })),
    getFundNavHistory().catch(() => []),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/stocks" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← 전종목 조회
      </Link>
      <h1 className="mt-4 mb-4 text-xl font-bold">VIP 펀드 추적</h1>
      <FundView detail={detail} history={history} nav={nav} />
    </main>
  );
}
