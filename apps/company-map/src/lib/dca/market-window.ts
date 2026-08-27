// 금액 기반(orderAmount) 주문 접수 창 판정. 토스는 이 형태를 정규장 시작부터 종료 1시간
// 전까지만 받고, 그 밖의 시각엔 422 amount-order-outside-regular-hours로 거절한다.
// worker/us-market.ts의 usRegularTradeDate와 세션 훑는 방식이 닮았지만, src/가 worker/를
// import하지 않는 이 코드베이스의 관행에 따라 판정을 여기에 따로 둔다
// (src/actions/dca.ts의 currentUsTradeDate도 같은 이유로 복제돼 있다).
// 시각 비교는 순수 함수로 떼어 두고 조회 래퍼만 얇게 감싼다 — toss-deps.ts에서
// pickPrevTradeClose(순수·테스트 대상)와 조회 래퍼를 나눠 둔 것과 같은 관행.
import { getMarketCalendarUS } from "@/lib/toss/client";

/** 정규장 종료 몇 ms 전에 금액 기반 주문 접수가 끊기는지. */
export const ORDER_CUTOFF_MS = 60 * 60 * 1000;

/** 캘린더 하루치 중 이 판정에 필요한 부분만. 휴장일엔 필드가 비어 오므로 전부 optional. */
export interface WindowDay {
  regularMarket?: { startTime?: string; endTime?: string };
}

export interface WindowCalendar {
  previousBusinessDay?: WindowDay;
  today?: WindowDay;
  nextBusinessDay?: WindowDay;
}

/**
 * 주어진 시각에 금액 기반 주문 창이 열려 있는지. 순수 함수 — 테스트 대상.
 * US 정규장은 KST 자정을 넘기므로 전·당·익일 세션을 모두 확인한다.
 * 시각을 파싱할 수 없는 세션은 건너뛴다 — 창을 열어주는 근거로 쓰지 않는다.
 */
export function isWindowOpenAt(cal: WindowCalendar, nowMs: number): boolean {
  for (const day of [cal.previousBusinessDay, cal.today, cal.nextBusinessDay]) {
    const reg = day?.regularMarket;
    if (!reg?.startTime || !reg?.endTime) continue; // 휴장/없음
    const open = new Date(reg.startTime).getTime();
    const close = new Date(reg.endTime).getTime();
    if (!Number.isFinite(open) || !Number.isFinite(close)) continue; // 파싱 불가
    if (nowMs >= open && nowMs < close - ORDER_CUTOFF_MS) return true;
  }
  return false;
}

/**
 * 지금 금액 기반 주문을 낼 수 있으면 true.
 *
 * 캘린더 조회에 실패하면 **throw** 한다. "창이 닫혔다"와 "확인하지 못했다"는 다른 상태이고,
 * 호출자(run-dca)는 전자에서 그날 거래일을 소진시키므로 둘을 false로 합치면 토큰 재발급
 * 실패 한 번이 그날 매수를 통째로 날린다. throw는 호출자의 block(...) 경로로 이어져
 * lastRunDate가 남고 다음 폴에서 재시도된다. 어느 쪽이든 주문은 나가지 않는다(fail-closed).
 */
export async function isAmountOrderWindowOpen(): Promise<boolean> {
  const cal = await getMarketCalendarUS();
  return isWindowOpenAt(cal, Date.now());
}
