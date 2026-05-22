"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, RefreshCw, Check, X, Clock } from "lucide-react";
import {
  listRefreshStates,
  triggerRefresh,
  type RefreshKind,
  type RefreshStateView,
} from "@/actions/refresh-jobs";

const LABELS: Record<RefreshKind, { name: string; estimate: string }> = {
  krx_stocks: { name: "KRX 종목 마스터", estimate: "~2분" },
  vip_holdings: { name: "VIP 지분공시", estimate: "~6분" },
  operating_income: { name: "영업이익 시계열", estimate: "~60분" },
  trade: { name: "수출입 동향", estimate: "~3분" },
  price_changes: { name: "3개월 주가변동", estimate: "~45분" },
};

const POLL_MS = 3000;

export function RefreshMenu({ initialStates }: { initialStates: RefreshStateView[] }) {
  const [open, setOpen] = useState(false);
  const [states, setStates] = useState(initialStates);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const refetch = async () => {
      const next = await listRefreshStates();
      if (!cancelled) setStates(next);
    };
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open]);

  const onRun = (kind: RefreshKind) => {
    startTransition(async () => {
      await triggerRefresh(kind);
      const next = await listRefreshStates();
      setStates(next);
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        <RefreshCw size={14} />
        데이터 업데이트
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-96 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {states.map((s) => (
              <RefreshRow key={s.kind} s={s} onRun={onRun} pending={pending} />
            ))}
          </ul>
          <div className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-800">
            ⓘ 백그라운드로 진행되며 닫아도 됩니다
          </div>
        </div>
      )}
    </div>
  );
}

function RefreshRow({
  s,
  onRun,
  pending,
}: {
  s: RefreshStateView;
  onRun: (k: RefreshKind) => void;
  pending: boolean;
}) {
  const label = LABELS[s.kind];
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <StatusIcon status={s.status} />
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label.name}</div>
        <div className="text-xs text-gray-500">
          {statusDescription(s)} · {label.estimate}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRun(s.kind)}
        disabled={pending || s.status === "running"}
        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        {s.status === "running" ? "실행 중…" : "실행"}
      </button>
    </li>
  );
}

function StatusIcon({ status }: { status: RefreshStateView["status"] }) {
  if (status === "running") return <Clock size={16} className="text-blue-600 animate-pulse" />;
  if (status === "done") return <Check size={16} className="text-green-600" />;
  if (status === "failed") return <X size={16} className="text-red-600" />;
  return <span className="inline-block w-4 text-gray-400">—</span>;
}

function statusDescription(s: RefreshStateView): string {
  if (s.status === "idle") return "미실행";
  if (s.status === "running") {
    const elapsed = s.startedAt
      ? Math.round((Date.now() - new Date(s.startedAt).getTime()) / 1000)
      : 0;
    return `실행 중 (${formatElapsed(elapsed)})`;
  }
  const at = s.finishedAt ?? s.startedAt;
  if (!at) return s.status;
  return s.status === "done"
    ? `완료 · ${formatShort(at)}`
    : `실패 · ${formatShort(at)}`;
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}초`;
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

function formatShort(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1);
  const dd = String(d.getDate());
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m}/${dd} ${hh}:${mm}`;
}
