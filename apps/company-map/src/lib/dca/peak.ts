// 낙폭 판정. base 종목의 "직전 최고 종가" 대비 하락률로 그날 매수할 종목을 고른다.
// 최고가는 DB에 running peak로 저장한다 — 토스 일봉 조회가 200봉(약 10개월)까지만
// 지원해 매 실행마다 사상 최고가를 재계산할 수 없기 때문. 순수 함수만 둔다.

export interface DcaSymbolPick {
  symbol: string;
  leveraged: boolean;
  /** 표시·기록용 낙폭(%). 판정에는 반올림 전 비율을 쓴다. */
  drawdownPct: number;
}

/** 신고가면 갱신, 아니면 기존 peak 유지. 비정상 입력은 무시. */
export function updatePeak(peak: number, prevClose: number): number {
  if (!Number.isFinite(prevClose) || prevClose <= 0) return peak;
  return prevClose > peak ? prevClose : peak;
}

/** 직전 최고가 대비 비율(−0.1 = −10%). 반올림하지 않는다 — 임계 판정용. */
export function drawdownRatio(prevClose: number, peak: number): number {
  if (!Number.isFinite(prevClose) || !Number.isFinite(peak) || peak <= 0) return 0;
  return prevClose / peak - 1;
}

/** 표시·기록용 낙폭(%), 소수 2자리. */
export function drawdownPct(prevClose: number, peak: number): number {
  return Math.round(drawdownRatio(prevClose, peak) * 10000) / 100;
}

/** 낙폭이 −thresholdPct 이하(경계 포함)면 레버리지 종목. */
export function pickSymbol(args: {
  prevClose: number;
  peak: number;
  thresholdPct: number;
  baseSymbol: string;
  leverSymbol: string;
}): DcaSymbolPick {
  const ratio = drawdownRatio(args.prevClose, args.peak);
  // 부동소수점 오차 보정: 90/100-1은 수학적으로 -0.1이지만 실제로는
  // -0.09999999999999998이 나와 정확한 경계값(예: threshold 10%)이 false negative가
  // 될 수 있다. epsilon은 이 오차(~1e-17)보다 훨씬 크고, 표시 반올림 경계 케이스
  // (예: -9.996% vs -10%, 차이 ~4e-5)보다는 훨씬 작게 잡아 두 상황을 구분한다.
  const leveraged = ratio <= -args.thresholdPct / 100 + 1e-9;
  return {
    symbol: leveraged ? args.leverSymbol : args.baseSymbol,
    leveraged,
    drawdownPct: Math.round(ratio * 10000) / 100,
  };
}

/** 계좌 생성 시 peak 시딩용 — 일봉 중 최고 종가(동일가면 가장 이른 날짜). */
export function seedPeak(
  candles: Array<{ date: string; close: number }>,
): { price: number; date: string } | null {
  let best: { price: number; date: string } | null = null;
  for (const c of candles) {
    if (!Number.isFinite(c.close) || c.close <= 0) continue;
    if (best == null || c.close > best.price) best = { price: c.close, date: c.date };
  }
  return best;
}
