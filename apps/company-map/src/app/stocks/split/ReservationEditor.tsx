"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSplitReservation } from "@/actions/split-live";
import { reservationDate, reservationLabels } from "@/lib/split/reservation";
import { MoneyInput } from "./MoneyInput";

export function ReservationEditor({ id, market, strategyStatus, reservation }: {
  id: string; market: string; strategyStatus: string;
  reservation: { watchPrice: number; expiresAt: string; status: string };
}) {
  const router = useRouter();
  const [watchPrice, setWatchPrice] = useState(reservation.watchPrice);
  const [expiresOn, setExpiresOn] = useState(reservationDate(reservation.expiresAt));
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const editable = strategyStatus === "paused" && !["executed", "ordering", "cancelled"].includes(reservation.status);
  const inputClass = "w-full rounded-lg border border-line bg-surface px-3 py-2";
  return <form className="mt-4 space-y-3 rounded-xl border border-line bg-surface-muted p-4" onSubmit={event => {
    event.preventDefault();
    start(async () => {
      try { const result = await updateSplitReservation(id, { watchPrice, expiresOn }); setMessage(result.message); router.refresh(); }
      catch { setMessage("예약 조건 저장 결과를 확인하지 못했습니다. 새로고침 후 확인하세요."); }
    });
  }}>
    <h4 className="font-semibold">예약 매수 조건 · {reservationLabels[reservation.status] ?? reservation.status}</h4>
    <fieldset disabled={!editable || pending} className="grid gap-3 disabled:opacity-60 sm:grid-cols-2">
      <MoneyInput label="감시 가격 이하에서 1차 매수" market={market} value={watchPrice} onChange={setWatchPrice} className={inputClass} />
      <label className="text-sm">감시 유효일 (한국시간)<input className={inputClass} type="date" required value={expiresOn} onChange={event => setExpiresOn(event.target.value)} /></label>
    </fieldset>
    <p className="text-xs leading-5 text-muted">유효일 23:59:59까지 거래 가능 시간에 감시합니다. 조건 변경은 일시정지 후, 1차 체결·미해결 주문이 없을 때 가능합니다. 실패·만료 후 다시 저장하면 감시 대기로 돌아갑니다. 1차 체결 후에는 기존 분할매매 설정으로 계속 운용합니다.</p>
    {editable && <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm text-on-accent disabled:opacity-50">예약 조건 저장</button>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
