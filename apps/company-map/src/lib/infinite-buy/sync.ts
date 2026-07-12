// V4.0 체결 동기화 — 순수 파트.
// V4의 상태(연속 T·잔금)는 오직 체결 이벤트로만 갱신된다 (레퍼런스 §2·§10).
//   매수: ΔT = 가중(전반 leg 0.5 / 후반·첫매수 1) × 체결비율. 잔금 −= 체결대금.
//   쿼터매도: T×0.75 / 지정가매도: T×0.25 (부분체결이어도 전량 기준 — 스펙 확정). 잔금 += 체결대금.
// 같은 거래일 적용 순서: 지정가매도(장중) → 쿼터매도(종가) → 매수(종가).
export interface FillEvent {
  side: "BUY" | "SELL";
  kind: string;
  quantity: number;    // 주문 수량
  filledQty: number;   // 체결 수량
  filledPrice: number; // 체결가
  tradeDate: string;   // YYYY-MM-DD
}

const BUY_T_WEIGHT: Record<string, number> = {
  first_big_loc: 1,
  loc_star_full: 1,
  loc_star_half: 0.5,
  loc_avg_half: 0.5,
};

const KIND_PRIORITY: Record<string, number> = {
  sell_lim_target: 0, // 장중 체결 — 같은 날이면 가장 먼저
  sell_loc_star: 1,   // 종가 체결
};

export function sortFills<T extends FillEvent>(fills: T[]): T[] {
  return [...fills].sort((a, b) =>
    a.tradeDate !== b.tradeDate
      ? a.tradeDate.localeCompare(b.tradeDate)
      : (KIND_PRIORITY[a.kind] ?? 2) - (KIND_PRIORITY[b.kind] ?? 2),
  );
}

export function applyFills(
  init: { t: number; cash: number },
  fills: FillEvent[],
): { t: number; cash: number } {
  let { t, cash } = init;
  for (const fe of sortFills(fills)) {
    if (!(fe.filledQty > 0) || !(fe.filledPrice > 0)) continue;
    const amount = fe.filledQty * fe.filledPrice;
    if (fe.side === "BUY") {
      const weight = BUY_T_WEIGHT[fe.kind] ?? 1;
      t += weight * (fe.filledQty / fe.quantity);
      cash -= amount;
    } else {
      t *= fe.kind === "sell_loc_star" ? 0.75 : 0.25;
      cash += amount;
    }
  }
  return { t, cash };
}

// dryRun 포지션 파생: 매수 가중평균 평단, 매도는 수량만 감소(평단 유지).
export function derivePositionFromFills(fills: FillEvent[]): { avgPrice: number | null; holdingQty: number } {
  let qty = 0;
  let avg: number | null = null;
  for (const fe of sortFills(fills)) {
    if (!(fe.filledQty > 0) || !(fe.filledPrice > 0)) continue;
    if (fe.side === "BUY") {
      avg = avg == null || qty <= 0
        ? fe.filledPrice
        : (avg * qty + fe.filledPrice * fe.filledQty) / (qty + fe.filledQty);
      qty += fe.filledQty;
    } else {
      qty -= fe.filledQty;
      if (qty <= 0) { qty = 0; avg = null; }
    }
  }
  return { avgPrice: avg, holdingQty: qty };
}

// 정합성: Σ매수체결 − Σ매도체결 = 실제 보유수량 (LIVE 오염 방어선)
export function crossCheckHolding(fills: FillEvent[], actualQty: number): { ok: boolean; expected: number } {
  let expected = 0;
  for (const fe of fills) {
    if (!(fe.filledQty > 0) || !(fe.filledPrice > 0)) continue;
    expected += fe.side === "BUY" ? fe.filledQty : -fe.filledQty;
  }
  return { ok: Math.abs(expected - actualQty) < 1e-6, expected };
}
