// 토스 주문조회는 `from` 기준 약 30일 범위만 돌려준다(limit 상한 100과 별개, 실측 확인).
// 그보다 긴 구간은 윈도우로 쪼개 여러 번 조회해야 누락이 없다.
const DAY_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export interface DateWindow {
  from: string;
  to: string;
}

/** [from, to] 구간을 maxDays 이하 윈도우들로 분할한다. 빈틈·역순 없음. */
export function splitDateWindows(from: string, to: string, maxDays = 28): DateWindow[] {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];

  const out: DateWindow[] = [];
  let cursor = start;
  while (cursor <= end) {
    const windowEnd = Math.min(cursor + maxDays * DAY_MS, end);
    out.push({ from: iso(cursor), to: iso(windowEnd) });
    cursor = windowEnd + DAY_MS;
  }
  return out;
}

/**
 * `from`~`to` 전 구간을 윈도우로 나눠 조회하고 orderId 기준으로 합친다.
 * 서버가 한 번에 30일까지만 주므로 긴 구간은 이렇게 순회해야 최근 주문이 누락되지 않는다.
 * `from`이 없으면 기간 제약이 무의미하므로 한 번만 조회한다.
 */
export async function collectAcrossWindows<T extends { orderId: string }>(
  from: string | undefined,
  to: string | undefined,
  fetchWindow: (from?: string, to?: string) => Promise<T[]>,
  maxDays = 28,
  today: string = iso(Date.now()),
): Promise<T[]> {
  if (!from) return fetchWindow(from, to);

  const windows = splitDateWindows(from, to ?? today, maxDays);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const w of windows) {
    for (const item of await fetchWindow(w.from, w.to)) {
      if (seen.has(item.orderId)) continue;
      seen.add(item.orderId);
      out.push(item);
    }
  }
  return out;
}
