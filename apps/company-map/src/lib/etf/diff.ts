import type { Holding, HoldingChange } from "./types";

// 해외주식 등은 constituentCode가 빈 문자열이라 코드로 식별하면 한 종목으로 뭉개진다.
// 코드가 없으면 종목명으로 식별한다 (history.ts의 keyOf와 동일 규칙).
const idOf = (h: { constituentCode: string; constituentName: string }) =>
  h.constituentCode || h.constituentName;

export function topN(holdings: Holding[], n: number): Holding[] {
  return [...holdings]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, n);
}

// 최신·직전 holdings(이미 top-10)를 비교. prev가 null이면 전부 유지.
export function diffHoldings(
  latest: Holding[],
  prev: Holding[] | null,
): HoldingChange[] {
  const prevById = new Map((prev ?? []).map((h) => [idOf(h), h]));
  const latestIds = new Set(latest.map((h) => idOf(h)));

  const present: HoldingChange[] = latest.map((h) => {
    const p = prevById.get(idOf(h));
    const isNew = prev != null && !p;
    return {
      ...h,
      status: isNew ? "신규" : "유지",
      weightDelta: p && h.weight != null && p.weight != null ? h.weight - p.weight : null,
      sharesDelta: p && h.shares != null && p.shares != null ? h.shares - p.shares : null,
    };
  });
  present.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  const dropped: HoldingChange[] = (prev ?? [])
    .filter((h) => !latestIds.has(idOf(h)))
    .map((h) => ({
      constituentCode: h.constituentCode,
      constituentName: h.constituentName,
      weight: null, shares: null, amount: null,
      status: "이탈", weightDelta: null, sharesDelta: null,
    }));

  return [...present, ...dropped];
}
