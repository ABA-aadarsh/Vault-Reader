"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDb } from "@/lib/dexie/db";
import { softDeleteBook, hardPurgeLocal } from "@/lib/books";

export function useDeleteBook() {
  const db = useDb();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      bookId,
      hard,
    }: {
      bookId: string;
      hard?: boolean;
    }) => (hard ? hardPurgeLocal(db, bookId) : softDeleteBook(db, bookId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["cloudBooks"] });
    },
  });
}
