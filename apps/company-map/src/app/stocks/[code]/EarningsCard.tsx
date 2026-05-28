import type { EarningsPayload } from "@/lib/dart/earnings-payload";

interface Props {
  reportNm: string;
  rceptDt: Date;
  payload: EarningsPayload | null;
}

function formatAmount(v: number | null): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}조`;
  if (abs >= 1e8) return `${Math.round(v / 1e8).toLocaleString()}억`;
  return v.toLocaleString();
}

function formatPct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
}

function pctColorClass(v: number | null): string {
  if (v == null) return "text-gray-400";
  if (v > 0) return "text-green-400";
  if (v < 0) return "text-red-400";
  return "text-gray-300";
}

function formatRceptDt(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
}

function periodLabel(payload: EarningsPayload): string {
  const month =
    payload.reprtCode === "11013"
      ? "03"
      : payload.reprtCode === "11012"
        ? "06"
        : payload.reprtCode === "11014"
          ? "09"
          : "12";
  return `${payload.bsnsYear}.${month} (${payload.reprtLabel}, 연결우선)`;
}

export function EarningsCard({ reportNm, rceptDt, payload }: Props) {
  return (
    <article className="rounded-lg bg-indigo-900/80 p-5 text-gray-100 shadow">
      <h3 className="text-lg font-bold">{reportNm}</h3>
      {payload && (
        <p className="mt-1 text-sm text-gray-300">{periodLabel(payload)}</p>
      )}
      <div className="mt-3 space-y-1 text-sm">
        <div>
          매출액: <b>{payload ? formatAmount(payload.revenue) : "—"}</b>
        </div>
        <div>
          영업익: <b>{payload ? formatAmount(payload.opIncome) : "—"}</b>
        </div>
        <div>
          순이익: <b>{payload ? formatAmount(payload.netIncome) : "—"}</b>
        </div>
      </div>
      {payload && (
        <div className="mt-3 space-y-1 font-mono text-sm">
          <div>
            YoY:{" "}
            <span className={pctColorClass(payload.revenueYoyPct)}>
              {formatPct(payload.revenueYoyPct)}
            </span>
            <span className="mx-1">/</span>
            <span className={pctColorClass(payload.opIncomeYoyPct)}>
              {formatPct(payload.opIncomeYoyPct)}
            </span>
            <span className="mx-1">/</span>
            <span className={pctColorClass(payload.netIncomeYoyPct)}>
              {formatPct(payload.netIncomeYoyPct)}
            </span>
          </div>
          <div>
            QoQ:{" "}
            <span className={pctColorClass(payload.revenueQoqPct)}>
              {formatPct(payload.revenueQoqPct)}
            </span>
            <span className="mx-1">/</span>
            <span className={pctColorClass(payload.opIncomeQoqPct)}>
              {formatPct(payload.opIncomeQoqPct)}
            </span>
            <span className="mx-1">/</span>
            <span className={pctColorClass(payload.netIncomeQoqPct)}>
              {formatPct(payload.netIncomeQoqPct)}
            </span>
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-gray-400">{formatRceptDt(rceptDt)}</p>
    </article>
  );
}
