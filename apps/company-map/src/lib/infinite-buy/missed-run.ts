// 사이클 실행 누락 판정. 순수 함수(토스/DB 의존 없음).
// worker는 US 정규장이 열려 있는 동안에만 주문을 내므로, 머신 절전·worker 미가동으로
// 세션을 통째로 놓치면 그 거래일은 영구히 건너뛴다(설계상 catch-up 없음 —
// LOC는 그날 종가용이라 뒤늦게 넣는 것이 무의미). 조용히 지나치지 않도록 대시보드에 드러낸다.
// (2026-07-24 US 세션 전체를 머신 절전으로 놓쳐 주문 0건이었던 사례에서 도입)

export interface CalDay {
  date: string; // YYYY-MM-DD
  regularMarket?: { endTime?: string } | null;
}

// 이미 마감된 세션 중 가장 최근 거래일. 진행 중·미래 세션은 제외한다(아직 누락이 아니므로).
// 휴장일은 regularMarket이 없어 자연히 건너뛴다.
export function pickLastClosedTradeDate(
  days: Array<CalDay | null | undefined>,
  nowMs: number,
): string | null {
  let latest: string | null = null;
  for (const day of days) {
    const end = day?.regularMarket?.endTime;
    if (!day?.date || !end) continue;
    const closeMs = new Date(end).getTime();
    if (!Number.isFinite(closeMs) || nowMs < closeMs) continue; // 아직 마감 전
    if (latest == null || day.date > latest) latest = day.date;
  }
  return latest;
}

// active 사이클인데 마지막 실행일이 최근 마감 거래일보다 뒤처지면 누락으로 본다.
// paused/completed/exhausted는 안 도는 게 정상이므로 대상이 아니다.
export function isMissedRun(
  status: string,
  lastRunDate: string | null,
  lastClosedTradeDate: string | null,
): boolean {
  if (status !== "active" || lastRunDate == null || lastClosedTradeDate == null) return false;
  return lastRunDate < lastClosedTradeDate;
}
