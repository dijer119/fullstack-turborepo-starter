import { formatMarcap } from "@/lib/format-marcap";
import { RefreshButton } from "./RefreshButton";

interface Props {
  code: string;
  name: string;
  market: string | null;
  currentPrice: number | null;
  marcap: number | null;
  per: number | null;
  pbr: number | null;
  manualRoe: number | null;
}

function effectiveRoePct(
  manualRoe: number | null,
  per: number | null,
  pbr: number | null,
): number | null {
  if (manualRoe != null) return manualRoe;
  if (per != null && pbr != null && per > 0 && pbr > 0) return (pbr / per) * 100;
  return null;
}

export function StockDetailHeader({
  code,
  name,
  market,
  currentPrice,
  marcap,
  per,
  pbr,
  manualRoe,
}: Props) {
  const roe = effectiveRoePct(manualRoe, per, pbr);
  return (
    <header className="space-y-2">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{name}</h1>
        <span className="font-mono text-sm text-gray-500">{code}</span>
        {market && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {market}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
        <span>
          현재가{" "}
          <b className="text-gray-900 dark:text-gray-100">
            {currentPrice != null ? currentPrice.toLocaleString() : "—"}
          </b>
          원
        </span>
        <span>
          시총{" "}
          <b className="text-gray-900 dark:text-gray-100">{formatMarcap(marcap)}</b>
        </span>
        <span>
          PER{" "}
          <b className="text-gray-900 dark:text-gray-100">
            {per != null ? per.toFixed(1) : "—"}
          </b>
        </span>
        <span>
          PBR{" "}
          <b className="text-gray-900 dark:text-gray-100">
            {pbr != null ? pbr.toFixed(2) : "—"}
          </b>
        </span>
        <span>
          ROE{" "}
          <b className="text-gray-900 dark:text-gray-100">
            {roe != null ? `${roe.toFixed(2)}%` : "—"}
          </b>
        </span>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <RefreshButton code={code} />
        <a
          href={`https://finance.naver.com/item/main.naver?code=${code}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          네이버 금융 ↗
        </a>
      </div>
    </header>
  );
}
