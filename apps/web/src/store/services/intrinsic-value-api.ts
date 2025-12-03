import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface StockSearchResult {
  code: string;
  name: string;
  market: string;
}

export interface FinancialData {
  year: number;
  eps: number | null;
  bps: number | null;
  roe: number | null;
  per: number | null;
  pbr: number | null;
}

export interface IntrinsicValueResult {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  weightedEps: number;
  latestBps: number;
  basicIntrinsicValue: number;
  treasuryStockRatio: number;
  dividendYield: number | null;
  adjustedIntrinsicValue: number;
  safetyMargin: number;
  financialHistory: FinancialData[];
  calculatedAt: string;
  recommendation: string;
}

export interface CurrentPriceResult {
  price: number;
  name: string;
}

export const intrinsicValueApi = createApi({
  reducerPath: "intrinsicValueApi",
  baseQuery: fetchBaseQuery({
    // 브라우저에서는 상대 경로 사용 (Next.js 프록시 통해 연결)
    // SSR에서는 절대 경로 사용
    baseUrl: typeof window === 'undefined' 
      ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001")
      : "/api",
  }),
  tagTypes: ["IntrinsicValue", "StockSearch"],
  endpoints: (builder) => ({
    // 종목 검색
    searchStock: builder.query<StockSearchResult[], string>({
      query: (keyword) => ({
        url: `/intrinsic-value/search`,
        params: { keyword },
      }),
      providesTags: ["StockSearch"],
    }),

    // 인기 종목 목록
    getPopularStocks: builder.query<StockSearchResult[], void>({
      query: () => `/intrinsic-value/popular`,
    }),

    // 내재가치 계산
    calculateIntrinsicValue: builder.query<IntrinsicValueResult, string>({
      query: (stockCode) => `/intrinsic-value/calculate/${stockCode}`,
      providesTags: (result, error, stockCode) => [
        { type: "IntrinsicValue", id: stockCode },
      ],
    }),

    // 현재가 조회
    getCurrentPrice: builder.query<CurrentPriceResult, string>({
      query: (stockCode) => `/intrinsic-value/price/${stockCode}`,
    }),
  }),
});

export const {
  useSearchStockQuery,
  useLazySearchStockQuery,
  useGetPopularStocksQuery,
  useCalculateIntrinsicValueQuery,
  useLazyCalculateIntrinsicValueQuery,
  useGetCurrentPriceQuery,
  useLazyGetCurrentPriceQuery,
} = intrinsicValueApi;

