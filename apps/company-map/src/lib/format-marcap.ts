/** 원화 시가총액 → 한국식 단위 표시.
 *  1조 이상: "1.2조", 1억 이상: "8,234억", 그 미만: 원 단위 그대로. */
export function formatMarcap(v: bigint | number | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "bigint" ? Number(v) : v;
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e12) {
    const trillions = n / 1e12;
    return `${trillions >= 100 ? Math.round(trillions).toLocaleString() : trillions.toFixed(1)}조`;
  }
  if (n >= 1e8) return `${Math.round(n / 1e8).toLocaleString()}억`;
  return n.toLocaleString();
}
