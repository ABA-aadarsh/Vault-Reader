import { v4 as uuidv4 } from "uuid";
import type { BookVaultDexie } from "./dexie/schema";
import { bookToDomain } from "./mappers";
import type { Book, SyncScope } from "./domain";
import { enqueue } from "./outbox";
import { engine } from "@/features/sync/SyncEngine";

export interface CreateBookParams {
  title: string;
  author: string;
  tags: string[];
  isFavourite: boolean;
  image: File | null;
  file: File;
  syncScope: SyncScope;
}

/**
 * Create a new book with file, image, metadata, and optional outbox entry.
 * All writes happen in a single Dexie transaction for atomicity.
 * If syncScope is 'cloud', enqueues an outbox entry for Phase 4 push.
 */
export async function createBook(
  db: BookVaultDexie,
  params: CreateBookParams,
): Promise<string> {
  const { title, author, tags, isFavourite, image, file, syncScope } = params;
  const bookId = uuidv4();
  const fileId = uuidv4();
  const imageId = image ? uuidv4() : null;
  const now = Date.now();

  await db.transaction(
    "rw",
    db.files,
    db.images,
    db.books,
    async () => {
      // Store file blob
      await db.files.add({ fileId, file });

      // Store cover image blob if provided
      if (image && imageId) {
        await db.images.add({ imageId, image });
      }

      // Insert book metadata
      await db.books.add({
        id: bookId,
        title,
        author,
        tags,
        fileId,
        imageId,
        isFavourite,
        syncScope,
        revision: 0,
        baseRevision: 0,
        deletedAt: null,
        fileSyncStatus: "present",
        coverSyncStatus: image ? "present" : "not_downloaded",
        syncStatus: syncScope === "cloud" ? "pending" : "synced",
        updatedAt: now,
        updatedByDeviceId: "",
      });
    },
  );

  // Enqueue cloud sync if needed (separate transaction via enqueue())
  if (syncScope === "cloud") {
    await enqueue(db, {
      entityType: "book",
      entityId: bookId,
      op: "upsert",
      payload: { title, author, tags, fileId, isFavourite, imageId },
      baseRevision: 0,
    });
    engine.scheduleSync();
  }

  return bookId;
}

/**
 * List all non-deleted books (both local and cloud scope).
 */
export async function listBooks(db: BookVaultDexie): Promise<Book[]> {
  // IndexedDB omits null keys from the deletedAt index, so a where().equals(null)
  // query is impossible in Dexie (null is rejected as a key). Filter in memory.
  const entries = (await db.books.toArray()).filter((b) => b.deletedAt === null);
  return entries.map(bookToDomain);
}

/**
 * List only cloud-scoped non-deleted books.
 */
export async function listCloudBooks(db: BookVaultDexie): Promise<Book[]> {
  const entries = await db.books
    .where("syncScope")
    .equals("cloud")
    .and((b) => b.deletedAt === null)
    .toArray();
  return entries.map(bookToDomain);
}

/**
 * Get a single book by ID.
 */
export async function getBook(
  db: BookVaultDexie,
  bookId: string,
): Promise<Book | undefined> {
  const entry = await db.books.get(bookId);
  return entry ? bookToDomain(entry) : undefined;
}

/**
 * Get a single book by its fileId (used for navigation from library to viewer).
 */
export async function getBookByFileId(
  db: BookVaultDexie,
  fileId: string,
): Promise<Book | undefined> {
  const entry = await db.books.where("fileId").equals(fileId).first();
  return entry ? bookToDomain(entry) : undefined;
}

/**
 * Update book metadata fields. If the book is cloud-scoped,
 * marks syncStatus as pending and enqueues an outbox upsert.
 */
export async function updateBook(
  db: BookVaultDexie,
  bookId: string,
  updates: { title?: string; author?: string; tags?: string[]; isFavourite?: boolean },
): Promise<void> {
  const now = Date.now();
  const book = await db.books.get(bookId);
  if (!book) throw new Error("Book not found");

  await db.books.where("id").equals(bookId).modify({ ...updates, updatedAt: now });

  if (book.syncScope === "cloud") {
    await db.books.where("id").equals(bookId).modify({ syncStatus: "pending" });

    await enqueue(db, {
      entityType: "book",
      entityId: bookId,
      op: "upsert",
      payload: updates,
      baseRevision: book.baseRevision,
    });
    engine.scheduleSync();
  }
}

/**
 * Soft-delete a book. Cloud books get deletedAt set + outbox delete.
 * Local books are hard-purged immediately.
 */
export async function softDeleteBook(
  db: BookVaultDexie,
  bookId: string,
): Promise<void> {
  const book = await db.books.get(bookId);
  if (!book) throw new Error("Book not found");

  const now = Date.now();

  if (book.syncScope === "cloud") {
    // Soft delete: set deletedAt, enqueue outbox for cloud propagation
    await db.books
      .where("id")
      .equals(bookId)
      .modify({ deletedAt: now, syncStatus: "pending", updatedAt: now });

    await enqueue(db, {
      entityType: "book",
      entityId: bookId,
      op: "delete",
      payload: {},
      baseRevision: book.baseRevision,
    });
    engine.scheduleSync();
  } else {
    // Local-only: hard delete immediately
    await hardPurgeLocal(db, bookId);
  }
}

/**
 * Restore a soft-deleted book. Clears deletedAt and enqueues outbox upsert.
 */
export async function restoreBook(
  db: BookVaultDexie,
  bookId: string,
): Promise<void> {
  const book = await db.books.get(bookId);
  if (!book) throw new Error("Book not found");

  const now = Date.now();

  await db.books
    .where("id")
    .equals(bookId)
    .modify({ deletedAt: null, syncStatus: "pending", updatedAt: now });

  if (book.syncScope === "cloud") {
    await enqueue(db, {
      entityType: "book",
      entityId: bookId,
      op: "upsert",
      payload: {
        title: book.title,
        author: book.author,
        tags: book.tags,
        fileId: book.fileId,
        isFavourite: book.isFavourite,
        imageId: book.imageId,
      },
      baseRevision: book.baseRevision,
    });
    engine.scheduleSync();
  }
}

/**
 * Hard-delete a book locally: removes file blob, image blob, and book row.
 * Used for local-only books or after cloud soft-delete is confirmed.
 */
export async function hardPurgeLocal(
  db: BookVaultDexie,
  bookId: string,
): Promise<void> {
  const book = await db.books.get(bookId);
  if (!book) throw new Error("Book not found");

  await db.files.where("fileId").equals(book.fileId).delete();
  if (book.imageId) {
    await db.images.where("imageId").equals(book.imageId).delete();
  }
  await db.books.where("id").equals(bookId).delete();
}

/**
 * Promote a local book to cloud scope. Sets syncScope to 'cloud',
 * marks as pending, and enqueues outbox entry with baseRevision 0 (insert intent).
 */
export async function promoteToCloud(
  db: BookVaultDexie,
  bookId: string,
): Promise<void> {
  const book = await db.books.get(bookId);
  if (!book) throw new Error("Book not found");
  if (book.syncScope === "cloud") return;

  const now = Date.now();

  await db.books
    .where("id")
    .equals(bookId)
    .modify({ syncScope: "cloud", syncStatus: "pending", updatedAt: now });

  await enqueue(db, {
    entityType: "book",
    entityId: bookId,
    op: "promote",
    payload: {
      title: book.title,
      author: book.author,
      tags: book.tags,
      fileId: book.fileId,
      isFavourite: book.isFavourite,
      imageId: book.imageId,
    },
    baseRevision: 0,
  });
  engine.scheduleSync();
}
