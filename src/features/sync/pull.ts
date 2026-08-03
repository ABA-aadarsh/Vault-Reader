import type { BookVaultDexie } from "@/lib/dexie/schema";
import type { BookEntry, NoteEntry } from "@/lib/dexie/types";
import { removeFile } from "@/lib/files";
import { removeImage } from "@/lib/images";
import { supabase } from "@/features/supabase/index";

const PAGE_SIZE = 100;

export interface PullCursor {
  updatedAt: string;
  id: string;
}

export interface PullResult {
  books: number;
  notes: number;
  hasMoreBooks: boolean;
  hasMoreNotes: boolean;
}

function isCursor(value: unknown): value is PullCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as Partial<PullCursor>;
  return typeof cursor.updatedAt === "string" && typeof cursor.id === "string";
}

async function getCursor(
  db: BookVaultDexie,
  key: "booksPullCursor" | "notesPullCursor",
): Promise<PullCursor | null> {
  const entry = await db.syncState.get(key);
  return isCursor(entry?.value) ? entry.value : null;
}

async function setCursor(
  db: BookVaultDexie,
  key: "booksPullCursor" | "notesPullCursor",
  cursor: PullCursor,
): Promise<void> {
  await db.syncState.put({ key, value: cursor });
}

function cursorFilter(cursor: PullCursor | null): string | null {
  if (!cursor) return null;
  return `updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`;
}

function cloudTime(value: string | null): number {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isNaN(timestamp) ? Date.now() : timestamp;
}

function isPending(
  entityType: "book" | "note",
  entityId: string,
  pendingIds: Set<string>,
): boolean {
  return pendingIds.has(`${entityType}:${entityId}`);
}

async function pendingEntityIds(db: BookVaultDexie): Promise<Set<string>> {
  const operations = await db.outbox.toArray();
  return new Set(operations.map((operation) => `${operation.entityType}:${operation.entityId}`));
}

async function applyBook(
  db: BookVaultDexie,
  cloudBook: Record<string, unknown>,
): Promise<void> {
  const id = cloudBook.id as string;
  const deletedAt = cloudBook.deleted_at as string | null;
  const existing = await db.books.get(id);
  const revision = Number(cloudBook.revision);
  const updatedAt = cloudTime(cloudBook.updated_at as string | null);
  const fileId = (cloudBook.file_id as string | null) ?? "";
  const imageId = (cloudBook.image_id as string | null) ?? null;

  if (deletedAt) {
    if (!existing) {
      await db.books.add({
        id,
        title: (cloudBook.title as string) ?? "",
        author: (cloudBook.author as string) ?? "",
        tags: (cloudBook.tags as string[]) ?? [],
        fileId,
        imageId,
        isFavourite: Boolean(cloudBook.is_favourite),
        syncScope: "cloud",
        revision,
        baseRevision: revision,
        deletedAt: cloudTime(deletedAt),
        fileSyncStatus: "not_downloaded",
        coverSyncStatus: "not_downloaded",
        syncStatus: "synced",
        updatedAt,
        updatedByDeviceId: "",
      });
    } else {
      await db.books.update(id, {
        deletedAt: cloudTime(deletedAt),
        revision,
        baseRevision: revision,
        syncStatus: "synced",
        updatedAt,
      });
      await removeFile(db, existing.fileId);
      if (existing.imageId) await removeImage(db, existing.imageId);
    }
    return;
  }

  const filePresent = existing?.fileId === fileId && existing.fileSyncStatus === "present";
  const coverPresent = existing?.imageId === imageId && existing.coverSyncStatus === "present";
  const values: Partial<BookEntry> = {
    title: (cloudBook.title as string) ?? "",
    author: (cloudBook.author as string) ?? "",
    tags: (cloudBook.tags as string[]) ?? [],
    fileId,
    imageId,
    isFavourite: Boolean(cloudBook.is_favourite),
    syncScope: "cloud",
    revision,
    baseRevision: revision,
    deletedAt: null,
    fileSyncStatus: filePresent ? "present" : "not_downloaded",
    coverSyncStatus: coverPresent ? "present" : "not_downloaded",
    syncStatus: "synced",
    updatedAt,
  };

  if (existing) {
    if (existing.fileId !== fileId) await removeFile(db, existing.fileId);
    if (existing.imageId && existing.imageId !== imageId) await removeImage(db, existing.imageId);
    await db.books.update(id, values);
  } else {
    await db.books.add({
      id,
      title: values.title ?? "",
      author: values.author ?? "",
      tags: values.tags ?? [],
      fileId,
      imageId,
      isFavourite: values.isFavourite ?? false,
      syncScope: "cloud",
      revision,
      baseRevision: revision,
      deletedAt: null,
      fileSyncStatus: values.fileSyncStatus ?? "not_downloaded",
      coverSyncStatus: values.coverSyncStatus ?? "not_downloaded",
      syncStatus: "synced",
      updatedAt,
      updatedByDeviceId: "",
    });
  }
}

