"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDb } from "@/lib/dexie/db";
import { getFailedOutbox, retryOutboxEntry, discardOutboxEntry } from "@/lib/outbox";
import { engine } from "@/features/Sync/SyncEngine";
import type { OutboxEntry } from "@/lib/dexie/types";

export function useFailedOutbox() {
  const db = useDb();
  return useQuery<OutboxEntry[]>({
    queryKey: ["failedOutbox"],
    queryFn: () => getFailedOutbox(db),
  });
}

export function useRetryOutbox() {
  const db = useDb();
  const qc = useQueryClient();

  const retry = async (entryId: number) => {
    await retryOutboxEntry(db, entryId);
    await qc.invalidateQueries({ queryKey: ["failedOutbox"] });
    engine.scheduleSync();
  };

  return { retry };
}

export function useDiscardOutbox() {
  const db = useDb();
  const qc = useQueryClient();

  const discard = async (entry: OutboxEntry) => {
    await discardOutboxEntry(db, entry.id!);

    // If a cloud book's mutation was discarded, reset its syncStatus
    // so it doesn't show a phantom "pending" forever.
    if (entry.entityType === "book") {
      await db.books.where("id").equals(entry.entityId).modify({
        syncStatus: "synced",
      });
    } else if (entry.entityType === "note") {
      await db.notes.where("bookId").equals(entry.entityId).modify({
        syncStatus: "synced",
      });
    } else if (entry.entityType === "readingState") {
      await db.readingState.update(entry.entityId, {
        syncStatus: "synced",
      });
    }

    await qc.invalidateQueries({ queryKey: ["failedOutbox"] });
  };

  return { discard };
}