"use client"
import { useQuery } from "@tanstack/react-query"
import BooksAPI from "@/features/supabase/books/book.service"
import type { BookEntry } from "@/lib/dexie/types"

export const useCloudBookList = () => {
    return useQuery<BookEntry[]>(
        {
            queryKey: ['cloudBooks'],
            queryFn: BooksAPI.listCloudBooks
        }
    )
}
