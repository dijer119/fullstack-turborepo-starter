// 자금 상태 전이. cashKrw는 "아직 주식으로 바뀌지 않은 원화 적립 잔액"이다.
//   - 주문 제출은 잔액을 건드리지 않는다 → 미체결 시 원복 로직이 필요 없다.
//   - 체결이 확정된 순간에만 차감한다. 차감액은 주문에 기록된 환율로 환산한다(근사).
//   - 적립은 lastRunDate와 분리된 lastAccrualDate로 멱등을 보장한다. 뒷 단계가 보류돼
//     lastRunDate가 갱신되지 않아도 같은 거래일에 두 번 적립되지 않는다.
// DB를 모르는 순수 함수만 둔다 (infinite-buy/sync.ts applyFills와 같은 관행).

export interface DcaFillEvent {
  filledQty: number | null;
  filledPrice: number | null;
  /** 주문 생성 시점의 USD/KRW */
  fxRate: number;
}

/** 체결분을 원화 잔액에서 차감. 미체결·환율 이상 건은 건너뛴다. 반환값은 원 단위 정수. */
export function applyFills(cashKrw: number, fills: DcaFillEvent[]): number {
  let next = cashKrw;
  for (const f of fills) {
    if (f.filledQty == null || f.filledPrice == null) continue;
    if (!Number.isFinite(f.filledQty) || !Number.isFinite(f.filledPrice)) continue;
    if (!Number.isFinite(f.fxRate) || f.fxRate <= 0) continue;
    next -= f.filledPrice * f.filledQty * f.fxRate;
  }
  return Math.round(next);
}

/** 거래일당 1회 적립. 이미 그 거래일에 적립했으면 accrued: false. */
export function accrue(args: {
  cashKrw: number;
  lastAccrualDate: string | null;
  tradeDate: string;
  dailyAmountKrw: number;
}): { cashKrw: number; accrued: boolean } {
  if (args.lastAccrualDate === args.tradeDate) return { cashKrw: args.cashKrw, accrued: false };
  if (!Number.isFinite(args.dailyAmountKrw) || args.dailyAmountKrw <= 0) {
    return { cashKrw: args.cashKrw, accrued: false };
  }
  return { cashKrw: Math.round(args.cashKrw + args.dailyAmountKrw), accrued: true };
}

/** 종목별 보유수량 = 체결 누적. 매수 전용 전략이라 감산이 없다. 화면 표시용. */
export function deriveHoldings(
  fills: Array<{ symbol: string; filledQty: number | null }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of fills) {
    if (f.filledQty == null || !Number.isFinite(f.filledQty)) continue;
    out[f.symbol] = (out[f.symbol] ?? 0) + f.filledQty;
  }
  return out;
}
