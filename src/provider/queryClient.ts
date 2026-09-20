"use client";

import { QueryClient } from "@tanstack/react-query";

// Shared singleton so non-React modules (e.g. SyncEngine) can trigger
// cache invalidation after they write directly to Dexie.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: Infinity,
      refetchOnReconnect: true,
      refetchOnMount: false,
    },
    mutations: {
      retry: false,
    },
  },
});
