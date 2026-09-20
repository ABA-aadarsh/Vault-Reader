"use client";

import { useQuery } from "@tanstack/react-query";
import { useDb } from "@/data/dexie";
import { listDeletedBooks } from "../data/books";
import type { Book } from "@/data/domain";

export function useRecentlyDeleted() {
  const db = useDb();
  return useQuery<Book[]>({
    queryKey: ["deletedBooks"],
    queryFn: () => listDeletedBooks(db),
  });
}

