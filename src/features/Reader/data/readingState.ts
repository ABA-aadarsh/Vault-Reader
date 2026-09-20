import type { BookVaultDexie } from "@/data/dexie/schema";
import { enqueue } from "@/features/Sync/data/outbox";
import { getProgressSyncEnabled } from "@/features/Sync/data/settings";
import { scheduleSync } from "@/lib/sync-scheduler";
import type { ReadingState } from "@/data/domain";

// Throttle interval: skip writes if less than 2s since last update
const THROTTLE_MS = 2000;

/**
 * Get reading state for a book.
 */
export async function getReadingState(
  db: BookVaultDexie,
  bookId: string,
): Promise<ReadingState | undefined> {
  return db.readingState.get(bookId);
}

/**
 * Update reading position for a book. Throttled to avoid flooding
 * the outbox with frequent page changes. Calculates percent from
 * page/totalPages and upserts the reading state.
 */
export async function setPage(
  db: BookVaultDexie,
  bookId: string,
  page: number,
  totalPages: number,
): Promise<void> {
  const existing = await db.readingState.get(bookId);
  const now = Date.now();

  // Throttle: skip if less than 2s since last update
  if (existing && now - existing.updatedAt < THROTTLE_MS) {
    return;
  }

  const percent = totalPages > 0 ? Math.round((page / totalPages) * 100) : 0;
  const book = await db.books.get(bookId);
  const progressSyncEnabled = book?.syncScope === "cloud" && (await getProgressSyncEnabled(db));
  const status: "pending" | "synced" = progressSyncEnabled ? "pending" : "synced";

  if (existing) {
    await db.readingState.where("bookId").equals(bookId).modify({
      page,
      percent,
      updatedAt: now,
      syncStatus: status,
    });
  } else {
    await db.readingState.add({
      bookId,
      page,
      percent,
      revision: 0,
      baseRevision: 0,
      updatedAt: now,
      deviceId: "",
      syncStatus: status,
    });
  }

  // If progress sync is enabled and the book is cloud-scoped, enqueue
  // an outbox upsert so the engine pushes the new position.
  if (progressSyncEnabled) {
    await enqueue(db, {
      entityType: "readingState",
      entityId: bookId,
      op: "upsert",
      payload: { page, percent },
      baseRevision: existing?.baseRevision ?? 0,
    });
    scheduleSync();
  }
}

