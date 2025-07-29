"use client"
import { useQuery } from "@tanstack/react-query"
import  BooksAPI  from "@/features/supabase/books/book.service"
import { MetadataEntry } from "@/lib/dexie"

export const useLocalBookList = () => {
    
    return useQuery<MetadataEntry[]>(
        {
            queryKey: ['localBooks'],
            queryFn: BooksAPI.listLocalBooks
        }
    )
}