import type { DividendPayload } from "@/lib/dart/disclosure-payloads";

interface Props {
  reportNm: string;
  rceptDt: Date;
  payload: DividendPayload | null;
}

function formatRceptDt(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

function formatRecordDate(s: string | null): string {
  if (!s) return "—";
  return s.replace(/-/g, ".");
}

export function DividendCard({ reportNm, rceptDt, payload }: Props) {
  return (
    <article className="rounded-lg bg-emerald-900/80 p-5 text-gray-100 shadow">
      <h3 className="text-lg font-bold">{reportNm}</h3>
      {payload && (
        <div className="mt-3 space-y-1 text-sm">
          <div>
            주당 배당금:{" "}
            <b>
              {payload.divPerShare != null
                ? `${payload.divPerShare.toLocaleString()}원`
                : "—"}
            </b>
          </div>
          <div>
            시가배당률:{" "}
            <b>
              {payload.dividendYieldPct != null
                ? `${payload.dividendYieldPct.toFixed(2)}%`
                : "—"}
            </b>
          </div>
          <div>
            배당기준일: <b>{formatRecordDate(payload.recordDate)}</b>
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-gray-300">{formatRceptDt(rceptDt)}</p>
    </article>
  );
}
