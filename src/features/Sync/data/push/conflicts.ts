import type { BookVaultDexie } from "@/data/dexie/schema";
import type { OutboxEntry } from "@/data/dexie/types";
import type { Book, Note } from "@/data/domain";
import { supabase } from "@/lib/supabase";
import { attemptAutoMerge } from "../policy";
import { createConflict } from "../conflicts";
import { cloudBookToSnapshot, cloudNoteToSnapshot } from "../mappers";

async function fetchRemoteBook(
  bookId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  return data as Record<string, unknown>;
}

async function fetchRemoteNote(
  bookId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("book_id", bookId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  return data as Record<string, unknown>;
}

async function fetchRemoteReadingState(
  bookId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("reading_states")
    .select("*")
    .eq("book_id", bookId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  return data as Record<string, unknown>;
}

export async function handleBookConflict(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
  local: Book,
): Promise<{ entityType: string; entityId: string; title?: string } | null> {
  const remote = await fetchRemoteBook(entry.entityId, userId);
  if (!remote) {
    await db.outbox.update(entry.id!, {
      attempts: (entry.attempts ?? 0) + 1,
      lastError: "Failed to fetch remote snapshot",
      errorClass: "permanent",
    });
    return null;
  }

  const remoteBook: Book = {
    id: remote.id as string,
    title: (remote.title as string) ?? "",
    author: (remote.author as string) ?? "",
    tags: (remote.tags as string[]) ?? [],
    isFavourite: Boolean(remote.is_favourite),
    fileId: (remote.file_id as string) ?? "",
    imageId: (remote.image_id as string) ?? null,
    syncScope: "cloud",
    revision: Number(remote.revision),
    baseRevision: Number(remote.revision),
    deletedAt: remote.deleted_at ? Date.parse(remote.deleted_at as string) : null,
    fileSyncStatus: "not_downloaded",
    coverSyncStatus: "not_downloaded",
    syncStatus: "synced",
    updatedAt: remote.updated_at ? Date.parse(remote.updated_at as string) : Date.now(),
    updatedByDeviceId: "",
  };

  const remoteSnapshot = cloudBookToSnapshot(remote);

  if (remoteBook.deletedAt) {
    await createConflict(
      db,
      "book",
      entry.entityId,
      local as unknown as Record<string, unknown>,
      remoteSnapshot,
      "update_vs_delete",
    );
    await db.outbox.delete(entry.id!);
    return { entityType: "book", entityId: entry.entityId, title: local.title };
  }

  const { merged, clashingFields } = attemptAutoMerge(local, remoteBook, entry.payload);

  if (merged && clashingFields.length === 0) {
    await db.books.where("id").equals(entry.entityId).modify({
      title: merged.title,
      author: merged.author,
      tags: merged.tags,
      isFavourite: merged.isFavourite,
      syncStatus: "pending",
      updatedAt: Date.now(),
    });

    await db.outbox.update(entry.id!, {
      payload: {
        title: merged.title,
        author: merged.author,
        tags: merged.tags,
        isFavourite: merged.isFavourite,
        fileId: merged.fileId,
        imageId: merged.imageId,
      },
      baseRevision: remoteBook.revision,
      attempts: 0,
      nextAttemptAt: 0,
      lastError: undefined,
      errorClass: undefined,
    });
    return null;
  }

  await createConflict(
    db,
    "book",
    entry.entityId,
    local as unknown as Record<string, unknown>,
    remoteSnapshot,
    "field_clash",
    clashingFields,
  );
  await db.outbox.delete(entry.id!);
  return { entityType: "book", entityId: entry.entityId, title: local.title };
}

export async function handleNoteConflict(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
  local: Note,
): Promise<{ entityType: string; entityId: string; title?: string } | null> {
  const remote = await fetchRemoteNote(entry.entityId, userId);
  if (!remote) {
    await db.outbox.update(entry.id!, {
      attempts: (entry.attempts ?? 0) + 1,
      lastError: "Failed to fetch remote snapshot",
      errorClass: "permanent",
    });
    return null;
  }

  const remoteBody = (remote.body as string) ?? "";
  const localBody = local.body;

  const remoteNote = cloudNoteToSnapshot(remote);

  if (remoteBody === localBody) {
    await db.notes.where("bookId").equals(entry.entityId).modify({
      syncStatus: "synced",
      revision: Number(remote.revision),
      baseRevision: Number(remote.revision),
    });
    await db.outbox.delete(entry.id!);
    return null;
  }

  if (remote.deleted_at) {
    await createConflict(
      db,
      "note",
      entry.entityId,
      local as unknown as Record<string, unknown>,
      remoteNote,
      "update_vs_delete",
    );
    await db.outbox.delete(entry.id!);
    const book = await db.books.get(entry.entityId);
    return { entityType: "note", entityId: entry.entityId, title: book?.title };
  }

  await createConflict(
    db,
    "note",
    entry.entityId,
    local as unknown as Record<string, unknown>,
    remoteNote,
    "note_body",
  );
  await db.outbox.delete(entry.id!);
  const book = await db.books.get(entry.entityId);
  return { entityType: "note", entityId: entry.entityId, title: book?.title };
}

export async function handleDeleteConflict(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
  entityType: "book" | "note",
): Promise<{ entityType: string; entityId: string; title?: string } | null> {
  let remote: Record<string, unknown> | null;
  if (entityType === "book") {
    remote = await fetchRemoteBook(entry.entityId, userId);
  } else {
    remote = await fetchRemoteNote(entry.entityId, userId);
  }

  if (!remote) {
    await db.outbox.update(entry.id!, {
      attempts: (entry.attempts ?? 0) + 1,
      lastError: "Failed to fetch remote snapshot",
      errorClass: "permanent",
    });
    return null;
  }

  if (remote.deleted_at) {
    if (entityType === "book") {
      await db.books.where("id").equals(entry.entityId).modify({
        syncStatus: "synced",
        revision: Number(remote.revision),
        baseRevision: Number(remote.revision),
      });
    } else {
      await db.notes.where("bookId").equals(entry.entityId).modify({
        syncStatus: "synced",
        revision: Number(remote.revision),
        baseRevision: Number(remote.revision),
      });
    }
    await db.outbox.delete(entry.id!);
    return null;
  }

  let localSnapshot: Record<string, unknown>;
  let title: string | undefined;
  const normalizedRemote = entityType === "book"
    ? cloudBookToSnapshot(remote)
    : cloudNoteToSnapshot(remote);

  if (entityType === "book") {
    const local = await db.books.get(entry.entityId);
    localSnapshot = (local as unknown as Record<string, unknown>) ?? {};
    title = local?.title;
  } else {
    const local = await db.notes.get(entry.entityId);
    localSnapshot = (local as unknown as Record<string, unknown>) ?? {};
    const book = await db.books.get(entry.entityId);
    title = book?.title;
  }

  await createConflict(
    db,
    entityType,
    entry.entityId,
    localSnapshot,
    normalizedRemote,
    "update_vs_delete",
  );
  await db.outbox.delete(entry.id!);
  return { entityType, entityId: entry.entityId, title };
}

export async function handleReadingStateConflict(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const local = await db.readingState.get(entry.entityId);
  if (!local) {
    await db.outbox.delete(entry.id!);
    return;
  }

  const remote = await fetchRemoteReadingState(entry.entityId, userId);
  if (!remote) {
    await db.outbox.update(entry.id!, {
      attempts: (entry.attempts ?? 0) + 1,
      lastError: "Failed to fetch remote reading state",
      errorClass: "permanent",
    });
    return;
  }

  // Progress is a monotonic "max merge" — never regress.
  const page = Math.max(local.page, Number(remote.page) || 0);
  const percent = Math.max(local.percent, Number(remote.percent) || 0);

  await db.readingState.update(entry.entityId, {
    page,
    percent,
    revision: Number(remote.revision),
    baseRevision: Number(remote.revision),
  });

  // If the local position is ahead of the remote, re-enqueue so the
  // cloud learns the higher value (progress max-merge is safe to retry).
  if (page > Number(remote.page) || percent > Number(remote.percent)) {
    await db.readingState.update(entry.entityId, { syncStatus: "pending" });
    await db.outbox.update(entry.id!, {
      payload: { page, percent },
      baseRevision: Number(remote.revision),
      attempts: 0,
      nextAttemptAt: Date.now(),
      lastError: undefined,
      errorClass: undefined,
      op: "upsert",
    });
    return;
  }

  await db.outbox.delete(entry.id!);
}
