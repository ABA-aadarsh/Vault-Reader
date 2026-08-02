import type { BookVaultDexie } from "./dexie/schema";
import { readingStateToDomain } from "./mappers";
import type { ReadingState } from "./domain";

// Throttle interval: skip writes if less than 2s since last update
const THROTTLE_MS = 2000;

/**
 * Get reading state for a book.
 */
export async function getReadingState(
  db: BookVaultDexie,
  bookId: string,
): Promise<ReadingState | undefined> {
  const entry = await db.readingState.get(bookId);
  return entry ? readingStateToDomain(entry) : undefined;
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

  if (existing) {
    await db.readingState.where("bookId").equals(bookId).modify({
      page,
      percent,
      updatedAt: now,
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
      syncStatus: book?.syncScope === "cloud" ? "pending" : "synced",
    });
  }
}
