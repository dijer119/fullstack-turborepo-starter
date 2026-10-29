// KRX PDF 파서·diff·UI 공용 타입
export interface Holding {
  constituentCode: string;
  constituentName: string;
  weight: number | null; // 비중 %
  shares: number | null; // 주식수/계약수
  amount: number | null; // 평가금액(원)
}

export type HoldingStatus = "신규" | "유지" | "이탈"; // Top10 기준

// Naver etfAnalysis의 기간별 수익률(%). period는 Naver 코드 그대로(D1·W1·M1·M3·M6·YTD·Y1·Y3·Y5·Y10).
// 3·5·10년이 누적인지 연환산인지 응답에 표시가 없어 값을 해석하지 않고 그대로 보관한다.
export interface EtfPeriodReturn {
  period: string;
  value: number;
}

// Naver etfAnalysis의 분배금 요약. 회차별 내역은 응답에 없다.
export interface EtfDividend {
  perShareTtm: number | null;    // 최근 12개월 1주당 분배금 합계(원)
  yieldTtm: number | null;       // 최근 12개월 분배율(%)
  countThisYear: number | null;  // 올해 지급 횟수
  monthsThisYear: number[];      // 올해 지급월
}

export interface EtfReturns {
  referenceDate: string | null; // 수익률 기준일 YYYYMMDD (스냅샷 trdDd보다 늦을 수 있음)
  market: EtfPeriodReturn[]; // 시장가 기준
  nav: EtfPeriodReturn[];    // NAV 기준
}

export interface HoldingChange extends Holding {
  status: HoldingStatus;
  weightDelta: number | null; // %p (최신 - 직전)
  sharesDelta: number | null;
}
