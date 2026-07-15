import { getMarketCalendarUS } from "@/lib/toss/client";

// 현재 진행 중인 US 정규장의 거래일 문자열 반환, 없으면 null.
// US 정규장은 KST 자정을 넘기므로(예: 월요일 세션 = KST 22:30~익일 05:00),
// 지금 열린 세션이 toss 캘린더의 previousBusinessDay에 있을 수 있다.
// 따라서 전·당·익일 세션을 모두 확인한다. (market.ts의 flatten과 동일한 이유)
export async function usRegularTradeDate(): Promise<string | null> {
  try {
    const cal = await getMarketCalendarUS();
    const now = Date.now();
    for (const day of [cal.previousBusinessDay, cal.today, cal.nextBusinessDay]) {
      const reg = day?.regularMarket as { startTime?: string; endTime?: string } | undefined;
      if (!reg?.startTime || !reg?.endTime) continue; // 휴장/없음
      const open = new Date(reg.startTime).getTime();
      const close = new Date(reg.endTime).getTime();
      if (now >= open && now < close) return day.date;
    }
    return null;
  } catch (e) {
    console.error("[worker] US calendar fetch failed:", e);
    return null;
  }
}
