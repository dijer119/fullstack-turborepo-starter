/** Convert BigInt fields to string for safe serialization to React server components. */
export function bigintToString<T extends Record<string, unknown>>(row: T): {
  [K in keyof T]: T[K] extends bigint
    ? string
    : T[K] extends bigint | null
      ? string | null
      : T[K];
} {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "bigint" ? v.toString() : v;
  }
  return out as never;
}
