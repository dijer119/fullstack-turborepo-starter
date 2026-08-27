import Link from "next/link";
import { listDcaAccounts } from "@/actions/dca";
import { DcaManager } from "./DcaManager";

export const dynamic = "force-dynamic";

export default async function DcaPage() {
  const accounts = await listDcaAccounts();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/stocks" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← 전종목 조회
      </Link>
      <h1 className="mt-4 mb-2 text-xl font-bold">QQQ·QLD 적립식</h1>
      <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
        기준 종목이 직전 최고 종가 대비 임계% 이상 하락한 거래일에는 레버리지 종목을, 그 외에는 기준
        종목을 매 거래일 설정 금액만큼 LOC(종가) 매수합니다. 1주 값에 못 미치는 날은 적립만 되고
        잔액은 다음 거래일로 이월됩니다.
      </p>
      <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
        ⚠ 계좌는 항상 dryRun으로 생성됩니다. 설정에서 dryRun을 끄면 <strong>실제 매수 주문이 제출됩니다</strong>.
      </p>
      <DcaManager accounts={accounts} />
    </main>
  );
}
