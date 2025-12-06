import { Action, PayloadAction } from '@reduxjs/toolkit';
import { BaseQueryFn } from '@reduxjs/toolkit/query';
import { GraphQLClient, ClientError } from 'graphql-request';

// Define the arguments for the base query
// This matches the signature expected by RTK Query's baseQuery
export const graphqlBaseQuery =
    ({ baseUrl }: { baseUrl: string }): BaseQueryFn<
        { document: string; variables?: any },
        unknown,
        unknown
    > =>
        async ({ document, variables }) => {
            try {
                const url = baseUrl.startsWith('/') && typeof window !== 'undefined'
                    ? `${window.location.origin}${baseUrl}`
                    : baseUrl;
                const client = new GraphQLClient(url);
                const result = await client.request(document, variables);
                return { data: result };
            } catch (error) {
                if (error instanceof ClientError) {
                    return { error: { status: error.response.status, data: error.response.data } };
                }
                return { error: { status: 500, data: error } };
            }
        };
