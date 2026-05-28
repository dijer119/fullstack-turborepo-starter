import type {
  OwnershipPayload,
  ElestockDetail,
  MajorstockDetail,
} from "@/lib/dart/disclosure-payloads";

interface Props {
  rcpNo: string;
  reportNm: string;
  rceptDt: Date;
  payload: OwnershipPayload | null;
}

function formatRceptDt(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
}

function formatSignedShares(v: number | null): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString()}주`;
}

function formatShares(v: number | null): string {
  if (v == null) return "—";
  return `${v.toLocaleString()}주`;
}

function signedColor(v: number | null): string {
  if (v == null || v === 0) return "text-gray-300";
  return v > 0 ? "text-green-300" : "text-red-300";
}

function ElestockBody({ d }: { d: ElestockDetail }) {
  return (
    <div className="mt-3 space-y-2 text-sm">
      <div className="flex flex-wrap gap-x-4">
        <span>
          보고자: <b>{d.filer ?? "—"}</b>
        </span>
        {d.rgistAt && <span>구분: <b>{d.rgistAt}</b></span>}
        {d.position && <span>직위: <b>{d.position}</b></span>}
        {d.isMainShareholder && (
          <span className="rounded bg-amber-700/80 px-1.5 py-0.5 text-xs">
            주요주주
          </span>
        )}
      </div>
      <div className="border-t border-amber-700/40 pt-2 space-y-1">
        <div>
          소유 변동:{" "}
          <b className={`font-mono ${signedColor(d.changeShares)}`}>
            {formatSignedShares(d.changeShares)}
          </b>
        </div>
        <div>거래후 보유: <b>{formatShares(d.ownedAfterShares)}</b></div>
        <div>
          소유비율:{" "}
          <b>{d.ownedRatio != null ? `${d.ownedRatio.toFixed(2)}%` : "—"}</b>
          {d.changeRatio != null && d.changeRatio !== 0 && (
            <span className={`ml-2 font-mono ${signedColor(d.changeRatio)}`}>
              ({d.changeRatio >= 0 ? "+" : ""}
              {d.changeRatio.toFixed(2)}%p)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MajorstockBody({ d }: { d: MajorstockDetail }) {
  return (
    <div className="mt-3 space-y-2 text-sm">
      <div>
        보고자: <b>{d.filer ?? "—"}</b>
      </div>
      <div className="space-y-1">
        <div>보유주식수: <b>{formatShares(d.ownedShares)}</b></div>
        <div>
          보유비율:{" "}
          <b>{d.ownedRatio != null ? `${d.ownedRatio.toFixed(2)}%` : "—"}</b>
        </div>
        <div>
          변동:{" "}
          <b className={`font-mono ${signedColor(d.changeRatio)}`}>
            {d.changeRatio == null
              ? "—"
              : `${d.changeRatio >= 0 ? "+" : ""}${d.changeRatio.toFixed(2)}%p`}
          </b>
        </div>
      </div>
      {d.reason && (
        <div className="text-xs text-gray-300 whitespace-pre-wrap">
          {d.reason}
        </div>
      )}
    </div>
  );
}

export function OwnershipCard({ rcpNo, reportNm, rceptDt, payload }: Props) {
  const dartUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rcpNo}`;
  const detail = payload?.detail ?? null;
  return (
    <article className="rounded-lg bg-amber-900/80 p-5 text-gray-100 shadow">
      {payload && (
        <span className="inline-block rounded bg-amber-700/80 px-2 py-0.5 text-xs font-medium">
          {payload.reportType}
        </span>
      )}
      <h3 className="mt-2 text-base font-bold">{reportNm}</h3>

      {detail?.type === "elestock" && <ElestockBody d={detail} />}
      {detail?.type === "majorstock" && <MajorstockBody d={detail} />}

      <a
        href={dartUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-xs text-amber-200 hover:underline"
      >
        DART 원본 ↗
      </a>
      <p className="mt-3 text-xs text-gray-300">{formatRceptDt(rceptDt)}</p>
    </article>
  );
}
