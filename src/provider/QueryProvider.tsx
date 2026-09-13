"use client"
import {
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'

export default function QueryProvider(
  { children }: { children: React.ReactNode }
) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}