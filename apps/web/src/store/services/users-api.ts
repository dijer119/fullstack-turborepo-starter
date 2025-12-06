import { createApi } from '@reduxjs/toolkit/query/react';
import { graphqlBaseQuery } from '../graphqlBaseQuery';
import { gql } from 'graphql-request';

export interface User {
  id: number;
  email: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  name?: string;
}

export interface UpdateUserInput {
  id: number;
  email?: string;
  name?: string;
}

export const usersApi = createApi({
  reducerPath: 'usersApi',
  baseQuery: graphqlBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL
      ? `${process.env.NEXT_PUBLIC_API_URL}/graphql`
      : "http://localhost:3001/graphql",
  }),
  tagTypes: ['Users'],
  endpoints: (builder) => ({
    getUsers: builder.query<User[], void>({
      query: () => ({
        document: gql`
          query GetUsers {
            users {
              id
              email
              name
              createdAt
              updatedAt
            }
          }
        `,
      }),
      transformResponse: (response: { users: User[] }) => response.users,
      providesTags: ['Users'],
    }),
    getUsersCount: builder.query<number, void>({
      query: () => ({
        document: gql`
            query GetUsersCount {
              usersCount
            }
          `,
      }),
      transformResponse: (response: { usersCount: number }) => response.usersCount,
      providesTags: ['Users'],
    }),
    createUser: builder.mutation<User, CreateUserInput>({
      query: (input) => ({
        document: gql`
          mutation CreateUser($input: CreateUserInput!) {
            createUser(input: $input) {
              id
              email
              name
              createdAt
              updatedAt
            }
          }
        `,
        variables: { input },
      }),
      transformResponse: (response: { createUser: User }) => response.createUser,
      invalidatesTags: ['Users'],
    }),
    updateUser: builder.mutation<User, UpdateUserInput>({
      query: (input) => ({
        document: gql`
          mutation UpdateUser($input: UpdateUserInput!) {
            updateUser(input: $input) {
              id
              email
              name
              createdAt
              updatedAt
            }
          }
        `,
        variables: { input },
      }),
      transformResponse: (response: { updateUser: User }) => response.updateUser,
      invalidatesTags: ['Users'],
    }),
    deleteUser: builder.mutation<User, { id: number }>({
      query: ({ id }) => ({
        document: gql`
          mutation DeleteUser($id: Int!) {
            deleteUser(id: $id) {
              id
              email
              name
            }
          }
        `,
        variables: { id },
      }),
      transformResponse: (response: { deleteUser: User }) => response.deleteUser,
      invalidatesTags: ['Users'],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetUsersCountQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} = usersApi;
