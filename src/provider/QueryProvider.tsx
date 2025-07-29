"use client"
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'

const queryClient = new QueryClient({
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
})

export default function QueryProvider(
  { children }: { children: React.ReactNode }
) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}