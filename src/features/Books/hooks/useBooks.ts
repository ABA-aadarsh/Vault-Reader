"use client";

import { useQuery } from "@tanstack/react-query";
import { useDb } from "@/data/dexie";
import { listBooks, listCloudBooks } from "../data/books";
import type { Book } from "@/data/domain";

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

