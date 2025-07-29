"use client"
import { useQuery } from "@tanstack/react-query"
import  BooksAPI  from "@/features/supabase/books/book.service"
import { MetadataEntry } from "@/lib/dexie"

export const useCloudBookList = () => {
    
    return useQuery<MetadataEntry[]>(
        {
            queryKey: ['cloudBooks'],
            queryFn: BooksAPI.listCloudBooks
        }
    )
}