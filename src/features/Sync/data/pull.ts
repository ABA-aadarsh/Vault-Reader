import type { BookVaultDexie } from "@/data/dexie/schema";
import type { Book, Note } from "@/data/domain";
import { removeFile } from "@/features/Books/data/files";
import { removeImage } from "@/features/Books/data/images";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 100;

export interface PullCursor {
  updatedAt: string;
  id: string;
}

export interface PullResult {
  books: number;
  notes: number;
  readingStates: number;
  hasMoreBooks: boolean;
  hasMoreNotes: boolean;
  hasMoreReadingStates: boolean;
}

function isCursor(value: unknown): value is PullCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as Partial<PullCursor>;
  return typeof cursor.updatedAt === "string" && typeof cursor.id === "string";
}

async function getCursor(
  db: BookVaultDexie,
  key: "booksPullCursor" | "notesPullCursor" | "readingStatesPullCursor",
): Promise<PullCursor | null> {
  const entry = await db.syncState.get(key);
  return isCursor(entry?.value) ? entry.value : null;
}

async function setCursor(
  db: BookVaultDexie,
  key: "booksPullCursor" | "notesPullCursor" | "readingStatesPullCursor",
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
  entityType: "book" | "note" | "readingState",
  entityId: string,
  pendingIds: Set<string>,
): boolean {
  return pendingIds.has(`${entityType}:${entityId}`);
}

async function pendingEntityIds(db: BookVaultDexie): Promise<Set<string>> {
  const operations = await db.outbox.toArray();
  return new Set(operations.map((operation) => `${operation.entityType}:${operation.entityId}`));
}

async function conflictedEntityIds(db: BookVaultDexie): Promise<Set<string>> {
  const conflicts = await db.conflicts.where("status").equals("open").toArray();
  return new Set(conflicts.map((c) => `${c.entityType}:${c.entityId}`));
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
        baseSnapshot: {
          title: (cloudBook.title as string) ?? "",
          author: (cloudBook.author as string) ?? "",
          tags: (cloudBook.tags as string[]) ?? [],
          isFavourite: Boolean(cloudBook.is_favourite),
        },
      });
    } else {
      await db.books.update(id, {
        deletedAt: cloudTime(deletedAt),
        revision,
        baseRevision: revision,
        fileSyncStatus: "not_downloaded",
        coverSyncStatus: "not_downloaded",
        syncStatus: "synced",
        updatedAt,
        baseSnapshot: {
          title: (cloudBook.title as string) ?? "",
          author: (cloudBook.author as string) ?? "",
          tags: (cloudBook.tags as string[]) ?? [],
          isFavourite: Boolean(cloudBook.is_favourite),
        },
      });
      await removeFile(db, existing.fileId);
      if (existing.imageId) await removeImage(db, existing.imageId);
    }
    return;
  }

  const filePresent = existing?.fileId === fileId && existing.fileSyncStatus === "present";
  const coverPresent = existing?.imageId === imageId && existing.coverSyncStatus === "present";
  const values: Partial<Book> = {
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
    baseSnapshot: {
      title: (cloudBook.title as string) ?? "",
      author: (cloudBook.author as string) ?? "",
      tags: (cloudBook.tags as string[]) ?? [],
      isFavourite: Boolean(cloudBook.is_favourite),
    },
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
      baseSnapshot: values.baseSnapshot,
    });
  }
}

