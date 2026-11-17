"use client";

import { useQuery } from "@tanstack/react-query";
import { useDb } from "@/data/dexie";
import { queryClient } from "@/provider/queryClient";
import type { ReadingState } from "@/data/domain";
import { listReadingStates } from "../data/readingState";

const READING_STATES_KEY = ["readingStates"];

export function useReadingStates() {
  const db = useDb();
  return useQuery<ReadingState[]>({
    queryKey: READING_STATES_KEY,
    queryFn: () => listReadingStates(db),
    // The global defaults never refetch on mount; the sidebar needs fresh
    // progress each time the user comes back from the reader.
    staleTime: 0,
    refetchOnMount: true,
  });
}

export function invalidateReadingStates() {
  return queryClient.invalidateQueries({ queryKey: READING_STATES_KEY });
}
