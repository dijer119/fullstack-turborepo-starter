// 토스 클라이언트 → VrRunDeps. 시세·일봉 읽기 전용 (주문 경로 없음 — dryRun 전용).
import { getDailyCandles } from "@/lib/toss/client";
import type { VrRunDeps } from "./run-vr";

/** before(미포함) 직전 날짜의 종가. 순수 함수 — 테스트 대상. */
export function pickPrevClose(
  candles: Array<{ date: string; close: number }>,
  before: string,
): number | null {
  const prev = candles
    .filter((c) => c.date < before)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return prev ? prev.close : null;
}

export function tossVrDeps(): VrRunDeps {
  return {
    async getDailyCandle(symbol, date) {
      const candles = await getDailyCandles(symbol, 30);
      const c = candles.find((x) => x.date === date);
      return c ? { close: c.close, high: c.high } : null;
    },
    async getPrevTradeClose(symbol, before) {
      const candles = await getDailyCandles(symbol, 30);
      return pickPrevClose(candles, before);
    },
  };
}

export const isVrKilled = (): boolean => process.env.VR_DISABLED === "1";
