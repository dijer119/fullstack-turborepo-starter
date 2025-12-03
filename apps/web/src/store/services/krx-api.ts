import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export interface SafetyMarginResult {
  code: string;
  name: string;
  current_price: number | null;
  intrinsic_value: number | null;
  safety_margin: number | null;
  treasury_ratio: number;
  dividend_yield: number | null;
  last_updated: string;
}

export interface SafetyMarginsResponse {
  total: number;
  calculated: number;
  positive: number;
  results: SafetyMarginResult[];
  message?: string;
}

export interface TopSafetyMarginsResponse {
  total: number;
  results: SafetyMarginResult[];
}

export const krxApi = createApi({
  reducerPath: 'krxApi',
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  }),
  tagTypes: ['SafetyMargins'],
  endpoints: (builder) => ({
    // 전체 안전마진 결과 조회
    getAllSafetyMargins: builder.query<SafetyMarginsResponse, void>({
      query: () => '/krx/safety-margins',
      providesTags: ['SafetyMargins'],
    }),

    // 상위 안전마진 종목 조회
    getTopSafetyMargins: builder.query<TopSafetyMarginsResponse, void>({
      query: () => '/krx/safety-margins/top',
      providesTags: ['SafetyMargins'],
    }),

    // KRX 종목 데이터 업데이트
    updateKrxStocks: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: '/krx/update-stocks',
        method: 'POST',
      }),
    }),

    // 전체 종목 안전마진 계산
    calculateSafetyMargins: builder.mutation<{
      message: string;
      total: number;
      calculated: number;
      positive: number;
    }, void>({
      query: () => ({
        url: '/krx/calculate-safety-margins',
        method: 'POST',
      }),
      invalidatesTags: ['SafetyMargins'],
    }),
  }),
});

export const {
  useGetAllSafetyMarginsQuery,
  useGetTopSafetyMarginsQuery,
  useUpdateKrxStocksMutation,
  useCalculateSafetyMarginsMutation,
} = krxApi;

