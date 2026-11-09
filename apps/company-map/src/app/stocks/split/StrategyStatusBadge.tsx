import { Pause } from "lucide-react";

const labels: Record<string, string> = {
  active: "실행 중",
  reserved: "예약 감시 중",
  paused: "일시정지",
  completed: "종료",
};

export const pausedRowAccent = "bg-violet-50 shadow-[inset_4px_0_0_var(--color-violet-600)] dark:bg-violet-950 dark:shadow-[inset_4px_0_0_var(--color-violet-400)]";

export function StrategyStatusBadge({ status }: { status: string }) {
  if (status === "paused") {
    return <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-violet-700 px-1.5 py-0.5 text-xs font-bold leading-4 text-white dark:bg-violet-300 dark:text-violet-950">
      <Pause size={12} fill="currentColor" aria-hidden="true" />일시정지
    </span>;
  }

  const running = status === "active" || status === "reserved";
  return <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted">
    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${running ? "bg-emerald-500" : "bg-gray-400"}`} />
    {labels[status] ?? status}
  </span>;
}
