export type DisclosureCategory =
  | "실적"
  | "배당"
  | "지분"
  | "계약"
  | "자사주"
  | "사업개요"
  | "매출"
  | "수주";

export interface ContractPayload {
  contractDate: string | null;
  startDate: string | null;
  endDate: string | null;
  contractContent: string | null;
  counterparty: string | null;
  supplyRegion: string | null;
  amount: number | null;
  recentSalesRatio: number | null;
}

export interface ElestockDetail {
  type: "elestock";
  filer: string | null;            // 보고자
  rgistAt: string | null;          // 등기/비등기 임원
  position: string | null;         // 직위
  isMainShareholder: boolean;      // 주요주주 여부
  ownedAfterShares: number | null; // 거래후 소유 주식수
  changeShares: number | null;     // 소유 주식수 변동 (±)
  ownedRatio: number | null;       // 소유비율 %
  changeRatio: number | null;      // 소유비율 변동 %p (±)
}

export interface MajorstockDetail {
  type: "majorstock";
  filer: string | null;
  ownedShares: number | null;
  ownedRatio: number | null;
  changeRatio: number | null;
  reason: string | null;
}

export type OwnershipDetail = ElestockDetail | MajorstockDetail;

export interface OwnershipPayload {
  pblntfDetailTy?: string;
  reportType: "주식대량보유" | "임원·주요주주" | "자기주식" | "기타";
  detail?: OwnershipDetail | null;
}

export interface DividendPayload {
  divPerShare: number | null;
  dividendYieldPct: number | null;
  recordDate: string | null;
  dividendType: "현금" | "주식" | "기타";
}

export type TreasuryAction =
  | "취득"
  | "처분"
  | "소각"
  | "신탁체결"
  | "신탁해지"
  | "기타";

export interface TreasuryPayload {
  action: TreasuryAction;
  ostkShares: number | null; // 대상 보통주 주식수 (취득/처분/소각 예정 주식수)
  amount: number | null; // 금액(원): 취득/처분/소각 예정금액 또는 신탁 계약금액
  startDate: string | null; // 기간 시작 (취득예상/처분예정/계약기간)
  endDate: string | null; // 기간 종료
  purpose: string | null; // 목적
  method: string | null; // 취득/처분 방법 또는 계약/해지 기관
  boardDate: string | null; // 이사회결의일(결정일)
  execDate: string | null; // 실행 예정일 (소각예정일/해지예정일/계약체결예정일)
  totalSharesBefore: number | null; // 소각: 발행주식 총수 (소각 비율 계산용)
  heldOstk: number | null; // (취득/처분/계약/해지) 전 자기주식 보유 보통주
  heldRatio: number | null; // 보유 비율 %
}

export interface SectionPayload {
  html: string;          // sanitize된 섹션 HTML(표/문단)
  sourceRcpNo: string;   // 원본 보고서 rcpNo (DART 링크용)
  reportNm?: string;     // 기준 보고서명 (사업개요/매출)
  period?: string;       // 기준 기간 (수주 분기별, 예 "2026.03")
}
