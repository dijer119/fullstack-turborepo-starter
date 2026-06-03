import type { Holding, HoldingChange } from "./types";

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
  const prevByCode = new Map((prev ?? []).map((h) => [h.constituentCode, h]));
  const latestCodes = new Set(latest.map((h) => h.constituentCode));

  const present: HoldingChange[] = latest.map((h) => {
    const p = prevByCode.get(h.constituentCode);
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
    .filter((h) => !latestCodes.has(h.constituentCode))
    .map((h) => ({
      constituentCode: h.constituentCode,
      constituentName: h.constituentName,
      weight: null, shares: null, amount: null,
      status: "이탈", weightDelta: null, sharesDelta: null,
    }));

  return [...present, ...dropped];
}
