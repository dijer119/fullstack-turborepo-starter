// KRX PDF 파서·diff·UI 공용 타입
export interface Holding {
  constituentCode: string;
  constituentName: string;
  weight: number | null; // 비중 %
  shares: number | null; // 주식수/계약수
  amount: number | null; // 평가금액(원)
}

export type HoldingStatus = "신규" | "유지" | "이탈"; // Top10 기준

export interface HoldingChange extends Holding {
  status: HoldingStatus;
  weightDelta: number | null; // %p (최신 - 직전)
  sharesDelta: number | null;
}
