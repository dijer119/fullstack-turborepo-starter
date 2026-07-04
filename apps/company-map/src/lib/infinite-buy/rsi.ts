// RSI(14) — Wilder smoothing. 종가 시계열(오름차순)에서 마지막 시점의 RSI.
// 무한매수법 유니버스(미국 3배 레버리지 ETF) RSI 모니터링용 순수 계산.

export const RSI_UNIVERSE = [
  "DFEN", "FAS", "FNGU", "LABU", "MIDU", "NAIL", "RETL", "SOXL",
  "TECL", "TPOR", "TQQQ", "UPRO", "TNA", "WANT", "WEBL",
] as const;

export function rsi14(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}
