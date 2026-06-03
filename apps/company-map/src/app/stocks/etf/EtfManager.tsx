"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerEtf, removeEtf, type EtfWatchView, type EtfDetailView } from "@/actions/etf";
import { triggerRefresh } from "@/actions/refresh-jobs";

function pct(v: number | null): string { return v == null ? "—" : `${v.toFixed(2)}%`; }
function deltaP(v: number | null): string { return v == null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%p`; }
function deltaColor(v: number | null): string {
  if (v == null || v === 0) return "text-gray-400";
  return v > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

export function EtfManager({
  watches, selected, detail,
}: { watches: EtfWatchView[]; selected: string | null; detail: EtfDetailView | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const add = () => start(async () => {
    const r = await registerEtf(code);
    setMsg(r.ok ? "등록됨 — 첫 스냅샷 수집 중(잠시 후 새로고침)" : (r.reason ?? "실패"));
    if (r.ok) setCode("");
    router.refresh();
  });
  const refresh = () => start(async () => {
    await triggerRefresh("etf_pdf");
    setMsg("구성종목 갱신 시작됨 (잠시 후 새로고침)");
  });

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
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {watches.map((w) => (
          <span key={w.code} className="inline-flex items-center gap-1">
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
          </div>
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
                  <tr key={c.constituentCode} className="border-b border-gray-100 dark:border-gray-800">
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
    </div>
  );
}
