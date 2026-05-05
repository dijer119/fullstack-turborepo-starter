export interface KrxStockSeed {
  Code: string;
  Name: string;
  Marcap: number;
}

export interface InvestmentQuote {
  quote: string;
  author: string;
  source: string;
  original: string;
}

export interface StockMasterRow {
  code: string;
  name: string;
  marcap: number | null;
  corpCode: string | null;
}

export interface FinancialPeriod {
  PBR: number | null;
  EPS: number | null;
  BPS: number | null;
}

export interface TreasuryStockInfo {
  shares: number;
  ratio: number;
}

export interface AnalyzeStockResult {
  stockName: string;
  currentPrice: number | null;
  intrinsicValue: number | null;
  safetyMargin: number | null;
  treasuryShares: number;
  treasuryRatio: number;
  dividendYield: number | null;
  historicalData: {
    "3년전": FinancialPeriod;
    "2년전": FinancialPeriod;
    "직전년도": FinancialPeriod;
  };
}

export interface TopStockRow {
  code: string;
  name: string;
  currentPrice: number | null;
  intrinsicValue: number | null;
  safetyMargin: number | null;
  treasuryRatio: number | null;
  dividendYield: number | null;
  lastUpdated: string;
  ncavRatio: number | null;
}

export interface NcavRow {
  code: string;
  name: string;
  ncav: string;
  marcap: string;
  ncavRatio: number | null;
  currentAssets: string;
  totalLiabilities: string;
  totalAssets: string;
  totalEquity: string;
  bsnsYear: number;
  ncavPositive: boolean;
  dividendYield: number | null;
  lastUpdated: string;
}

export interface DartFinancialResult {
  bsnsYear: number;
  currentAssets: bigint;
  totalLiabilities: bigint;
  totalAssets: bigint;
  totalEquity: bigint;
}
