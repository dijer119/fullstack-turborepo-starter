export type GrowthCell =
  | { kind: "pct"; value: number }
  | { kind: "turnaround_positive" }
  | { kind: "turnaround_negative" }
  | { kind: "loss_widened" }
  | { kind: "loss_narrowed" }
  | { kind: "unavailable" };

export function computeGrowth(
  curr: bigint | number | null,
  base: bigint | number | null,
): GrowthCell {
  if (curr == null || base == null) return { kind: "unavailable" };
  const c = typeof curr === "bigint" ? Number(curr) : curr;
  const b = typeof base === "bigint" ? Number(base) : base;
  if (!Number.isFinite(c) || !Number.isFinite(b)) return { kind: "unavailable" };
  if (b === 0 && c === 0) return { kind: "unavailable" };
  if (b < 0 && c > 0) return { kind: "turnaround_positive" };
  if (b > 0 && c < 0) return { kind: "turnaround_negative" };
  if (b < 0 && c < 0) {
    return c < b ? { kind: "loss_widened" } : { kind: "loss_narrowed" };
  }
  if (b === 0) return { kind: "pct", value: c > 0 ? Infinity : -Infinity };
  return { kind: "pct", value: ((c - b) / Math.abs(b)) * 100 };
}

export function formatGrowth(g: GrowthCell): string {
  switch (g.kind) {
    case "pct":
      if (!Number.isFinite(g.value)) return g.value > 0 ? "+∞%" : "-∞%";
      return `${g.value >= 0 ? "+" : ""}${g.value.toFixed(1)}%`;
    case "turnaround_positive": return "흑전";
    case "turnaround_negative": return "적전";
    case "loss_widened":        return "적자↑";
    case "loss_narrowed":       return "적자↓";
    case "unavailable":         return "—";
  }
}

export function growthColorClass(g: GrowthCell): string {
  switch (g.kind) {
    case "turnaround_positive": return "text-green-700 dark:text-green-400 font-semibold";
    case "turnaround_negative": return "text-red-700 dark:text-red-400 font-semibold";
    case "loss_widened":        return "text-red-600 dark:text-red-400";
    case "loss_narrowed":       return "text-gray-500 dark:text-gray-400";
    case "pct":
      if (g.value > 0) return "text-green-600 dark:text-green-400";
      if (g.value < 0) return "text-red-600 dark:text-red-400";
      return "text-gray-500 dark:text-gray-400";
    case "unavailable":         return "text-gray-400 dark:text-gray-600";
  }
}
