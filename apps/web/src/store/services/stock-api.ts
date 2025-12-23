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

// Stock 엔티티 타입
export interface Stock {
    id: number;
    code: string;
    isuCd: string;
    name: string;
    market: string;
    marketId: string;
    dept?: string;
    close: number;
    changeCode: string;
    changes: number;
    chagesRatio: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    amount: number;
    marcap: number;
    stocks: number;
    treasuryStocks: number;
    treasuryRatio: number;
    eps?: number;
    bps?: number;
    tenYearValue?: number;
    tenYearMultiple?: number;
    stockValue?: number;
    roe?: number;
    per?: number;
    pbr?: number;
    dividendYield?: number;
    exclude: boolean;
    favorite: boolean;
    tags: string[];
    dataDate: string;
    createdAt: string;
    updatedAt: string;
}

export interface StockListResponse {
    stocks: Stock[];
    total: number;
    skip: number;
    take: number;
}

export interface StockSearchParams {
    skip?: number;
    take?: number;
    market?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    includeExcluded?: boolean;
    onlyFavorite?: boolean;
    minRoe?: number;
    minDividendYield?: number;
    tags?: string[];
}

export interface StockSearchByKeywordParams {
    keyword: string;
    limit?: number;
}

export const stockApi = createApi({
    reducerPath: 'stockApi',
    baseQuery: graphqlBaseQuery({
        baseUrl: process.env.NEXT_PUBLIC_API_URL
            ? `${process.env.NEXT_PUBLIC_API_URL}/graphql`
            : 'http://localhost:3001/graphql',
    }),
    tagTypes: ['Stock'],
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

        // 주식 목록 조회 (페이지네이션)
        getStocks: builder.query<StockListResponse, StockSearchParams>({
            query: (params) => ({
                document: gql`
          query GetStocks($skip: Int, $take: Int, $market: String, $includeExcluded: Boolean, $sortBy: String, $sortOrder: String, $onlyFavorite: Boolean, $minRoe: Int, $minDividendYield: Int, $tags: [String!]) {
            stocks(skip: $skip, take: $take, market: $market, includeExcluded: $includeExcluded, sortBy: $sortBy, sortOrder: $sortOrder, onlyFavorite: $onlyFavorite, minRoe: $minRoe, minDividendYield: $minDividendYield, tags: $tags) {
              stocks {
                id
                code
                name
                market
                close
                changes
                chagesRatio
                volume
                marcap
                eps
                bps
                tenYearValue
                tenYearMultiple
                stockValue
                roe
                per
                pbr
                dividendYield
                exclude
                favorite
                tags
              }
              total
              skip
              take
            }
          }
        `,
                variables: {
                    skip: params.skip || 0,
                    take: params.take || 20,
                    market: params.market,
                    includeExcluded: params.includeExcluded || false,
                    sortBy: params.sortBy || 'stockValue',
                    sortOrder: params.sortOrder || 'desc',
                    onlyFavorite: params.onlyFavorite || false,
                    minRoe: params.minRoe,
                    minDividendYield: params.minDividendYield,
                    tags: params.tags,
                },
            }),
            transformResponse: (response: { stocks: StockListResponse }) => response.stocks,
            providesTags: ['Stock'],
        }),

        // 종목 코드로 단일 주식 조회
        getStockByCode: builder.query<Stock | null, string>({
            query: (code) => ({
                document: gql`
          query GetStock($code: String!) {
            stock(code: $code) {
              id
              code
              isuCd
              name
              market
              marketId
              dept
              close
              changeCode
              changes
              chagesRatio
              open
              high
              low
              volume
              amount
              marcap
              stocks
              treasuryStocks
              treasuryRatio
              eps
              bps
              tenYearValue
              tenYearMultiple
              stockValue
              roe
              per
              pbr
              dataDate
              createdAt
              updatedAt
            }
          }
        `,
                variables: { code },
            }),
            transformResponse: (response: { stock: Stock | null }) => response.stock,
            providesTags: (_result, _error, code) => [{ type: 'Stock', id: code }],
        }),

        // 키워드로 주식 검색
        searchStocks: builder.query<Stock[], StockSearchByKeywordParams>({
            query: (params) => ({
                document: gql`
          query SearchStocks($keyword: String!, $limit: Int) {
            searchStocks(keyword: $keyword, limit: $limit) {
              id
              code
              name
              market
              close
              changes
              chagesRatio
              eps
              bps
              tenYearValue
              tenYearMultiple
              stockValue
              roe
              per
              pbr
              dividendYield
            }
          }
        `,
                variables: {
                    keyword: params.keyword,
                    limit: params.limit || 10,
                },
            }),
            transformResponse: (response: { searchStocks: Stock[] }) => response.searchStocks,
        }),

        // 시장별 주식 개수 조회
        getStockCount: builder.query<number, string | undefined>({
            query: (market) => ({
                document: gql`
          query GetStockCount($market: String) {
            stockCount(market: $market)
          }
        `,
                variables: { market },
            }),
            transformResponse: (response: { stockCount: number }) => response.stockCount,
        }),

        // 모든 태그 목록 조회
        getAllTags: builder.query<string[], void>({
            query: () => ({
                document: gql`
          query GetAllTags {
            allTags
          }
        `,
            }),
            transformResponse: (response: { allTags: string[] }) => response.allTags,
            providesTags: ['Stock'],
        }),

        // 주식 제외 상태 토글
        toggleStockExclude: builder.mutation<Stock, number>({
            query: (id) => ({
                document: gql`
          mutation ToggleStockExclude($id: Int!) {
            toggleStockExclude(id: $id) {
              id
              code
              name
              exclude
            }
          }
        `,
                variables: { id },
            }),
            transformResponse: (response: { toggleStockExclude: Stock }) => response.toggleStockExclude,
            invalidatesTags: ['Stock'],
        }),

        // 주식 좋아요 상태 토글
        toggleStockFavorite: builder.mutation<Stock, number>({
            query: (id) => ({
                document: gql`
          mutation ToggleStockFavorite($id: Int!) {
            toggleStockFavorite(id: $id) {
              id
              code
              name
              favorite
            }
          }
        `,
                variables: { id },
            }),
            transformResponse: (response: { toggleStockFavorite: Stock }) => response.toggleStockFavorite,
            invalidatesTags: ['Stock'],
        }),

        // 주식에 태그 추가
        addTagToStock: builder.mutation<Stock, { id: number; tag: string }>({
            query: ({ id, tag }) => ({
                document: gql`
          mutation AddTagToStock($id: Int!, $tag: String!) {
            addTagToStock(id: $id, tag: $tag) {
              id
              code
              name
              tags
            }
          }
        `,
                variables: { id, tag },
            }),
            transformResponse: (response: { addTagToStock: Stock }) => response.addTagToStock,
            invalidatesTags: ['Stock'],
        }),

        // 주식에서 태그 제거
        removeTagFromStock: builder.mutation<Stock, { id: number; tag: string }>({
            query: ({ id, tag }) => ({
                document: gql`
          mutation RemoveTagFromStock($id: Int!, $tag: String!) {
            removeTagFromStock(id: $id, tag: $tag) {
              id
              code
              name
              tags
            }
          }
        `,
                variables: { id, tag },
            }),
            transformResponse: (response: { removeTagFromStock: Stock }) => response.removeTagFromStock,
            invalidatesTags: ['Stock'],
        }),
    }),
});

export const {
    useAnalyzeStockMutation,
    useGetStocksQuery,
    useGetStockByCodeQuery,
    useSearchStocksQuery,
    useLazySearchStocksQuery,
    useGetStockCountQuery,
    useGetAllTagsQuery,
    useToggleStockExcludeMutation,
    useToggleStockFavoriteMutation,
    useAddTagToStockMutation,
    useRemoveTagFromStockMutation,
} = stockApi;