async function applyNote(
  db: BookVaultDexie,
  cloudNote: Record<string, unknown>,
): Promise<void> {
  const bookId = cloudNote.book_id as string;
  const book = await db.books.get(bookId);
  if (!book) throw new Error(`Cannot apply note for missing book ${bookId}`);

  const existing = await db.notes.get(bookId);
  const deletedAt = cloudNote.deleted_at as string | null;
  const values: NoteEntry = {
    bookId,
    body: (cloudNote.body as string) ?? "",
    revision: Number(cloudNote.revision),
    baseRevision: Number(cloudNote.revision),
    deletedAt: deletedAt ? cloudTime(deletedAt) : null,
    syncStatus: "synced",
    updatedAt: cloudTime(cloudNote.updated_at as string | null),
    updatedByDeviceId: "",
  };

  if (existing) await db.notes.update(bookId, values);
  else await db.notes.add(values);
}

export async function pullBooks(db: BookVaultDexie, userId: string): Promise<{ count: number; hasMore: boolean }> {
  const cursor = await getCursor(db, "booksPullCursor");
  let query = supabase
    .from("books")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PAGE_SIZE);

  const filter = cursorFilter(cursor);
  if (filter) query = query.or(filter);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to pull books: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const pendingIds = await pendingEntityIds(db);
  let processed = 0;
  let lastCursor = cursor;

  for (const row of rows) {
    const id = row.id as string;
    if (isPending("book", id, pendingIds)) break;

    const existing = await db.books.get(id);
    if (!existing || Number(row.revision) > existing.baseRevision) {
      await applyBook(db, row);
    }
    lastCursor = { updatedAt: row.updated_at as string, id };
    processed++;
  }

  if (lastCursor && processed > 0) await setCursor(db, "booksPullCursor", lastCursor);
  return { count: processed, hasMore: rows.length === PAGE_SIZE || processed < rows.length };
}

export async function pullNotes(db: BookVaultDexie, userId: string): Promise<{ count: number; hasMore: boolean }> {
  const cursor = await getCursor(db, "notesPullCursor");
  let query = supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true })
    .order("book_id", { ascending: true })
    .limit(PAGE_SIZE);

  const filter = cursor
    ? `updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},book_id.gt.${cursor.id})`
    : null;
  if (filter) query = query.or(filter);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to pull notes: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const pendingIds = await pendingEntityIds(db);
  let processed = 0;
  let lastCursor = cursor;

  for (const row of rows) {
    const id = row.book_id as string;
    if (isPending("note", id, pendingIds)) break;
    if (!await db.books.get(id)) break;

    const existing = await db.notes.get(id);
    if (!existing || Number(row.revision) > existing.baseRevision) await applyNote(db, row);
    lastCursor = { updatedAt: row.updated_at as string, id };
    processed++;
  }

  if (lastCursor && processed > 0) await setCursor(db, "notesPullCursor", lastCursor);
  return { count: processed, hasMore: rows.length === PAGE_SIZE || processed < rows.length };
}

export async function pullFromCloud(db: BookVaultDexie, userId: string): Promise<PullResult> {
  const books = await pullBooks(db, userId);
  const notes = await pullNotes(db, userId);
  return {
    books: books.count,
    notes: notes.count,
    hasMoreBooks: books.hasMore,
    hasMoreNotes: notes.hasMore,
  };
}
