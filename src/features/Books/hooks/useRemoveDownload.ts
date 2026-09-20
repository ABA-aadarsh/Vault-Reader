"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDb } from "@/data/dexie";
import { removeDownload } from "../data/books";

export function useRemoveDownload() {
  const db = useDb();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (bookId: string) => removeDownload(db, bookId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["cloudBooks"] });
    },
  });
}

