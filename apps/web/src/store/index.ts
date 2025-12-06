import { configureStore } from "@reduxjs/toolkit";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";

import { api } from "./services/api";
import { maddingstockApi } from "./services/maddingstock-api";
import { intrinsicValueApi } from "./services/intrinsic-value-api";
import { krxApi } from "./services/krx-api";
import { usersApi } from "./services/users-api";

export function makeStore() {
  return configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      [maddingstockApi.reducerPath]: maddingstockApi.reducer,
      [intrinsicValueApi.reducerPath]: intrinsicValueApi.reducer,
      [krxApi.reducerPath]: krxApi.reducer,
      [usersApi.reducerPath]: usersApi.reducer,
    },

    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(
        api.middleware,
        maddingstockApi.middleware,
        intrinsicValueApi.middleware,
        krxApi.middleware,
        usersApi.middleware
      ),
  });
}

const store = makeStore();

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();

export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;
