"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { setManualRoe } from "@/actions/stock-overrides";

interface Props {
  code: string;
  manualRoe: number | null;
  autoRoe: number | null;
}

function formatPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(2)}%`;
}

export function RoeCell({ code, manualRoe, autoRoe }: Props) {
  const [editing, setEditing] = useState(false);
  const [optimistic, setOptimistic] = useState<number | null>(manualRoe);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setOptimistic(manualRoe);
  }, [manualRoe]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const display = optimistic ?? autoRoe;
  const isManual = optimistic != null;

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    let next: number | null;
    if (trimmed === "") {
      next = null;
    } else {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        setEditing(false);
        return;
      }
      next = parsed;
    }
    setOptimistic(next);
    setEditing(false);
    startTransition(async () => {
      try {
        await setManualRoe(code, next);
      } catch (err) {
        console.error("[roe] failed to save", code, err);
        setOptimistic(manualRoe);
      }
    });
  };

  if (editing) {
    return (
      <td className="p-2 text-right">
        <input
          ref={inputRef}
          type="number"
          step="0.01"
          defaultValue={optimistic ?? ""}
          placeholder={autoRoe != null ? autoRoe.toFixed(2) : ""}
          disabled={pending}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            else if (e.key === "Escape") setEditing(false);
          }}
          className="w-20 rounded border border-blue-400 bg-white px-1 py-0.5 text-right text-sm dark:bg-gray-900"
        />
      </td>
    );
  }

  return (
    <td
      onClick={() => setEditing(true)}
      title={isManual ? "수동 입력 (클릭해서 수정)" : "PBR/PER 추정 (클릭해서 수동 입력)"}
      className={`p-2 text-right cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30 ${
        display == null
          ? "text-gray-400"
          : isManual
            ? "font-semibold text-blue-600 dark:text-blue-400"
            : "text-gray-600 dark:text-gray-400"
      }`}
    >
      {formatPct(display)}
    </td>
  );
}
