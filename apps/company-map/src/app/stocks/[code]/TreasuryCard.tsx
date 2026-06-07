import type {
  TreasuryAction,
  TreasuryPayload,
} from "@/lib/dart/disclosure-payloads";

interface Props {
  rcpNo: string;
  reportNm: string;
  rceptDt: Date;
  payload: TreasuryPayload | null;
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
    if (remManwon > 0)
      return `${sign}${eok.toLocaleString()}억 ${remManwon.toLocaleString()}만원`;
    return `${sign}${eok.toLocaleString()}억`;
  }
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e4).toLocaleString()}만원`;
  return `${v.toLocaleString()}원`;
}

function formatShares(v: number | null): string | null {
  if (v == null) return null;
  return `${v.toLocaleString()}주`;
}

// 유형별 카드 강조색 + 라벨
const STYLE: Record<
  TreasuryAction,
  { card: string; badge: string; link: string }
> = {
  취득: {
    card: "bg-emerald-900/80",
    badge: "bg-emerald-700/80",
    link: "text-emerald-200",
  },
  처분: {
    card: "bg-orange-900/80",
    badge: "bg-orange-700/80",
    link: "text-orange-200",
  },
  소각: {
    card: "bg-violet-900/80",
    badge: "bg-violet-700/80",
    link: "text-violet-200",
  },
  신탁체결: {
    card: "bg-sky-900/80",
    badge: "bg-sky-700/80",
    link: "text-sky-200",
  },
  신탁해지: {
    card: "bg-slate-800/90",
    badge: "bg-slate-600/80",
    link: "text-slate-300",
  },
  기타: {
    card: "bg-gray-800/90",
    badge: "bg-gray-600/80",
    link: "text-gray-300",
  },
};

function labelsFor(action: TreasuryAction): {
  shares: string;
  amount: string;
  period: string;
  method: string;
  exec: string;
} {
  switch (action) {
    case "취득":
      return {
        shares: "취득예정주식",
        amount: "취득예정금액",
        period: "취득예상기간",
        method: "취득방법",
        exec: "",
      };
    case "처분":
      return {
        shares: "처분예정주식",
        amount: "처분예정금액",
        period: "처분예정기간",
        method: "처분방법",
        exec: "",
      };
    case "소각":
      return {
        shares: "소각주식",
        amount: "소각금액",
        period: "취득예정기간",
        method: "취득방법",
        exec: "소각예정일",
      };
    case "신탁체결":
      return {
        shares: "대상주식",
        amount: "계약금액",
        period: "계약기간",
        method: "수탁기관",
        exec: "계약체결예정일",
      };
    case "신탁해지":
      return {
        shares: "대상주식",
        amount: "계약금액",
        period: "계약기간",
        method: "해지기관",
        exec: "해지예정일",
      };
    default:
      return {
        shares: "주식수",
        amount: "금액",
        period: "기간",
        method: "방법",
        exec: "예정일",
      };
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div>
      {label}: <b>{value}</b>
    </div>
  );
}

export function TreasuryCard({ rcpNo, reportNm, rceptDt, payload }: Props) {
  const p = payload;
  const action: TreasuryAction = p?.action ?? "기타";
  const style = STYLE[action];
  const lbl = labelsFor(action);
  const dartUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rcpNo}`;

  const period =
    p?.startDate && p.endDate
      ? `${formatYmd(p.startDate)} - ${formatYmd(p.endDate)}`
      : null;

  // 소각: 발행주식총수 대비 소각 비율
  const cancelRatio =
    p?.action === "소각" && p.ostkShares != null && p.totalSharesBefore
      ? (p.ostkShares / p.totalSharesBefore) * 100
      : null;

  const held =
    p?.heldOstk != null
      ? `${p.heldOstk.toLocaleString()}주${
          p.heldRatio != null ? ` (${p.heldRatio.toFixed(2)}%)` : ""
        }`
      : null;

  return (
    <article className={`rounded-lg ${style.card} p-5 text-gray-100 shadow`}>
      <span
        className={`inline-block rounded ${style.badge} px-2 py-0.5 text-xs font-medium`}
      >
        {action}
      </span>
      <h3 className="mt-2 text-base font-bold">{reportNm}</h3>

      {p && (
        <div className="mt-3 space-y-1 text-sm">
          <Row label={lbl.shares} value={formatShares(p.ostkShares)} />
          {cancelRatio != null && (
            <Row
              label="발행주식 대비"
              value={
                <span className="text-violet-200">
                  {cancelRatio.toFixed(2)}%
                </span>
              }
            />
          )}
          <Row
            label={lbl.amount}
            value={p.amount != null ? formatAmount(p.amount) : null}
          />
          <Row label={lbl.period} value={period} />
          <Row label={lbl.exec} value={p.execDate ? formatYmd(p.execDate) : null} />
          <Row label="목적" value={p.purpose} />
          <Row label={lbl.method} value={p.method} />
          <Row label="결의 전 보유" value={held} />
          <Row
            label="이사회결의일"
            value={p.boardDate ? formatYmd(p.boardDate) : null}
          />
        </div>
      )}

      <a
        href={dartUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-3 inline-block text-xs ${style.link} hover:underline`}
      >
        DART 원본 ↗
      </a>
      <p className="mt-4 text-xs text-gray-400">{formatRceptDt(rceptDt)}</p>
    </article>
  );
}
