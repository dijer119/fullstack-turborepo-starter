"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  registerEtf, removeEtf, reorderEtfWatches,
  type EtfWatchView, type EtfDetailView,
} from "@/actions/etf";
import { moveCode } from "@/lib/etf/reorder";
import { formatMarcap } from "@/lib/format-marcap";
import { triggerRefresh, type RefreshStateView } from "@/actions/refresh-jobs";
import type { ShareHistory } from "@/lib/etf/history";
import type { EtfDividend, EtfPeriodReturn, EtfReturns } from "@/lib/etf/types";
import { ShareHistorySection } from "./ShareHistorySection";

function pct(v: number | null): string { return v == null ? "—" : `${v.toFixed(2)}%`; }
function deltaP(v: number | null): string { return v == null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%p`; }
function deltaColor(v: number | null): string {
  if (v == null || v === 0) return "text-gray-400";
  return v > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

// Naver 기간 코드 → 표시명. 표에는 응답에 있는 기간만 이 순서로 나온다(모르는 코드는 뒤에 원문 그대로).
const PERIOD_LABELS: [string, string][] = [
  ["D1", "1일"], ["W1", "1주"], ["M1", "1개월"], ["M3", "3개월"], ["M6", "6개월"],
  ["YTD", "YTD"], ["Y1", "1년"], ["Y3", "3년"], ["Y5", "5년"], ["Y10", "10년"],
];

// "20261001" → "2026-10-01"
function fmtYmd(ymd: string): string {
  return ymd.length === 8 ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : ymd;
}

function ReturnsTable({ returns }: { returns: EtfReturns }) {
  const present = new Set([...returns.market, ...returns.nav].map((r) => r.period));
  const known = new Set(PERIOD_LABELS.map(([c]) => c));
  const periods: [string, string][] = [
    ...PERIOD_LABELS.filter(([c]) => present.has(c)),
    ...[...present].filter((c) => !known.has(c)).map((c): [string, string] => [c, c]),
  ];
  if (periods.length === 0) return null;
  const rows: [string, EtfPeriodReturn[]][] = [["시장가", returns.market], ["NAV", returns.nav]];
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs text-gray-500">
        기간별 수익률{returns.referenceDate && ` · 기준일 ${fmtYmd(returns.referenceDate)}`} (Naver)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="border-b p-2 text-left" />
              {periods.map(([c, label]) => (
                <th key={c} className="whitespace-nowrap border-b p-2 text-right">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, list]) => {
              const byPeriod = new Map(list.map((r) => [r.period, r.value]));
              return (
                <tr key={label}>
                  <td className="whitespace-nowrap p-2 text-gray-500">{label}</td>
                  {periods.map(([c]) => {
                    const v = byPeriod.get(c) ?? null;
                    return (
                      <td key={c} className={`whitespace-nowrap p-2 text-right tabular-nums ${deltaColor(v)}`}>
                        {v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DividendLine({ dividend }: { dividend: EtfDividend }) {
  const perShare = dividend.perShareTtm ?? 0;
  if (perShare <= 0) {
    return <div className="mb-3 text-sm text-gray-500">최근 12개월 분배 없음</div>;
  }
  const count = dividend.countThisYear ?? 0;
  return (
    <div className="mb-3 text-sm">
      <span className="text-gray-500">분배금(최근 12개월)</span>{" "}
      <span className="font-medium tabular-nums">{perShare.toLocaleString()}원</span>
      {dividend.yieldTtm != null && (
        <>
          {" · "}<span className="text-gray-500">분배율</span>{" "}
          <span className="font-medium tabular-nums">{dividend.yieldTtm.toFixed(2)}%</span>
        </>
      )}
      {count > 0 && (
        <span className="text-gray-500">
          {" · "}올해 {count}회 지급
          {dividend.monthsThisYear.length > 0 && ` (${dividend.monthsThisYear.join("·")}월)`}
        </span>
      )}
    </div>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ").slice(0, 16);
  // ISO(UTC) → KST 표기. timeZone을 고정해 SSR/CSR 결과가 동일.
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16);
}

// refresh_states 상태 + 로그를 사용자에게 보여주기 위한 톤/라벨.
// 잡은 exit 0이어도 개별 ETF 수집이 실패할 수 있어 output 텍스트로 실패를 판정한다.
function refreshTone(state: RefreshStateView): { label: string; cls: string } {
  const base = "rounded px-2 py-0.5 text-xs font-medium ";
  if (state.status === "running")
    return { label: "수집 중…", cls: base + "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
  if (state.status === "idle")
    return { label: "아직 수집 안 함", cls: base + "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" };
  const hasError = state.output != null && /실패|Error|HTTP\s*\d{3}/.test(state.output);
  if (state.status === "failed" || hasError)
    return {
      label: state.status === "failed" ? "실패" : "일부 실패",
      cls: base + "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    };
  return { label: "정상", cls: base + "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" };
}

export function EtfManager({
  watches, selected, detail, history, refreshState,
}: {
  watches: EtfWatchView[];
  selected: string | null;
  detail: EtfDetailView | null;
  history: ShareHistory | null;
  refreshState: RefreshStateView | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // DnD 순서 변경: localOrder는 낙관적 표시 순서. effect 없이 렌더 시 watches와 조합한다.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [overCode, setOverCode] = useState<string | null>(null);

  const byCode = new Map(watches.map((w) => [w.code, w]));
  const ordered = localOrder
    ? [
        ...localOrder.map((c) => byCode.get(c)).filter((w): w is EtfWatchView => w != null),
        ...watches.filter((w) => !localOrder.includes(w.code)),
      ]
    : watches;

  const drop = (dropCode: string) => {
    if (!dragCode || dragCode === dropCode) return;
    const next = moveCode(ordered.map((w) => w.code), dragCode, dropCode);
    setLocalOrder(next); // 낙관적 반영
    start(async () => {
      try {
        const r = await reorderEtfWatches(next);
        if (!r.ok) setLocalOrder(null); // 코드 집합 불일치 → 서버 상태로 복원
      } catch {
        setLocalOrder(null);
      }
      router.refresh();
    });
  };

  const add = () => start(async () => {
    const r = await registerEtf(code);
    setMsg(r.ok ? "등록됨 — 첫 스냅샷 수집 중(잠시 후 새로고침)" : (r.reason ?? "실패"));
    if (r.ok) setCode("");
    router.refresh();
  });
  const refresh = () => start(async () => {
    await triggerRefresh("etf_pdf");
    setMsg("구성종목 갱신 시작됨 — 5초 후 자동 새로고침");
    setTimeout(() => router.refresh(), 5000);
  });

  const tone = refreshState ? refreshTone(refreshState) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="ETF 단축코드 (예: 0074K0)"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button onClick={add} disabled={pending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60">
          관심 ETF 추가
        </button>
        <button onClick={refresh} disabled={pending}
          className="rounded border border-blue-500 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40">
          구성종목 갱신
        </button>
        <button
          onClick={() => router.push("/stocks/etf/combined")}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
          비중 합산 보기
        </button>
        <button
          onClick={() => router.push("/stocks/etf/compare")}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
          수익률·분배 비교
        </button>
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>

      {refreshState && tone && (
        <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-500">수집 상태</span>
            <span className={tone.cls}>{tone.label}</span>
            <span className="text-xs text-gray-400">
              마지막 실행: {fmtTime(refreshState.finishedAt ?? refreshState.startedAt)}
            </span>
          </div>
          {refreshState.output && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                수집 로그 보기
              </summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                {refreshState.output}
              </pre>
            </details>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ordered.map((w) => (
          <span
            key={w.code}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", w.code);
              e.dataTransfer.effectAllowed = "move";
              setDragCode(w.code);
            }}
            onDragOver={(e) => { e.preventDefault(); setOverCode(w.code); }}
            onDragLeave={() => setOverCode((c) => (c === w.code ? null : c))}
            onDrop={(e) => { e.preventDefault(); drop(w.code); }}
            onDragEnd={() => { setDragCode(null); setOverCode(null); }}
            className={`inline-flex cursor-grab items-center gap-1 ${
              dragCode === w.code ? "opacity-50" : ""
            } ${overCode === w.code && dragCode !== null && dragCode !== w.code ? "border-l-2 border-blue-500 pl-1" : ""}`}
          >
            <button
              onClick={() => router.push(`/stocks/etf?code=${w.code}`)}
              className={`rounded px-2 py-1 text-sm ${
                w.code === selected ? "bg-blue-600 text-white" : "border border-gray-300 dark:border-gray-700"
              }`}>
              {w.name} ({w.code})
            </button>
            <button onClick={() => start(async () => { await removeEtf(w.code); router.refresh(); })}
              className="text-gray-400 hover:text-red-600" aria-label={`${w.code} 삭제`}>×</button>
          </span>
        ))}
        {watches.length === 0 && <span className="text-sm text-gray-500">등록된 ETF가 없습니다.</span>}
      </div>

      {detail && (
        <section>
          <div className="mb-2 text-sm text-gray-500">
            기준일 {detail.latestTrdDd ?? "—"}
            {detail.prevTrdDd ? ` · 직전 ${detail.prevTrdDd} 대비` : " · 비교할 직전 데이터 없음"}
            {detail.marketValue != null && ` · 시가총액 ${formatMarcap(detail.marketValue)}`}
          </div>
          {detail.returns && <ReturnsTable returns={detail.returns} />}
          {detail.dividend && <DividendLine dividend={detail.dividend} />}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-left">
                  <th className="border-b p-2">종목명</th>
                  <th className="border-b p-2 text-right">비중</th>
                  <th className="border-b p-2 text-right">비중Δ</th>
                  <th className="border-b p-2">상태</th>
                  <th className="border-b p-2 text-right">주식수</th>
                  <th className="border-b p-2 text-right">주식수Δ</th>
                </tr>
              </thead>
              <tbody>
                {detail.changes.map((c) => (
                  <tr key={c.constituentCode || c.constituentName} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="p-2">{c.constituentName}</td>
                    <td className="p-2 text-right">{pct(c.weight)}</td>
                    <td className={`p-2 text-right ${deltaColor(c.weightDelta)}`}>{deltaP(c.weightDelta)}</td>
                    <td className="p-2">
                      {c.status === "신규" && <span className="text-green-600 dark:text-green-400">신규(Top10 진입)</span>}
                      {c.status === "이탈" && <span className="text-red-600 dark:text-red-400">이탈(Top10 밖)</span>}
                      {c.status === "유지" && <span className="text-gray-400">유지</span>}
                    </td>
                    <td className="p-2 text-right">{c.shares?.toLocaleString() ?? "—"}</td>
                    <td className={`p-2 text-right ${deltaColor(c.sharesDelta)}`}>
                      {c.sharesDelta == null ? "" : `${c.sharesDelta >= 0 ? "+" : ""}${c.sharesDelta.toLocaleString()}`}
                    </td>
                  </tr>
                ))}
                {detail.changes.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-gray-500">스냅샷이 아직 없습니다. &quot;구성종목 갱신&quot;을 눌러주세요.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {detail && history && <ShareHistorySection history={history} />}
    </div>
  );
}
