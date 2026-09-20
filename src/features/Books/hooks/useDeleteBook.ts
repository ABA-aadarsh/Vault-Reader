"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDb } from "@/data/dexie";
import { softDeleteBook, hardPurgeLocal } from "../data/books";

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
      qc.invalidateQueries({ queryKey: ["deletedBooks"] });
    },
  });
}

