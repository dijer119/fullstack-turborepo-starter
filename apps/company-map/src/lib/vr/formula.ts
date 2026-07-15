// VR 5.0 V 갱신·밴드 순수 함수.
// 출처: docs/superpowers/specs/2026-07-15-vr-5.0-design.html §4,
//       실력공식 = 라오어 62주차 영상 (V₂ = V₁ + Pool/G + (E−V₁)/(2√G) ± 적립금)
export type VrFormula = "basic" | "skill";

export interface NextVInput {
  v: number;            // 직전 V
  pool: number;         // Pool (USD)
  g: number;            // G 기울기
  evalAmount: number;   // E = 마지막 평가금 (basic에서는 미사용)
  contribution: number; // 이번 사이클 적립금 (거치식 0)
  formula: VrFormula;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function nextV(i: NextVInput): number {
  const base = i.v + i.pool / i.g + i.contribution;
  if (i.formula === "basic") return round2(base);
  return round2(base + (i.evalAmount - i.v) / (2 * Math.sqrt(i.g)));
}

export interface Band {
  min: number; // 매수선 = V × (1 − p%)
  max: number; // 매도선 = V × (1 + p%)
}

export function band(v: number, bandPct: number): Band {
  return {
    min: round2(v * (1 - bandPct / 100)),
    max: round2(v * (1 + bandPct / 100)),
  };
}
