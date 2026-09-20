"use client";

import { useQuery } from "@tanstack/react-query";
import { useDb } from "@/data/dexie";
import { getNote } from "../data/notes";
import { queryClient } from "@/provider/queryClient";
import type { Note } from "@/data/domain";

export function useNote(bookId: string) {
  const db = useDb();
  return useQuery<Note | undefined>({
    queryKey: ["note", bookId],
    queryFn: () => getNote(db, bookId),
    enabled: !!bookId,
  });
}

export async function invalidateNote(bookId: string) {
  await queryClient.invalidateQueries({ queryKey: ["note", bookId] });
}
