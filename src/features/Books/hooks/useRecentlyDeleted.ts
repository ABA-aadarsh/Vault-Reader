"use client";

import { useQuery } from "@tanstack/react-query";
import { useDb } from "@/lib/dexie/db";
import { listDeletedBooks } from "@/lib/books";
import type { Book } from "@/lib/domain";

export function useRecentlyDeleted() {
  const db = useDb();
  return useQuery<Book[]>({
    queryKey: ["deletedBooks"],
    queryFn: () => listDeletedBooks(db),
  });
}
