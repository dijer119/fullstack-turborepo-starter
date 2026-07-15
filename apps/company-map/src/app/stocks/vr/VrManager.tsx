"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createVrAccount, getVrCycleLogs, getVrOrders, runVrNow, setVrStatus, updateVrSettings,
  type CreateVrInput, type VrAccountView,
} from "@/actions/vr";
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const inputCls = "w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900";

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });

type CycleLogRow = Awaited<ReturnType<typeof getVrCycleLogs>>[number];
type OrderRow = Awaited<ReturnType<typeof getVrOrders>>[number];

export function VrManager({ accounts }: { accounts: VrAccountView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [logs, setLogs] = useState<CycleLogRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const toggleDetail = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    startTransition(async () => {
      const [l, o] = await Promise.all([getVrCycleLogs(id), getVrOrders(id, 60)]);
      setLogs(l);
      setOrders(o);
      setOpenId(id);
    });
  };

  return (
    <div className="space-y-4">
      {message && <p className="text-xs text-blue-600 dark:text-blue-400">{message}</p>}

      {accounts.map((a) => (
        <div key={a.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{a.name}</span>
            <span className="text-xs text-gray-500">{a.symbol}</span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {a.type === "accumulate" ? "적립식" : "거치식"} · {a.formula === "skill" ? "실력공식" : "기본공식"} · G {a.gValue}
            </span>
            {a.dryRun && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                dryRun
              </span>
            )}
            {a.note && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {a.note}
              </span>
            )}
            <span className="ml-auto text-xs text-gray-400">
              {a.cycleIndex}사이클 · 시작 {a.startDate} · 마지막 실행 {a.lastRunDate ?? "—"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="V" value={`$${fmt(a.vValue)}`} />
            <Stat label="밴드 (매수/매도선)" value={`$${fmt(a.bandMin)} / $${fmt(a.bandMax)}`} />
            <Stat label="평가금" value={a.evalAmount != null ? `$${fmt(a.evalAmount)}` : "—"} />
            <Stat label="Pool" value={`$${fmt(a.pool)}`} />
            <Stat label="보유" value={`${fmt(a.holdingQty, 0)}주`} />
            <Stat label={`Pool 한도 (${a.poolLimitPct}%)`} value={`$${fmt((a.pool * a.poolLimitPct) / 100)}`} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <button
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              disabled={pending}
              onClick={() => toggleDetail(a.id)}
            >
              {openId === a.id ? "상세 닫기" : "그래프·주문 이력"}
            </button>
            <button
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await runVrNow(a.id);
                  setMessage(r.message);
                  router.refresh();
                })
              }
            >
              지금 실행
            </button>
            <button
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setVrStatus(a.id, a.status === "active" ? "paused" : "active");
                  router.refresh();
                })
              }
            >
              {a.status === "active" ? "일시정지" : "재개"}
            </button>
            <button
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              disabled={pending}
              onClick={() => setSettingsId(settingsId === a.id ? null : a.id)}
            >
              {settingsId === a.id ? "설정 닫기" : "설정"}
            </button>
          </div>

          {settingsId === a.id && (
            <SettingsForm account={a} onDone={() => setSettingsId(null)} />
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <OrderPreview title={`오늘의 매수표 (LOC, ${a.buyOrders.length}건)`} orders={a.buyOrders} />
            <OrderPreview title={`오늘의 매도표 (지정가, ${a.sellOrders.length}건)`} orders={a.sellOrders} />
          </div>

          {openId === a.id && (
            <div className="mt-4 space-y-4">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={logs.map((l) => ({
                    cycle: l.cycleIndex, V: l.vValue, 평가금: l.evalAmount,
                    최소: Math.round(l.vValue * (1 - a.bandPct / 100) * 100) / 100,
                    최대: Math.round(l.vValue * (1 + a.bandPct / 100) * 100) / 100,
                  }))}>
                    <XAxis dataKey="cycle" fontSize={11} />
                    <YAxis fontSize={11} domain={["auto", "auto"]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="평가금" stroke="#dc2626" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="V" stroke="#2563eb" strokeDasharray="4 4" dot={false} />
                    <Line type="monotone" dataKey="최소" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
                    <Line type="monotone" dataKey="최대" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
                    <th className="py-1 pr-2">거래일</th><th className="pr-2">구분</th><th className="pr-2">가격</th>
                    <th className="pr-2">수량</th><th className="pr-2">상태</th><th>체결가</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-1 pr-2">{o.tradeDate}</td>
                      <td className={`pr-2 ${o.side === "BUY" ? "text-red-600" : "text-blue-600"}`}>
                        {o.side} {o.kind}
                      </td>
                      <td className="pr-2">{o.price != null ? `$${fmt(o.price)}` : "시장가"}</td>
                      <td className="pr-2">{fmt(o.quantity, 0)}</td>
                      <td className="pr-2">{o.status}</td>
                      <td>{o.filledPrice != null ? `$${fmt(o.filledPrice)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <button
        className="rounded border border-blue-300 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30"
        onClick={() => setShowCreate((v) => !v)}
      >
        {showCreate ? "생성 취소" : "+ VR 계좌 추가"}
      </button>
      {showCreate && <CreateForm onDone={() => setShowCreate(false)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function OrderPreview({ title, orders }: { title: string; orders: { price: number; quantity: number }[] }) {
  return (
    <div className="rounded border border-gray-100 p-2 text-xs dark:border-gray-800">
      <div className="mb-1 font-medium text-gray-600 dark:text-gray-300">{title}</div>
      {orders.length === 0 ? (
        <div className="text-gray-400">없음</div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {orders.map((o, i) => (
            <span key={i} className="rounded bg-gray-50 px-1.5 py-0.5 dark:bg-gray-800">
              ${o.price.toFixed(2)}×{o.quantity}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateVrInput>({
    symbol: "TQQQ", name: "TQQQ", type: "accumulate", formula: "skill",
    initialV: 5000, initialPool: 1000, initialQty: 0, contribution: 250, gValue: 10, bandPct: 15,
  });
  const set = (k: keyof CreateVrInput, v: string) =>
    setForm((f) => ({ ...f, [k]: ["symbol", "name", "type", "formula"].includes(k) ? v : Number(v) }));

  return (
    <div className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-700">
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="심볼"><input className={inputCls} value={form.symbol} onChange={(e) => set("symbol", e.target.value)} /></Field>
        <Field label="이름"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="유형">
          <select className={inputCls} value={form.type} onChange={(e) => set("type", e.target.value)}>
            <option value="accumulate">적립식</option>
            <option value="lumpsum">거치식</option>
          </select>
        </Field>
        <Field label="공식">
          <select className={inputCls} value={form.formula} onChange={(e) => set("formula", e.target.value)}>
            <option value="skill">실력공식</option>
            <option value="basic">기본공식</option>
          </select>
        </Field>
        <Field label="초기 V ($)"><input className={inputCls} type="number" value={form.initialV} onChange={(e) => set("initialV", e.target.value)} /></Field>
        <Field label="초기 Pool ($)"><input className={inputCls} type="number" value={form.initialPool} onChange={(e) => set("initialPool", e.target.value)} /></Field>
        <Field label="초기 보유 (주)"><input className={inputCls} type="number" value={form.initialQty} onChange={(e) => set("initialQty", e.target.value)} /></Field>
        <Field label="사이클 적립금 ($)"><input className={inputCls} type="number" value={form.contribution} onChange={(e) => set("contribution", e.target.value)} disabled={form.type === "lumpsum"} /></Field>
        <Field label="G"><input className={inputCls} type="number" value={form.gValue} onChange={(e) => set("gValue", e.target.value)} /></Field>
        <Field label="밴드 ±%"><input className={inputCls} type="number" value={form.bandPct} onChange={(e) => set("bandPct", e.target.value)} /></Field>
      </div>
      <button
        className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await createVrAccount(form);
            if (!r.ok) {
              setError(r.error ?? "생성 실패");
              return;
            }
            router.refresh();
            onDone();
          })
        }
      >
        dryRun으로 생성
      </button>
      <p className="mt-2 text-[11px] text-gray-400">LIVE 모드는 지원하지 않습니다. 중도 합류는 현재 V·Pool·보유수량을 입력하세요.</p>
    </div>
  );
}

function SettingsForm({ account, onDone }: { account: VrAccountView; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gValue, setGValue] = useState(account.gValue);
  const [contribution, setContribution] = useState(account.contribution);
  const [bandPct, setBandPct] = useState(account.bandPct);

  return (
    <div className="mt-3 rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-700">
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="G">
          <input
            className={inputCls}
            type="number"
            value={gValue}
            onChange={(e) => setGValue(Number(e.target.value))}
          />
        </Field>
        <Field label="사이클 적립금 ($)">
          <input
            className={inputCls}
            type="number"
            value={contribution}
            onChange={(e) => setContribution(Number(e.target.value))}
            disabled={account.type === "lumpsum"}
          />
        </Field>
        <Field label="밴드 ±%">
          <input
            className={inputCls}
            type="number"
            value={bandPct}
            onChange={(e) => setBandPct(Number(e.target.value))}
          />
        </Field>
      </div>
      <button
        className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await updateVrSettings(account.id, { gValue, contribution, bandPct });
            if (!r.ok) {
              setError(r.error ?? "저장 실패");
              return;
            }
            router.refresh();
            onDone();
          })
        }
      >
        저장
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block text-gray-500">{label}</span>
      {children}
    </label>
  );
}
