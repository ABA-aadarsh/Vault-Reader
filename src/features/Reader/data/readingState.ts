import type { BookVaultDexie } from "@/data/dexie/schema";
import { enqueue } from "@/features/Sync/data/outbox";
import { getProgressSyncEnabled } from "@/features/Sync/data/settings";
import { scheduleSync } from "@/lib/sync-scheduler";
import type { ReadingState } from "@/data/domain";

// Position changes are coalesced: at most one write per interval, always
// persisting the most recent page (trailing, never dropped).
const WRITE_INTERVAL_MS = 2000;

interface PendingProgress {
  db: BookVaultDexie;
  bookId: string;
  page: number;
  totalPages: number;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  write: Promise<void> | null;
}

const pendingProgress = new Map<string, PendingProgress>();

/**
 * Get reading state for a book.
 */
export async function getReadingState(
  db: BookVaultDexie,
  bookId: string,
): Promise<ReadingState | undefined> {
  return db.readingState.get(bookId);
}

async function writeProgress(
  db: BookVaultDexie,
  bookId: string,
  page: number,
  totalPages: number,
): Promise<void> {
  const existing = await db.readingState.get(bookId);
  const now = Date.now();
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

function scheduleFlush(state: PendingProgress): void {
  if (state.timer || state.write || !state.dirty) return;

  state.timer = setTimeout(() => {
    state.timer = null;
    void flushProgress(state);
  }, WRITE_INTERVAL_MS);
}

async function flushProgress(state: PendingProgress): Promise<void> {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  // Wait for an in-flight write before deciding what is still pending.
  if (state.write) {
    await state.write;
  }

  if (!state.dirty) return;

  const page = state.page;
  const totalPages = state.totalPages;
  state.dirty = false;

  const write = writeProgress(state.db, state.bookId, page, totalPages)
    .catch((error: unknown) => {
      console.warn("Could not save reading position:", error);
    })
    .finally(() => {
      state.write = null;
      // A change that arrived while the write was in flight must not be lost.
      scheduleFlush(state);
    });

  state.write = write;
  await write;

  // Flushing should persist the latest position, even if it moved mid-write.
  if (state.dirty) {
    await flushProgress(state);
  }
}

/**
 * Update reading position for a book. Writes the latest position at most once
 * per interval (leading write on first change, trailing write for the rest)
 * so fast page turns do not flood the outbox and the final page is always
 * persisted.
 */
export function setPage(
  db: BookVaultDexie,
  bookId: string,
  page: number,
  totalPages: number,
): Promise<void> {
  const state = pendingProgress.get(bookId);
  const isNewBook = !state;

  const next: PendingProgress = state ?? {
    db,
    bookId,
    page,
    totalPages,
    dirty: false,
    timer: null,
    write: null,
  };

  next.db = db;
  next.page = page;
  next.totalPages = totalPages;
  next.dirty = true;
  pendingProgress.set(bookId, next);

  if (isNewBook) {
    // Persist the first change immediately so a reading position exists as
    // soon as the reader opens, then throttle the rest.
    void flushProgress(next);
  } else {
    scheduleFlush(next);
  }

  return Promise.resolve();
}

/**
 * Write any queued reading positions right away. Called when the reader
 * unmounts so navigating away never loses the last page.
 */
export async function flushReadingState(): Promise<void> {
  await Promise.all(
    Array.from(pendingProgress.values()).map((state) => flushProgress(state)),
  );
}
