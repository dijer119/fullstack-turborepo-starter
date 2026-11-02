import type { Prisma } from "@prisma-clients/company-map";

export interface ReservationInput { watchPrice: number; expiresOn: string }
export const reservationLabels: Record<string, string> = {
  waiting: "가격 감시 대기", ordering: "주문 접수·체결 확인 중", executed: "1차 체결 · 분할매매 진행",
  failed: "실패 · 확인 필요", expired: "감시 기간 만료", cancelled: "감시 종료",
};
export function reservationDate(expiresAt: string | Date) {
  return new Date(new Date(expiresAt).getTime() - 1 + 9 * 3600000).toISOString().slice(0, 10);
}
export function validateReservation(input: ReservationInput, market: string, now: Date) {
  if (!input || !Number.isFinite(input.watchPrice) || input.watchPrice <= 0 || input.watchPrice > 1e10 ||
      (market === "KR" && !Number.isInteger(input.watchPrice)))
    throw new Error("감시 가격은 양수로 입력하세요. 원화 가격은 정수만 가능합니다.");
  if (typeof input.expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn))
    throw new Error("감시 유효일을 입력하세요.");
  const start = new Date(`${input.expiresOn}T00:00:00+09:00`);
  const expiresAt = new Date(start.getTime() + 86400000);
  if (!Number.isFinite(start.getTime()) || reservationDate(expiresAt) !== input.expiresOn || expiresAt <= now)
    throw new Error("감시 유효일은 오늘 이후의 유효한 날짜여야 합니다.");
  return { watchPrice: input.watchPrice, expiresAt };
}

export async function transitionReservation(tx: Prisma.TransactionClient, strategyId: string,
  status: string, message: string, now: Date, orderId?: string) {
  const r = await tx.splitBuyReservation.findUnique({ where: { strategyId } });
  if (!r || r.status === status || r.status === "executed" || r.status === "cancelled") return;
  const saved = await tx.splitBuyReservation.updateMany({
    where: { strategyId, status: r.status },
    data: { status, note: message, ...(orderId ? { orderId } : {}) },
  });
  if (saved.count) await tx.splitReservationEvent.create({ data: {
    strategyId, type: status, message, watchPrice: r.watchPrice, expiresAt: r.expiresAt,
    orderId: orderId ?? r.orderId, createdAt: now,
  } });
}
