import type { TreasuryStockInfo } from "@/types/stocks";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function calculateWeightedEps(eps: Array<number | null>): number | null {
  if (eps.length !== 3) return null;
  if (!eps.every(isFiniteNumber)) return null;
  const [threeYearsAgo, twoYearsAgo, latest] = eps as number[];
  return (latest * 3 + twoYearsAgo * 2 + threeYearsAgo * 1) / 6;
}

export function calculateIntrinsicValue(
  eps: Array<number | null>,
  latestBps: number | null,
  treasury: TreasuryStockInfo,
): number | null {
  if (!isFiniteNumber(latestBps)) return null;
  const weighted = calculateWeightedEps(eps);
  if (weighted === null) return null;
  let value = (weighted * 10 + latestBps) / 2;
  if (treasury.ratio > 0) {
    value = value * (100 / (100 - treasury.ratio));
  }
  return value;
}

export function calculateSafetyMargin(
  intrinsicValue: number | null,
  currentPrice: number | null,
): number | null {
  if (!isFiniteNumber(intrinsicValue)) return null;
  if (!isFiniteNumber(currentPrice) || currentPrice === 0) return null;
  return ((intrinsicValue - currentPrice) / currentPrice) * 100;
}
