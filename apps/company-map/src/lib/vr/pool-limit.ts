// Pool 사용한도(매수 브레이크) 스케줄. 시간이 갈수록 한도를 조여 방어력을 높인다.
// 출처: 라오어 "pool의 사용한도를 천천히 줄여나가겠습니다" (2022-10-07)
export type VrType = "accumulate" | "lumpsum";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 시작일로부터 경과 주차 = floor(일수/7). 역전 입력은 0. */
export function weeksBetween(startDate: string, date: string): number {
  const ms =
    new Date(`${date}T00:00:00Z`).getTime() -
    new Date(`${startDate}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor(ms / WEEK_MS));
}

/** auto 모드 한도 %: 적립식 75 − 5×floor(주차/26), 최저 10. 거치식 50 고정. */
export function autoPoolLimitPct(type: VrType, weeks: number): number {
  if (type === "lumpsum") return 50;
  return Math.max(10, 75 - 5 * Math.floor(weeks / 26));
}
