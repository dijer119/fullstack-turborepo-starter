/** 종목 상세 퀀트 대시보드 지표 계산 — 모두 순수 함수. */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 수동 ROE 우선(NaN/Infinity는 무시하고 auto 폴백), 없으면 PBR/PER×100 (단위 %). StockDetailHeader·탐색기와 공유. */
export function resolveRoe(
  manualRoe: number | null,
  per: number | null,
  pbr: number | null,
): number | null {
  if (isFiniteNumber(manualRoe)) return manualRoe;
  if (isFiniteNumber(per) && isFiniteNumber(pbr) && per > 0 && pbr > 0) {
    return (pbr / per) * 100;
  }
  return null;
}

/** 52주 저가 대비 현재가 위치(0~100%). 범위 밖 값은 클램프. */
export function week52Position(
  current: number | null,
  low: number | null,
  high: number | null,
): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(low) || !isFiniteNumber(high)) {
    return null;
  }
  if (!(high > low)) return null;
  const pct = ((current - low) / (high - low)) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** 국채시가배당률 = 예상 시가배당률 ÷ 국채금리 (배). */
export function bondDividendRatio(
  divYieldPct: number | null,
  treasuryYieldPct: number | null,
): number | null {
  if (
    !isFiniteNumber(divYieldPct) ||
    !isFiniteNumber(treasuryYieldPct) ||
    treasuryYieldPct <= 0
  ) {
    return null;
  }
  return divYieldPct / treasuryYieldPct;
}

/**
 * 서준식 채권형 주식 기대수익률(연복리 %).
 * BPS = 현재가÷PBR, 10년 후 BPS = BPS×(1+ROE)^10,
 * 기대수익률 = (10년 후 BPS ÷ 현재가)^(1/10) − 1 = ((1+ROE)^10 ÷ PBR)^(1/10) − 1
 */
export function seoJunsikReturn(
  pbr: number | null,
  roePct: number | null,
): number | null {
  if (!isFiniteNumber(pbr) || pbr <= 0 || !isFiniteNumber(roePct)) return null;
  const roe = roePct / 100;
  if (roe <= -1) return null;
  const ratio = Math.pow(1 + roe, 10) / pbr;
  if (ratio <= 0) return null;
  return (Math.pow(ratio, 1 / 10) - 1) * 100;
}

/** 캐시 신선도 판정. */
export function isFresh(fetchedAt: Date, now: Date, ttlMs: number): boolean {
  return now.getTime() - fetchedAt.getTime() < ttlMs;
}

const REPRT_LABELS: Record<string, string> = {
  "11013": "1Q",
  "11012": "2Q",
  "11014": "3Q",
  "11011": "FY",
};

/** DART reprt_code → 분기 라벨. */
export function reprtLabel(code: string): string {
  return REPRT_LABELS[code] ?? code;
}
