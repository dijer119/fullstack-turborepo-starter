import Link from "next/link";
import { getCombinedEtfHoldings, type CombinedHoldingRow } from "@/actions/etf";
import { getFundDetail } from "@/actions/funds";

export const metadata = { title: "ETF 비중 합산 — Company Map" };
export const dynamic = "force-dynamic";

// 기본 비교 대상 (요청한 5개 ETF). ?codes=A,B,C 로 재정의 가능.
const DEFAULT_CODES = ["0074K0", "495230", "495060", "385720", "441800"];

function pct(v: number | null): string {
  return v == null ? "" : `${v.toFixed(2)}%`;
}

// 합산 비중 크기에 따른 옅은 배경 강조 (히트맵)
function heat(v: number | null, max: number): string {
  if (v == null || max <= 0) return "";
  const a = Math.min(0.5, (v / max) * 0.5);
  return `rgba(37, 99, 235, ${a.toFixed(3)})`;
}

// 순위 변동 표시 (▲상승 / ▼하락 / 신규 / 이탈)
function RankDelta({ r }: { r: CombinedHoldingRow }) {
  if (r.status === "신규") {
    return <span className="rounded bg-blue-100 px-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">신규</span>;
  }
  if (r.status === "이탈") {
    return <span className="rounded bg-gray-200 px-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">이탈</span>;
  }
  const d = r.rankDelta;
  if (d == null || d === 0) return <span className="text-gray-400">–</span>;
  // 앱 공통: 상승/증가 초록, 하락/감소 빨강
  return d > 0 ? (
    <span className="text-green-600 dark:text-green-400">▲{d}</span>
  ) : (
    <span className="text-red-600 dark:text-red-400">▼{-d}</span>
  );
}

function WeightDelta({ v }: { v: number | null }) {
  if (v == null || Math.abs(v) < 0.005) return <span className="text-gray-400">–</span>;
  return v > 0 ? (
    <span className="text-green-600 dark:text-green-400">+{v.toFixed(2)}%p</span>
  ) : (
    <span className="text-red-600 dark:text-red-400">{v.toFixed(2)}%p</span>
  );
}

