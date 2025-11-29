import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const api = createApi({
  reducerPath: "baseApi",
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
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
