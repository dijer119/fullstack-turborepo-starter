"use client";

import { useId } from "react";

export function MoneyInput({ label, value, market, onChange, className }: {
  label: string;
  value: number;
  market: string;
  onChange: (value: number) => void;
  className: string;
}) {
  const id = useId();
  const krw = market === "KR";
  const amount = Number.isFinite(value) ? Math.round(value) : 0;
  const adjust = (delta: number) => onChange(Math.max(0, amount + delta));
  return (
    <div className="min-w-0 text-sm">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          className={`${className} pr-10 text-right tabular-nums`}
          type={krw ? "text" : "number"}
          inputMode={krw ? "numeric" : "decimal"}
          required
          min={krw ? undefined : 0}
          step={krw ? undefined : 0.01}
          value={!Number.isFinite(value) ? "" : krw ? amount.toLocaleString("ko-KR") : value}
          onChange={(event) => {
            const raw = event.target.value.replaceAll(",", "");
            if (raw === "") return onChange(NaN);
            if (krw && !/^\d+$/.test(raw)) return;
            const next = Number(raw);
            if (Number.isFinite(next) && (!krw || Number.isSafeInteger(next))) onChange(next);
          }}
          onKeyDown={(event) => {
            if (krw && ["ArrowUp", "ArrowDown"].includes(event.key)) {
              event.preventDefault();
              adjust(event.key === "ArrowUp" ? 10000 : -10000);
            }
          }}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
          {krw ? "원" : "$"}
        </span>
      </div>
      {krw && (
        <div className="mt-1 flex gap-2">
          {[-10000, 10000].map((delta) => (
            <button
              key={delta}
              type="button"
              aria-label={`${label} ${delta < 0 ? "1만원 줄이기" : "1만원 늘리기"}`}
              className="rounded border border-line px-2 py-1 text-xs hover:bg-surface-muted  "
              onClick={() => adjust(delta)}
            >
              {delta < 0 ? "−1만원" : "+1만원"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
