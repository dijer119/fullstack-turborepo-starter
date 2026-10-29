import Link from "next/link";
import { getEtfCompare } from "@/actions/etf";
import { EtfCompareTable } from "./EtfCompareTable";

export const metadata = { title: "ETF 수익률·분배 비교 — Company Map" };
export const dynamic = "force-dynamic";

export default async function EtfComparePage({
  searchParams,
}: {
  searchParams: Promise<{ codes?: string }>;
}) {
  const { codes } = await searchParams;
  // codes 파라미터가 없으면 관심 ETF 전체, 빈 문자열이면 선택 없음
  const codeList = codes == null ? null : codes.split(",").map((c) => c.trim()).filter(Boolean);
  const view = await getEtfCompare(codeList);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/stocks/etf" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← ETF 상세
      </Link>
      <h1 className="mt-4 mb-1 text-xl font-bold">ETF 수익률·분배 비교</h1>
      <p className="mb-4 text-sm text-gray-500">
        관심 ETF 중 선택한 종목의 분배금(최근 12개월)과 기간별 수익률을 비교합니다. 값은 Naver 기준이며
        ETF마다 기준일이 다를 수 있습니다.
      </p>
      <EtfCompareTable watches={view.watches} selected={view.selected} inputs={view.inputs} />
    </main>
  );
}