export default async function CombinedEtfPage({
  searchParams,
}: {
  searchParams: Promise<{ codes?: string; fund?: string }>;
}) {
  const { codes, fund } = await searchParams;
  const codeList = codes
    ? codes.split(",").map((c) => c.trim()).filter(Boolean)
    : DEFAULT_CODES;
  const showFund = fund === "1";

  const { columns, rows, missing, hasPrev } = await getCombinedEtfHoldings(codeList);
  const maxTotal = rows.reduce((m, r) => Math.max(m, r.total), 0);

  // 펀드 컬럼(선택적): ETF 합산과 성격이 달라 합산하지 않고 종목명 매칭으로 병기만 한다.
  // 종목 식별이 코드(ETF)↔이름(펀드)으로 달라 공유 합산 로직을 건드리지 않고
  // 이 화면에서만 이름으로 매칭하는 프레젠테이션 오버레이.
  const fundDetail = showFund ? await getFundDetail().catch(() => null) : null;
  const fundHoldings = (fundDetail?.changes ?? []).filter((c) => c.status !== "이탈");
  const fundWeightByName = new Map(fundHoldings.map((c) => [c.constituentName, c.weight]));
  const rowNames = new Set(rows.map((r) => r.constituentName));
  const fundOnly = fundHoldings.filter((c) => !rowNames.has(c.constituentName));

  // 변동 요약 (유지 종목의 순위 상승/하락, 신규/이탈)
  const newCount = rows.filter((r) => r.status === "신규").length;
  const outCount = rows.filter((r) => r.status === "이탈").length;
  const upMovers = rows
    .filter((r) => r.status === "유지" && (r.rankDelta ?? 0) > 0)
    .sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0))
    .slice(0, 3);
  const downMovers = rows
    .filter((r) => r.status === "유지" && (r.rankDelta ?? 0) < 0)
    .sort((a, b) => (a.rankDelta ?? 0) - (b.rankDelta ?? 0))
    .slice(0, 3);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">ETF 비중 합산 · 전일 대비</h1>
        <p className="mt-1 text-sm text-gray-500">
          선택한 {columns.length}개 ETF의 최신 구성종목(각 ETF Top10)을 종목별로 합산하고,
          직전 스냅샷 대비 순위·비중 변동을 표시합니다.
        </p>
        <div className="flex gap-3">
          <Link
            href="/stocks/etf"
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            ← ETF 상세
          </Link>
          <Link
            href={`/stocks/etf/combined?${new URLSearchParams({ ...(codes ? { codes } : {}), ...(showFund ? {} : { fund: "1" }) }).toString()}`}
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            {showFund ? "펀드 컬럼 끄기" : "+ VIP 펀드 컬럼"}
          </Link>
        </div>
      </header>

      {/* ETF 범례 */}
      {columns.length > 0 && (
        <ul className="mb-4 grid gap-1 text-xs text-gray-600 sm:grid-cols-2 dark:text-gray-300">
          {columns.map((c, i) => (
            <li key={c.code}>
              <span className="font-semibold">E{i + 1}</span> · {c.name}{" "}
              <span className="text-gray-400">
                ({c.code} · {c.trdDd ?? "—"}
                {c.prevTrdDd ? ` ← ${c.prevTrdDd}` : ""})
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 변동 요약 */}
      {hasPrev && (
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
          <span>신규 <b className="text-blue-600 dark:text-blue-400">{newCount}</b> · 이탈 <b className="text-gray-600 dark:text-gray-300">{outCount}</b></span>
          {upMovers.length > 0 && (
            <span>
              순위↑ {upMovers.map((r) => `${r.constituentName}(▲${r.rankDelta})`).join(", ")}
            </span>
          )}
          {downMovers.length > 0 && (
            <span>
              순위↓ {downMovers.map((r) => `${r.constituentName}(▼${-(r.rankDelta ?? 0)})`).join(", ")}
            </span>
          )}
        </div>
      )}

      {missing.length > 0 && (
        <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
          ⚠ 데이터 없음(미등록/미수집): {missing.join(", ")}
        </p>
      )}
      {columns.length > 0 && !hasPrev && (
        <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
          ⚠ 직전 스냅샷이 없어 전일 대비 변동을 계산할 수 없습니다.
        </p>
      )}

      {columns.length === 0 ? (
        <p className="text-sm text-gray-500">표시할 ETF 데이터가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right">
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">순위</th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">변동</th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 text-left font-medium dark:border-gray-700 dark:bg-gray-900">
                  종목 ({rows.length})
                </th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">합산비중</th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">비중Δ</th>
                <th className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">보유ETF</th>
                {columns.map((c, i) => (
                  <th key={c.code} title={c.name} className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 p-2 font-medium dark:border-gray-700 dark:bg-gray-900">
                    E{i + 1}
                  </th>
                ))}
                {showFund && (
                  <th title={fundDetail?.name ?? "VIP 펀드"} className="sticky top-0 z-10 border-b border-gray-200 bg-indigo-50 p-2 font-medium dark:border-gray-700 dark:bg-indigo-950/40">
                    펀드
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.constituentCode || r.constituentName}
                  className={`border-b border-gray-100 text-right last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 ${
                    r.status === "이탈" ? "opacity-60" : ""
                  }`}
                >
                  <td className="p-2 tabular-nums text-gray-500">{r.rank ?? "–"}</td>
                  <td className="p-2"><RankDelta r={r} /></td>
                  <td className="p-2 text-left">
                    <span className="font-medium">{r.constituentName}</span>
                    {r.constituentCode && (
                      <span className="ml-1.5 text-xs text-gray-400">{r.constituentCode}</span>
                    )}
                  </td>
                  <td className="p-2 font-semibold tabular-nums" style={{ backgroundColor: heat(r.total, maxTotal) }}>
                    {r.total.toFixed(2)}%
                  </td>
                  <td className="p-2 tabular-nums"><WeightDelta v={r.weightDelta} /></td>
                  <td className="p-2 tabular-nums text-gray-500">{r.count}/{columns.length}</td>
                  {r.byEtf.map((w, i) => (
                    <td key={columns[i].code} className={`p-2 tabular-nums ${w == null ? "text-gray-300 dark:text-gray-700" : ""}`}>
                      {w == null ? "·" : pct(w)}
                    </td>
                  ))}
                  {showFund && (() => {
                    const w = fundWeightByName.get(r.constituentName) ?? null;
                    return (
                      <td className={`p-2 tabular-nums ${w == null ? "text-gray-300 dark:text-gray-700" : "bg-indigo-50/60 dark:bg-indigo-950/30"}`}>
                        {w == null ? "·" : pct(w)}
                      </td>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showFund && fundOnly.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          펀드 단독 보유(ETF 합산 미포함): {fundOnly.map((c) => `${c.constituentName}(${c.weight?.toFixed(2) ?? "—"}%)`).join(", ")}
        </p>
      )}
    </main>
  );
}
