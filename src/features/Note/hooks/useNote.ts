"use client";

import { useQuery } from "@tanstack/react-query";
import { useDb } from "@/lib/dexie/db";
import { getNote } from "@/lib/notes";
import { queryClient } from "@/lib/queryClient";
import type { Note } from "@/lib/domain";

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