import type { BookVaultDexie } from "./dexie/schema";
import { noteToDomain } from "./mappers";
import type { Note } from "./domain";
import { enqueue } from "./outbox";
import { engine } from "@/features/sync/SyncEngine";

/**
 * Get a note by bookId (1:1 relationship with book).
 */
export async function getNote(
  db: BookVaultDexie,
  bookId: string,
): Promise<Note | undefined> {
  const entry = await db.notes.get(bookId);
  return entry ? noteToDomain(entry) : undefined;
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

  if (existing) {
    // Update existing note
    await db.notes.where("bookId").equals(bookId).modify({
      body,
      updatedAt: now,
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
      });
      engine.scheduleSync();
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
    });

    // Enqueue outbox for cloud sync
    if (book?.syncScope === "cloud") {
      await enqueue(db, {
        entityType: "note",
        entityId: bookId,
        op: "upsert",
        payload: { body },
        baseRevision: 0,
      });
      engine.scheduleSync();
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
    engine.scheduleSync();
  } else {
    // Hard delete for local-only books
    await db.notes.where("bookId").equals(bookId).delete();
  }
}
