"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDcaAccount,
  getDcaOrders,
  previewSeedPeak,
  runDcaNow,
  setDcaStatus,
  updateDcaSettings,
  type CreateDcaInput,
  type DcaAccountView,
} from "@/actions/dca";

const inputCls = "w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900";

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });

const krw = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n).toLocaleString("ko-KR")}원`;

type OrderRow = Awaited<ReturnType<typeof getDcaOrders>>[number];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 px-2 py-1.5 dark:border-gray-700">
      <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

export function DcaManager({ accounts }: { accounts: DcaAccountView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const toggleDetail = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    startTransition(async () => {
      const o = await getDcaOrders(id, 100);
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
            <span className="text-xs text-gray-500">
              {a.baseSymbol} → {a.leverSymbol}
            </span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {krw(a.dailyAmountKrw)}/거래일 · 임계 −{a.thresholdPct}% · LOC +{a.premiumPct}%
            </span>
            {a.dryRun ? (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                dryRun
              </span>
            ) : (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                LIVE
              </span>
            )}
            {a.status !== "active" && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {a.status}
              </span>
            )}
            {a.note && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {a.note}
              </span>
            )}
            <span className="ml-auto text-xs text-gray-400">
              시작 {a.startDate} · 마지막 실행 {a.lastRunDate ?? "—"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-6">
            <Stat
              label={`${a.baseSymbol} 낙폭 (현재가 기준)`}
              value={a.currentDrawdownPct != null ? `${a.currentDrawdownPct}% ($${fmt(a.basePrice)})` : "—"}
            />
            <Stat label="최고 종가" value={`$${fmt(a.peakPrice)} (${a.peakDate})`} />
            <Stat
              label="지금 매수 대상"
              value={a.pickedSymbol ? `${a.pickedSymbol}${a.leveraged ? " (레버리지)" : ""}` : "—"}
            />
            <Stat label="이월 잔액" value={krw(a.cashKrw)} />
            <Stat
              label="보유"
              value={`${a.baseSymbol} ${fmt(a.holdings[a.baseSymbol] ?? 0, 0)} / ${a.leverSymbol} ${fmt(a.holdings[a.leverSymbol] ?? 0, 0)}주`}
            />
            <Stat label="평가액" value={a.evalUsd != null ? `$${fmt(a.evalUsd)}` : "—"} />
            <Stat label="환율 (USD/KRW)" value={a.fxRate != null ? fmt(a.fxRate, 1) : "—"} />
          </div>

          <div className="mt-3 rounded border border-gray-200 p-2 text-xs dark:border-gray-700">
            <div className="mb-1 font-semibold text-gray-600 dark:text-gray-300">오늘 주문 미리보기</div>
            {a.plan ? (
              <div className="font-mono">
                {a.pickedSymbol} LOC 매수 · 지정가 ${fmt(a.plan.price)} × {a.plan.quantity}주 · 최대{" "}
                ${fmt(a.plan.estUsd)} ({krw(a.plan.estKrw)})
              </div>
            ) : (
              <div className="text-gray-500 dark:text-gray-400">
                1주 값에 못 미쳐 적립만 됩니다
                {a.daysToOneShare != null && ` — 이 속도면 약 ${a.daysToOneShare}거래일 후 1주 가능`}
                {a.pickedPrice != null && ` (1주 ≈ $${fmt(a.pickedPrice)})`}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <button
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              disabled={pending}
              onClick={() => toggleDetail(a.id)}
            >
              {openId === a.id ? "이력 닫기" : "주문 이력"}
            </button>
            <button
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await runDcaNow(a.id);
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
                  await setDcaStatus(a.id, a.status === "active" ? "paused" : "active");
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
            <SettingsForm
              account={a}
              onDone={(msg) => {
                setSettingsId(null);
                if (msg) setMessage(msg);
              }}
            />
          )}

          {openId === a.id && <OrderHistory orders={orders} />}
        </div>
      ))}

      <div>
        <button
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? "생성 폼 닫기" : "+ 계좌 추가"}
        </button>
      </div>

      {showCreate && (
        <CreateForm
          onDone={(msg) => {
            setShowCreate(false);
            if (msg) setMessage(msg);
          }}
        />
      )}
    </div>
  );
}

function OrderHistory({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">주문 이력이 없습니다.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-gray-500 dark:text-gray-400">
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-2 py-1 text-left">거래일</th>
            <th className="px-2 py-1 text-left">종목</th>
            <th className="px-2 py-1 text-right">낙폭</th>
            <th className="px-2 py-1 text-right">지정가</th>
            <th className="px-2 py-1 text-right">수량</th>
            <th className="px-2 py-1 text-left">상태</th>
            <th className="px-2 py-1 text-right">체결가</th>
            <th className="px-2 py-1 text-right">환율</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-gray-100 dark:border-gray-800">
              <td className="px-2 py-1">{o.tradeDate}</td>
              <td className="px-2 py-1">{o.symbol}</td>
              <td className="px-2 py-1 text-right">{o.drawdownPct}%</td>
              <td className="px-2 py-1 text-right">${fmt(o.price)}</td>
              <td className="px-2 py-1 text-right">{fmt(o.quantity, 0)}</td>
              <td className="px-2 py-1">
                {o.status}
                {o.error && <span className="ml-1 text-red-600 dark:text-red-400">({o.error})</span>}
              </td>
              <td className="px-2 py-1 text-right">{o.filledPrice != null ? `$${fmt(o.filledPrice)}` : "—"}</td>
              <td className="px-2 py-1 text-right">{fmt(o.fxRate, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsForm({
  account,
  onDone,
}: {
  account: DcaAccountView;
  onDone: (message?: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [thresholdPct, setThresholdPct] = useState(String(account.thresholdPct));
  const [dailyAmountKrw, setDailyAmountKrw] = useState(String(account.dailyAmountKrw));
  const [premiumPct, setPremiumPct] = useState(String(account.premiumPct));
  const [cashKrw, setCashKrw] = useState(String(account.cashKrw));
  const [peakPrice, setPeakPrice] = useState(String(account.peakPrice));
  const [dryRun, setDryRun] = useState(account.dryRun);

  return (
    <div className="mt-3 rounded border border-gray-200 p-3 dark:border-gray-700">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <label>
          하락 임계 %
          <input className={inputCls} value={thresholdPct} onChange={(e) => setThresholdPct(e.target.value)} />
        </label>
        <label>
          거래일당 적립액 (원)
          <input className={inputCls} value={dailyAmountKrw} onChange={(e) => setDailyAmountKrw(e.target.value)} />
        </label>
        <label>
          LOC 프리미엄 %
          <input className={inputCls} value={premiumPct} onChange={(e) => setPremiumPct(e.target.value)} />
        </label>
        <label>
          이월 잔액 (원) — 워커가 꺼져 있어 누락된 적립을 여기서 보정
          <input className={inputCls} value={cashKrw} onChange={(e) => setCashKrw(e.target.value)} />
        </label>
        <label>
          최고 종가 (USD)
          <input className={inputCls} value={peakPrice} onChange={(e) => setPeakPrice(e.target.value)} />
        </label>
        <label className="flex items-end gap-2">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          <span>dryRun (끄면 실주문 제출)</span>
        </label>
      </div>
      <div className="mt-2 flex gap-2 text-xs">
        <button
          className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              if (!dryRun && account.dryRun) {
                const ok = window.confirm(
                  "dryRun을 끄면 다음 실행부터 실제 매수 주문이 제출됩니다. 계속하시겠습니까?",
                );
                if (!ok) return;
              }
              const r = await updateDcaSettings(account.id, {
                thresholdPct: Number(thresholdPct),
                dailyAmountKrw: Number(dailyAmountKrw),
                premiumPct: Number(premiumPct),
                cashKrw: Number(cashKrw),
                peakPrice: Number(peakPrice),
                dryRun,
              });
              router.refresh();
              onDone(r.ok ? "설정을 저장했습니다" : r.error);
            })
          }
        >
          저장
        </button>
        <button
          className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          onClick={() => onDone()}
        >
          취소
        </button>
      </div>
    </div>
  );
}

function CreateForm({ onDone }: { onDone: (message?: string) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<CreateDcaInput>({
    name: "",
    baseSymbol: "QQQ",
    leverSymbol: "QLD",
    thresholdPct: 10,
    dailyAmountKrw: 50000,
    premiumPct: 5,
    peakPrice: null,
    initialCashKrw: 0,
  });
  const [seedInfo, setSeedInfo] = useState<string | null>(null);

  const set = <K extends keyof CreateDcaInput>(k: K, v: CreateDcaInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <label>
          이름
          <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="QQQ·QLD 적립식" />
        </label>
        <label>
          기준 종목
          <input className={inputCls} value={form.baseSymbol} onChange={(e) => set("baseSymbol", e.target.value)} />
        </label>
        <label>
          레버리지 종목
          <input className={inputCls} value={form.leverSymbol} onChange={(e) => set("leverSymbol", e.target.value)} />
        </label>
        <label>
          하락 임계 %
          <input className={inputCls} value={form.thresholdPct} onChange={(e) => set("thresholdPct", Number(e.target.value))} />
        </label>
        <label>
          거래일당 적립액 (원)
          <input className={inputCls} value={form.dailyAmountKrw} onChange={(e) => set("dailyAmountKrw", Number(e.target.value))} />
        </label>
        <label>
          LOC 프리미엄 %
          <input className={inputCls} value={form.premiumPct} onChange={(e) => set("premiumPct", Number(e.target.value))} />
        </label>
        <label>
          초기 이월 잔액 (원)
          <input className={inputCls} value={form.initialCashKrw} onChange={(e) => set("initialCashKrw", Number(e.target.value))} />
        </label>
        <label>
          최고 종가 (비우면 자동)
          <input
            className={inputCls}
            value={form.peakPrice ?? ""}
            onChange={(e) => set("peakPrice", e.target.value === "" ? null : Number(e.target.value))}
          />
        </label>
      </div>

      <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
        ⚠ 자동 시딩은 토스 일봉 상한(200봉 ≈ 10개월) 안의 최고 종가만 봅니다. 사상 최고가가 그보다
        오래됐다면 초기 낙폭이 과소평가되므로 직접 입력하세요.
      </p>
      {seedInfo && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{seedInfo}</p>}

      <div className="mt-2 flex gap-2 text-xs">
        <button
          className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const s = await previewSeedPeak(form.baseSymbol);
              setSeedInfo(
                s
                  ? `${form.baseSymbol.toUpperCase()} 일봉 ${s.candles}건 중 최고 종가 $${s.price} (${s.date})`
                  : `${form.baseSymbol.toUpperCase()} 일봉을 받지 못했습니다`,
              );
            })
          }
        >
          자동 시딩 값 확인
        </button>
        <button
          className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await createDcaAccount(form);
              router.refresh();
              onDone(r.ok ? "계좌를 생성했습니다 (dryRun)" : r.error);
            })
          }
        >
          생성
        </button>
        <button
          className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          onClick={() => onDone()}
        >
          취소
        </button>
      </div>
    </div>
  );
}
