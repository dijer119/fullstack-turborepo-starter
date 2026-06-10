import { formatMarcap } from "@/lib/format-marcap";
import {
  resolveRoe,
  week52Position,
  bondDividendRatio,
  seoJunsikReturn,
  reprtLabel,
} from "@/lib/stocks/quant-metrics";
import { GaugeChart } from "./GaugeChart";

interface Props {
  currentPrice: number | null;
  marcap: number | null;
  per: number | null;
  pbr: number | null;
  manualRoe: number | null;
  dividendYield: number | null;
  week52: { low: number; high: number; asOfDate: Date } | null;
  treasuryYieldPct: number | null;
  yoy: { pct: number | null; year: number; reprtCode: string } | null;
}

function StatCard({
  title,
  value,
  sub,
  accent = false,
}: {
  title: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-4 dark:bg-gray-900 ${
        accent
          ? "border-emerald-400 dark:border-emerald-600"
          : "border-gray-200 dark:border-gray-700"
      }`}
    >
      <div className="text-xs text-gray-500 dark:text-gray-400">{title}</div>
      <div className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</div>
      )}
    </div>
  );
}

const fmt = (v: number | null, digits = 2, suffix = "") =>
  v != null ? `${v.toFixed(digits)}${suffix}` : "—";

export function QuantDashboard({
  currentPrice,
  marcap,
  per,
  pbr,
  manualRoe,
  dividendYield,
  week52,
  treasuryYieldPct,
  yoy,
}: Props) {
  const roe = resolveRoe(manualRoe, per, pbr);
  const position = week52Position(
    currentPrice,
    week52?.low ?? null,
    week52?.high ?? null,
  );
  const bondDiv = bondDividendRatio(dividendYield, treasuryYieldPct);
  const seo = seoJunsikReturn(pbr, roe);
  const seoVsBond =
    seo != null && treasuryYieldPct != null && treasuryYieldPct > 0
      ? seo / treasuryYieldPct
      : null;

  return (
    <section id="dashboard" className="scroll-mt-6 space-y-4">
      <h2 className="text-lg font-semibold">퀀트 대시보드</h2>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          title="기준가"
          value={currentPrice != null ? `${currentPrice.toLocaleString()}원` : "—"}
        />
        <StatCard title="시가총액" value={formatMarcap(marcap)} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm font-semibold">
            52주 저가 대비 위치{" "}
            {week52 && (
              <span className="text-xs font-normal text-gray-400">
                ({week52.asOfDate.toISOString().slice(0, 10)})
              </span>
            )}
          </div>
          <GaugeChart
            value={position}
            min={0}
            max={100}
            display={fmt(position, 1, "%")}
            color="#8b5cf6"
            subLeft={week52 ? `저가: ${week52.low.toLocaleString()}` : undefined}
            subRight={week52 ? `고가: ${week52.high.toLocaleString()}` : undefined}
          />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm font-semibold">ROE (자기자본이익률)</div>
          <GaugeChart
            value={roe}
            min={-10}
            max={40}
            display={fmt(roe, 2, "%")}
            color="#34d399"
          />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="text-sm font-semibold">PBR (주가순자산비율)</div>
          <GaugeChart
            value={pbr}
            min={0}
            max={3}
            display={fmt(pbr, 2, "x")}
            color="#f59e0b"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="예상 시가배당률" value={fmt(dividendYield, 2, "%")} />
        <StatCard
          title="국채시가배당률"
          value={fmt(bondDiv, 2, "배")}
          sub={treasuryYieldPct != null ? `국채금리 ${fmt(treasuryYieldPct, 2, "%")}` : "국채금리 미설정"}
        />
        <StatCard
          title={
            yoy
              ? `YoY (순이익, ${yoy.year}.${reprtLabel(yoy.reprtCode)})`
              : "YoY (순이익)"
          }
          value={fmt(yoy?.pct ?? null, 1, "%")}
        />
        <StatCard
          title="서준식 지수 (기대수익률)"
          value={fmt(seo, 2, "%")}
          sub={seoVsBond != null ? `국채금리 대비 ${seoVsBond.toFixed(2)}배` : undefined}
          accent={seoVsBond != null && seoVsBond >= 2}
        />
      </div>
    </section>
  );
}
