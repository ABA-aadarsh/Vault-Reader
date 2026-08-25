"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDb } from "@/lib/dexie/db";
import { promoteToCloud } from "@/lib/books";

export function usePromoteBook() {
  const db = useDb();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (bookId: string) => promoteToCloud(db, bookId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["cloudBooks"] });
      qc.invalidateQueries({ queryKey: ["deletedBooks"] });
    },
  });
}
