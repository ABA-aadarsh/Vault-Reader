"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDb } from "@/lib/dexie/db";
import { updateBook } from "@/lib/books";

export function useUpdateBook() {
  const db = useDb();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      bookId,
      updates,
    }: {
      bookId: string;
      updates: { title?: string; author?: string; tags?: string[]; isFavourite?: boolean };
    }) => updateBook(db, bookId, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books"] });
    },
  });
}
