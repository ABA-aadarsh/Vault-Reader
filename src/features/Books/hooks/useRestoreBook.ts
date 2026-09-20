"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDb } from "@/data/dexie";
import { restoreBook } from "../data/books";

export function useRestoreBook() {
  const db = useDb();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (bookId: string) => restoreBook(db, bookId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["cloudBooks"] });
      qc.invalidateQueries({ queryKey: ["deletedBooks"] });
    },
  });
}

