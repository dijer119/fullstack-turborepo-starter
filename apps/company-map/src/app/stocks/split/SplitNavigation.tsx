import Link from "next/link";

export function SplitNavigation() {
  return <nav aria-label="매직스플릿 메뉴" className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm font-medium text-blue-ink ">
    <Link href="/stocks/split">종목 목록</Link>
    <Link href="/stocks/split/reservations">매직스플릿 예약 매수</Link>
    <Link href="/stocks/split/performance">월별·일별 수익</Link>
    <Link href="/stocks/split/new?mode=live">실거래 전략 등록</Link>
    <Link href="/stocks/split/new?mode=simulation">모의 전략 등록</Link>
    <Link href="/stocks/watchlist">관심종목</Link>
  </nav>;
}