async function applyNote(
  db: BookVaultDexie,
  cloudNote: Record<string, unknown>,
): Promise<void> {
  const bookId = cloudNote.book_id as string;
  const book = await db.books.get(bookId);
  if (!book) {
    console.warn(`[Pull] Skipping note for missing book ${bookId}`);
    return;
  }

  const existing = await db.notes.get(bookId);
  const deletedAt = cloudNote.deleted_at as string | null;
  const values: Note = {
    bookId,
    body: (cloudNote.body as string) ?? "",
    revision: Number(cloudNote.revision),
    baseRevision: Number(cloudNote.revision),
    deletedAt: deletedAt ? cloudTime(deletedAt) : null,
    syncStatus: "synced",
    updatedAt: cloudTime(cloudNote.updated_at as string | null),
    updatedByDeviceId: "",
    baseSnapshot: { body: (cloudNote.body as string) ?? "" },
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
  const conflictedIds = await conflictedEntityIds(db);
  let processed = 0;
  let lastCursor = cursor;

  for (const row of rows) {
    const id = row.id as string;
    if (isPending("book", id, pendingIds)) break;
    if (isPending("book", id, conflictedIds)) {
      lastCursor = { updatedAt: row.updated_at as string, id };
      continue;
    }

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
  const conflictedIds = await conflictedEntityIds(db);
  let processed = 0;
  let lastCursor = cursor;

  for (const row of rows) {
    const id = row.book_id as string;
    if (isPending("note", id, pendingIds)) break;
    if (isPending("note", id, conflictedIds)) {
      lastCursor = { updatedAt: row.updated_at as string, id };
      continue;
    }
    if (!await db.books.get(id)) break;

    const existing = await db.notes.get(id);
    if (!existing || Number(row.revision) > existing.baseRevision) await applyNote(db, row);
    lastCursor = { updatedAt: row.updated_at as string, id };
    processed++;
  }

  if (lastCursor && processed > 0) await setCursor(db, "notesPullCursor", lastCursor);
  return { count: processed, hasMore: rows.length === PAGE_SIZE || processed < rows.length };
}

async function applyReadingState(
  db: BookVaultDexie,
  cloudState: Record<string, unknown>,
): Promise<void> {
  const bookId = cloudState.book_id as string;
  const existing = await db.readingState.get(bookId);
  const cloudPage = Number(cloudState.page) || 0;
  const cloudPercent = Number(cloudState.percent) || 0;

  // max merge — never regress local progress
  const page = existing ? Math.max(existing.page, cloudPage) : cloudPage;
  const percent = existing ? Math.max(existing.percent, cloudPercent) : cloudPercent;

  const values = {
    bookId,
    page,
    percent,
    revision: Number(cloudState.revision),
    baseRevision: Number(cloudState.revision),
    syncStatus: "synced" as const,
    updatedAt: cloudTime(cloudState.updated_at as string | null),
    deviceId: "",
  };

  if (existing) await db.readingState.update(bookId, values);
  else await db.readingState.add(values);
}

export async function pullReadingStates(
  db: BookVaultDexie,
  userId: string,
): Promise<{ count: number; hasMore: boolean }> {
  const cursor = await getCursor(db, "readingStatesPullCursor");
  let query = supabase
    .from("reading_states")
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
  if (error) throw new Error(`Failed to pull reading states: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const pendingIds = await pendingEntityIds(db);
  const conflictedIds = await conflictedEntityIds(db);
  let processed = 0;
  let lastCursor = cursor;

  for (const row of rows) {
    const id = row.book_id as string;
if (isPending("readingState", id, pendingIds)) break;
    if (isPending("readingState", id, conflictedIds)) {
      lastCursor = { updatedAt: row.updated_at as string, id };
      continue;
    }
    if (!await db.books.get(id)) {
      lastCursor = { updatedAt: row.updated_at as string, id };
      continue;
    }
    const existing = await db.readingState.get(id);
    if (!existing || Number(row.revision) > existing.baseRevision) await applyReadingState(db, row);
    lastCursor = { updatedAt: row.updated_at as string, id };
    processed++;
  }

  if (lastCursor && processed > 0) await setCursor(db, "readingStatesPullCursor", lastCursor);
  return { count: processed, hasMore: rows.length === PAGE_SIZE || processed < rows.length };
}

export async function pullFromCloud(
  db: BookVaultDexie,
  userId: string,
  includeReadingStates = false,
): Promise<PullResult> {
  const books = await pullBooks(db, userId);
  const notes = await pullNotes(db, userId);

  let readingStates = 0;
  let hasMoreReadingStates = false;
  if (includeReadingStates) {
    const result = await pullReadingStates(db, userId);
    readingStates = result.count;
    hasMoreReadingStates = result.hasMore;
  }

  return {
    books: books.count,
    notes: notes.count,
    readingStates,
    hasMoreBooks: books.hasMore,
    hasMoreNotes: notes.hasMore,
    hasMoreReadingStates,
  };
}

