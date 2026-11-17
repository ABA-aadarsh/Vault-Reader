import type { BookVaultDexie } from "@/data/dexie/schema";
import type { Note } from "@/data/domain";
import { enqueue } from "@/features/Sync/data/outbox";
import { scheduleSync } from "@/lib/sync-scheduler";

/**
 * Get a note by bookId (1:1 relationship with book).
 *
 * Returns `null` when the book has no note yet: React Query treats an
 * `undefined` query result as a contract violation ("Query data cannot be
 * undefined"), and `null` is the documented way to say "no row".
 */
export async function getNote(
  db: BookVaultDexie,
  bookId: string,
): Promise<Note | null> {
  const note = await db.notes.get(bookId);
  // Soft-deleted notes (locally or from another device via pull) must read as
  // absent, otherwise the editor keeps showing a note that was deleted.
  if (!note || note.deletedAt !== null) return null;
  return note;
}

/**
 * Create or update a note for a book.
 * If the note exists, updates body and enqueues outbox if parent book is cloud.
 * If new, inserts with revision 0 and enqueues outbox if cloud.
 */
export async function upsertNote(
  db: BookVaultDexie,
  bookId: string,
  body: string,
): Promise<void> {
  const now = Date.now();
  const existing = await db.notes.get(bookId);
  const book = await db.books.get(bookId);

  if (existing && existing.syncStatus === "conflict") {
    throw new Error("Note has unresolved conflict — resolve it first");
  }

  if (existing) {
    // Update existing note
    await db.notes.where("bookId").equals(bookId).modify({
      body,
      updatedAt: now,
      // Editing a soft-deleted note resurrects it instead of leaving a tombstone.
      deletedAt: null,
      syncStatus: book?.syncScope === "cloud" ? "pending" : "synced",
    });

    // Enqueue outbox for cloud sync
    if (book?.syncScope === "cloud") {
      await enqueue(db, {
        entityType: "note",
        entityId: bookId,
        op: "upsert",
        payload: { body },
        baseRevision: existing.baseRevision,
        // Notes have no separate restore flow: editing a soft-deleted note
        // replaces its pending delete so it comes back on the server too.
        allowUpsertAfterDelete: true,
      });
      scheduleSync();
    }
  } else {
    // Create new note
    await db.notes.add({
      bookId,
      body,
      revision: 0,
      baseRevision: 0,
      deletedAt: null,
      syncStatus: book?.syncScope === "cloud" ? "pending" : "synced",
      updatedAt: now,
      updatedByDeviceId: "",
      baseSnapshot: { body },
    });

    // Enqueue outbox for cloud sync
    if (book?.syncScope === "cloud") {
      await enqueue(db, {
        entityType: "note",
        entityId: bookId,
        op: "upsert",
        payload: { body },
        baseRevision: 0,
        allowUpsertAfterDelete: true,
      });
      scheduleSync();
    }
  }
}

/**
 * Delete a note. Cloud books get soft-deleted (deletedAt) with outbox entry.
 * Local books are hard-deleted immediately.
 */
export async function deleteNote(
  db: BookVaultDexie,
  bookId: string,
): Promise<void> {
  const note = await db.notes.get(bookId);
  if (!note) return;
  if (note.syncStatus === "conflict") throw new Error("Note has unresolved conflict — resolve it first");

  const book = await db.books.get(bookId);
  const now = Date.now();

  if (book?.syncScope === "cloud") {
    // Soft delete with outbox entry
    await db.notes.where("bookId").equals(bookId).modify({
      deletedAt: now,
      syncStatus: "pending",
      updatedAt: now,
    });

    await enqueue(db, {
      entityType: "note",
      entityId: bookId,
      op: "delete",
      payload: {},
      baseRevision: note.baseRevision,
    });
    scheduleSync();
  } else {
    // Hard delete for local-only books
    await db.notes.where("bookId").equals(bookId).delete();
  }
}

