"use client";

import { useId } from "react";

export function RateInput({ label, value, increment, min, max, onChange, className, unit = "%p" }: {
  label: string;
  value: number;
  increment: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  className: string;
  unit?: string;
}) {
  const id = useId();
  const rounded = (n: number) => Math.round(n * 100) / 100;
  const adjust = (direction: number) => onChange(
    Math.min(max, Math.max(min, rounded((Number.isFinite(value) ? rounded(value) : 0) + direction * increment))),
  );
  return (
    <div className="min-w-0 text-sm">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`${className} text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        type="number"
        inputMode="decimal"
        required
        min={min}
        max={max}
        step={0.01}
        value={Number.isFinite(value) ? rounded(value) : ""}
        onChange={(event) => onChange(event.target.value === "" ? NaN : rounded(Number(event.target.value)))}
        onWheel={(event) => event.currentTarget.blur()}
        onKeyDown={(event) => {
          if (["ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            adjust(event.key === "ArrowUp" ? 1 : -1);
          }
        }}
      />
      <div className="mt-1 flex gap-2">
        {[-1, 1].map((direction) => (
          <button
            key={direction}
            type="button"
            aria-label={`${label} ${increment}${unit} ${direction < 0 ? "줄이기" : "늘리기"}`}
            className="rounded border border-line px-2 py-1 text-xs hover:bg-surface-muted  "
            onClick={() => adjust(direction)}
          >
            {direction < 0 ? "−" : "+"}{increment}{unit}
          </button>
        ))}
      </div>
    </div>
  );
}
