import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const api = createApi({
  reducerPath: "baseApi",
  baseQuery: fetchBaseQuery({
    // 브라우저에서는 상대 경로 사용 (Next.js 프록시 통해 연결)
    // SSR에서는 절대 경로 사용
    baseUrl: typeof window === 'undefined' 
      ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001")
      : "/api",
  }),
  tagTypes: [],
  endpoints: (builder) => ({
    hello: builder.query<{ message: string }, void>({
      query: () => ({
        url: "/",
      }),
    }),
  }),
});

export const { useHelloQuery } = api;
