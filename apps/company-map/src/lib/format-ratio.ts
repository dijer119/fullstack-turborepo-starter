/** "5.12% (+0.34%p)" 형식 (보유율 + 증감).
 *  ratio null → "—"; change null이고 report_resn에 "신규" 있으면 "(신규)";
 *  change 0/null이고 그 외 → ratio 단독; +/− 부호는 명시. */
export function formatStockRatio(
  ratio: number | null,
  change: number | null,
  reportResn: string | null,
): string {
  if (ratio == null) return "—";
  const ratioStr = `${ratio.toFixed(2)}%`;
  if (change == null || change === 0) {
    if (reportResn && reportResn.includes("신규")) return `${ratioStr} (신규)`;
    return ratioStr;
  }
  const sign = change > 0 ? "+" : "";
  return `${ratioStr} (${sign}${change.toFixed(2)}%p)`;
}

/** Tailwind class. 0/null = gray, +=green, −=red. */
export function ratioColorClass(change: number | null): string {
  if (change == null || change === 0) return "text-gray-500 dark:text-gray-400";
  if (change > 0) return "text-green-600 dark:text-green-400";
  return "text-red-600 dark:text-red-400";
}
