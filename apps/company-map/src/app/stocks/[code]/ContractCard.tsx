import type { ContractPayload } from "@/lib/dart/disclosure-payloads";

interface Props {
  rcpNo: string;
  reportNm: string;
  rceptDt: Date;
  payload: ContractPayload | null;
}

function formatRceptDt(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
}

function formatYmd(s: string | null): string {
  if (!s) return "—";
  return s.replace(/-/g, ".");
}

function formatAmount(v: number | null): string {
  if (v == null) return "—";
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}조`;
  if (abs >= 1e8) {
    const eok = Math.floor(abs / 1e8);
    const remManwon = Math.floor((abs - eok * 1e8) / 1e4);
    if (remManwon > 0) return `${sign}${eok.toLocaleString()}억 ${remManwon.toLocaleString()}만원`;
    return `${sign}${eok.toLocaleString()}억`;
  }
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e4).toLocaleString()}만원`;
  return `${v.toLocaleString()}원`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div>
      {label}: <b>{value}</b>
    </div>
  );
}

export function ContractCard({ rcpNo, reportNm, rceptDt, payload }: Props) {
  const p = payload;
  const period =
    p?.startDate && p.endDate
      ? `${formatYmd(p.startDate)} - ${formatYmd(p.endDate)}`
      : null;
  const dartUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rcpNo}`;

  return (
    <article className="rounded-lg bg-cyan-900/80 p-5 text-gray-100 shadow">
      <h3 className="text-lg font-bold">{reportNm}</h3>
      {p && (
        <div className="mt-3 space-y-1 text-sm">
          <Row label="계약일" value={p.contractDate ? formatYmd(p.contractDate) : null} />
          <Row label="계약기간" value={period} />
          <Row label="계약내용" value={p.contractContent} />
          <Row label="계약상대방" value={p.counterparty} />
          <Row label="공급지역" value={p.supplyRegion} />
          <Row label="계약금액" value={p.amount != null ? formatAmount(p.amount) : null} />
          <Row
            label="최근매출액대비"
            value={p.recentSalesRatio != null ? `${p.recentSalesRatio.toFixed(2)}%` : null}
          />
        </div>
      )}
      <a
        href={dartUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-xs text-cyan-200 hover:underline"
      >
        DART 원본 ↗
      </a>
      <p className="mt-4 text-xs text-gray-400">{formatRceptDt(rceptDt)}</p>
    </article>
  );
}
