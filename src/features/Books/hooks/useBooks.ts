"use client";

import { useQuery } from "@tanstack/react-query";
import { useDb } from "@/lib/dexie/db";
import { listBooks, listCloudBooks } from "@/lib/books";
import type { Book } from "@/lib/domain";

export function useBooks() {
  const db = useDb();
  return useQuery<Book[]>({
    queryKey: ["books"],
    queryFn: () => listBooks(db),
  });
}

export function useCloudBooks() {
  const db = useDb();
  return useQuery<Book[]>({
    queryKey: ["cloudBooks"],
    queryFn: () => listCloudBooks(db),
  });
}
