export type DisclosureCategory = "실적" | "배당" | "지분" | "계약";

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
