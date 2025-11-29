import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface MaddingStockMessage {
  id: number;
  messageId: number;
  rawText: string;
  parsed: {
    stockName: string | null;
    price: string | null;
    changePercent: string | null;
    keywords: string[];
    symbols: string[];
    urls: string[];
  };
  timestamp: string;
  channelUsername: string;
  createdAt?: string;
}

export interface MessagesResponse {
  total: number;
  limit: number;
  offset: number;
  messages: MaddingStockMessage[];
}

export interface SearchResponse {
  total: number;
  keyword: string;
  messages: MaddingStockMessage[];
}

export interface StatsResponse {
  totalMessages: number;
  stocksMentioned: string[];
  topKeywords: Array<{ keyword: string; count: number }>;
  recentMessages: Array<{
    id: number;
    messageId: number;
    rawText: string;
    stockName: string | null;
    timestamp: string;
  }>;
}

export const maddingstockApi = createApi({
  reducerPath: "maddingstockApi",
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  }),
  tagTypes: ["MaddingStockMessages", "MaddingStockStats"],
  endpoints: (builder) => ({
    getMaddingStockMessages: builder.query<MessagesResponse, { limit?: number; offset?: number }>({
      query: ({ limit = 20, offset = 0 }) => ({
        url: `/telegram/maddingstock/messages`,
        params: { limit, offset },
      }),
      providesTags: ["MaddingStockMessages"],
    }),
    searchMaddingStockMessages: builder.query<SearchResponse, { keyword: string; limit?: number }>({
      query: ({ keyword, limit = 20 }) => ({
        url: `/telegram/maddingstock/search`,
        params: { keyword, limit },
      }),
    }),
    getMaddingStockStats: builder.query<StatsResponse, void>({
      query: () => "/telegram/maddingstock/stats",
      providesTags: ["MaddingStockStats"],
    }),
  }),
});

export const {
  useGetMaddingStockMessagesQuery,
  useSearchMaddingStockMessagesQuery,
  useGetMaddingStockStatsQuery,
  useLazySearchMaddingStockMessagesQuery,
} = maddingstockApi;

