import { createApi } from '@reduxjs/toolkit/query/react';
import { graphqlBaseQuery } from '../graphqlBaseQuery';
import { gql } from 'graphql-request';

export interface KeyFinancials {
    revenue: string;
    operatingIncome: string;
}

export interface NewsItem {
    title: string;
    source: string;
    link: string;
}

export interface StockAnalysis {
    symbol: string;
    currentPrice: string;
    marketStatus: string;
    buffettOpinion: string;
    keyFinancials: KeyFinancials;
    news: NewsItem[];
}

export const stockApi = createApi({
    reducerPath: 'stockApi',
    baseQuery: graphqlBaseQuery({
        baseUrl: process.env.NEXT_PUBLIC_API_URL
            ? `${process.env.NEXT_PUBLIC_API_URL}/graphql`
            : 'http://localhost:3001/graphql',
    }),
    endpoints: (builder) => ({
        analyzeStock: builder.mutation<StockAnalysis, { symbol: string }>({
            query: ({ symbol }) => ({
                document: gql`
          mutation AnalyzeStock($symbol: String!) {
            analyzeStock(symbol: $symbol) {
              symbol
              currentPrice
              marketStatus
              buffettOpinion
              keyFinancials {
                revenue
                operatingIncome
              }
              news {
                title
                source
                link
              }
            }
          }
        `,
                variables: { symbol },
            }),
            transformResponse: (response: { analyzeStock: StockAnalysis }) =>
                response.analyzeStock,
        }),
    }),
});

export const { useAnalyzeStockMutation } = stockApi;
