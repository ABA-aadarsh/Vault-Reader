"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDb } from "@/data/dexie";
import { createBook, type CreateBookParams } from "../data/books";

export function useCreateBook() {
  const db = useDb();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateBookParams) => createBook(db, params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["cloudBooks"] });
    },
  });
}

