// 금액 기반(orderAmount) 주문 접수 창 판정. 토스는 이 형태를 정규장 시작부터 종료 1시간
// 전까지만 받고, 그 밖의 시각엔 422 amount-order-outside-regular-hours로 거절한다.
// worker/us-market.ts의 usRegularTradeDate와 세션 훑는 방식이 닮았지만, src/가 worker/를
// import하지 않는 이 코드베이스의 관행에 따라 판정을 여기에 따로 둔다
// (src/actions/dca.ts의 currentUsTradeDate도 같은 이유로 복제돼 있다).
import { getMarketCalendarUS } from "@/lib/toss/client";

/** 정규장 종료 몇 ms 전에 금액 기반 주문 접수가 끊기는지. */
const ORDER_CUTOFF_MS = 60 * 60 * 1000;

/**
 * 지금 금액 기반 주문을 낼 수 있으면 true.
 * US 정규장은 KST 자정을 넘기므로 전·당·익일 세션을 모두 확인한다.
 * 캘린더 조회에 실패하면 fail-closed — 창을 모르면 주문하지 않는다.
 */
export async function isAmountOrderWindowOpen(): Promise<boolean> {
  try {
    const cal = await getMarketCalendarUS();
    const now = Date.now();
    for (const day of [cal.previousBusinessDay, cal.today, cal.nextBusinessDay]) {
      const reg = day?.regularMarket as { startTime?: string; endTime?: string } | undefined;
      if (!reg?.startTime || !reg?.endTime) continue; // 휴장/없음
      const open = new Date(reg.startTime).getTime();
      const close = new Date(reg.endTime).getTime();
      if (now >= open && now < close - ORDER_CUTOFF_MS) return true;
    }
    return false;
  } catch (e) {
    console.error("[dca] US calendar fetch failed:", e);
    return false;
  }
}
