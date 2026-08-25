import type { BookVaultDexie } from "@/lib/dexie/schema";
import type { OutboxEntry, BookEntry, NoteEntry } from "@/lib/dexie/types";
import { supabase } from "@/features/supabase/index";
import { attemptAutoMerge } from "@/features/sync/policy";
import { createConflict } from "@/features/sync/conflicts";
import { cloudBookToSnapshot, cloudNoteToSnapshot } from "@/lib/mappers";

const FILE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_FILE_NAME!;
const IMAGE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_IMAGE_NAME!;

const MAX_ATTEMPTS = 20;
const BACKOFF_CAP_MS = 60_000;

type ErrorClass = "transient" | "auth" | "conflict" | "permanent";

// ── Backoff ──────────────────────────────────────────────────

function backoffMs(attempts: number): number {
  const exp = Math.min(attempts, 6); // 2^6 = 64 → capped at 60s
  return Math.min(1000 * 2 ** exp, BACKOFF_CAP_MS);
}

// ── Error classification ─────────────────────────────────────

function classifyError(error: unknown): ErrorClass {
  const msg = error instanceof Error ? error.message : String(error);

  if (msg.includes("CAS conflict")) return "conflict";

  if (
    msg.includes("401") ||
    msg.includes("403") ||
    msg.toLowerCase().includes("auth") ||
    msg.toLowerCase().includes("unauthorized")
  ) {
    return "auth";
  }

  if (
    msg.includes("400") ||
    msg.includes("404") ||
    msg.includes("422") ||
    msg.includes("not found") ||
    msg.includes("violates")
  ) {
    return "permanent";
  }

  return "transient";
}

// ── Sort order for stable push ───────────────────────────────

const TYPE_ORDER: Record<OutboxEntry["entityType"], number> = {
  book: 0,
  note: 1,
  readingState: 2,
  fileUpload: 3,
};

const OP_ORDER: Record<OutboxEntry["op"], number> = {
  upsert: 0,
  promote: 0,
  delete: 1,
};

function sortKey(e: OutboxEntry): number {
  return TYPE_ORDER[e.entityType] * 10 + OP_ORDER[e.op];
}

// ── Storage upload ───────────────────────────────────────────

async function uploadFileIfMissing(
  db: BookVaultDexie,
  userId: string,
  bookId: string,
  fileId: string,
): Promise<void> {
  const existing = await supabase.storage
    .from(FILE_NAME)
    .list(`${userId}/${bookId}`);

  if (existing.data?.some((f) => f.name === `${fileId}.pdf`)) return;

  const fileEntry = await db.files.where("fileId").equals(fileId).first();
  if (!fileEntry?.file) throw new Error("File not found in local storage");

  const path = `${userId}/${bookId}/${fileId}.pdf`;
  const { error } = await supabase.storage
    .from(FILE_NAME)
    .upload(path, fileEntry.file, { cacheControl: "3600", upsert: false });

  if (error) throw new Error(`File upload failed: ${error.message}`);
}

async function uploadImageIfMissing(
  db: BookVaultDexie,
  userId: string,
  bookId: string,
  imageId: string,
): Promise<void> {
  const existing = await supabase.storage
    .from(IMAGE_NAME)
    .list(`${userId}/${bookId}`);

  if (existing.data?.some((f) => f.name === `${imageId}.png`)) return;

  const imageEntry = await db.images.where("imageId").equals(imageId).first();
  if (!imageEntry?.image) return;

  const path = `${userId}/${bookId}/${imageId}.png`;
  const { error } = await supabase.storage
    .from(IMAGE_NAME)
    .upload(path, imageEntry.image, { cacheControl: "3600", upsert: false });

  if (error) console.warn(`[Push] Image upload failed: ${error.message}`);
}

// ── RPC helpers ──────────────────────────────────────────────

async function rpcUpsertBook(
  bookId: string,
  userId: string,
  baseRevision: number,
  payload: Record<string, unknown>,
): Promise<{ revision: number }> {
  const { data, error } = await supabase.rpc("cas_upsert_book", {
    p_id: bookId,
    p_user_id: userId,
    p_base_revision: baseRevision,
    p_title: payload.title ?? "",
    p_author: payload.author ?? "",
    p_tags: payload.tags ?? [],
    p_is_favourite: payload.isFavourite ?? false,
    p_file_id: payload.fileId ?? null,
    p_image_id: payload.imageId ?? null,
  });

  if (error) throw new Error(error.message);
  return { revision: data.revision };
}

async function rpcUpsertNote(
  bookId: string,
  userId: string,
  baseRevision: number,
  body: string,
): Promise<{ revision: number }> {
  const { data, error } = await supabase.rpc("cas_upsert_note", {
    p_book_id: bookId,
    p_user_id: userId,
    p_base_revision: baseRevision,
    p_body: body,
  });

  if (error) throw new Error(error.message);
  return { revision: data.revision };
}

async function softDeleteBook(
  bookId: string,
  userId: string,
  currentRevision: number,
): Promise<{ revision: number }> {
  const newRevision = currentRevision + 1;
  const { data, error } = await supabase
    .from("books")
    .update({
      deleted_at: new Date().toISOString(),
      revision: newRevision,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookId)
    .eq("user_id", userId)
    .eq("revision", currentRevision)
    .select("revision")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("CAS conflict: delete revision mismatch");
  return { revision: data.revision };
}

async function softDeleteNote(
  bookId: string,
  userId: string,
  currentRevision: number,
): Promise<{ revision: number }> {
  const newRevision = currentRevision + 1;
  const { data, error } = await supabase
    .from("notes")
    .update({
      deleted_at: new Date().toISOString(),
      revision: newRevision,
      updated_at: new Date().toISOString(),
    })
    .eq("book_id", bookId)
    .eq("user_id", userId)
    .eq("revision", currentRevision)
    .select("revision")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("CAS conflict: delete revision mismatch");
  return { revision: data.revision };
}

// ── Remote snapshot fetch ────────────────────────────────────

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

// ── Conflict handling ────────────────────────────────────────

async function handleBookConflict(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
  local: BookEntry,
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

  const remoteBook: BookEntry = {
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

  const payload = {
    title: local.title,
    author: local.author,
    tags: local.tags,
    isFavourite: local.isFavourite,
    fileId: local.fileId,
    imageId: local.imageId,
    ...entry.payload,
  };

  const { merged, clashingFields } = attemptAutoMerge(local, remoteBook, payload);

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
  );
  await db.outbox.delete(entry.id!);
  return { entityType: "book", entityId: entry.entityId, title: local.title };
}

async function handleNoteConflict(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
  local: NoteEntry,
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

async function handleDeleteConflict(
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

// ── Handlers ─────────────────────────────────────────────────

async function handleBookUpsert(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const book = await db.books.where("id").equals(entry.entityId).first();
  if (!book) throw new Error("Book not found locally");

  const payload = {
    title: book.title,
    author: book.author,
    tags: book.tags,
    isFavourite: book.isFavourite,
    fileId: book.fileId,
    imageId: book.imageId,
    ...entry.payload,
  };

  await uploadFileIfMissing(db, userId, entry.entityId, payload.fileId as string);

  if (payload.imageId) {
    await uploadImageIfMissing(db, userId, entry.entityId, payload.imageId as string);
  }

  const { revision } = await rpcUpsertBook(
    entry.entityId,
    userId,
    entry.baseRevision,
    payload,
  );

  await db.books.where("id").equals(entry.entityId).modify({
    syncStatus: "synced",
    revision,
    baseRevision: revision,
  });
}

async function handleBookDelete(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const book = await db.books.where("id").equals(entry.entityId).first();
  if (!book) throw new Error("Book not found locally");

  const { revision } = await softDeleteBook(entry.entityId, userId, book.baseRevision);

  await db.books.where("id").equals(entry.entityId).modify({
    syncStatus: "synced",
    revision,
    baseRevision: revision,
  });
}

async function handleBookPromote(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const book = await db.books.where("id").equals(entry.entityId).first();
  if (!book) throw new Error("Book not found locally");

  const payload = {
    title: book.title,
    author: book.author,
    tags: book.tags,
    isFavourite: book.isFavourite,
    fileId: book.fileId,
    imageId: book.imageId,
    ...entry.payload,
  };

  await uploadFileIfMissing(db, userId, entry.entityId, payload.fileId as string);

  if (payload.imageId) {
    await uploadImageIfMissing(db, userId, entry.entityId, payload.imageId as string);
  }

  const { revision } = await rpcUpsertBook(
    entry.entityId,
    userId,
    0, // strict insert
    payload,
  );

  await db.books.where("id").equals(entry.entityId).modify({
    syncScope: "cloud",
    syncStatus: "synced",
    revision,
    baseRevision: revision,
  });
}

async function handleNoteUpsert(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const body = (entry.payload.body as string) ?? "";
  const { revision } = await rpcUpsertNote(
    entry.entityId,
    userId,
    entry.baseRevision,
    body,
  );

  await db.notes.where("bookId").equals(entry.entityId).modify({
    syncStatus: "synced",
    revision,
    baseRevision: revision,
  });
}

async function handleNoteDelete(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const note = await db.notes.where("bookId").equals(entry.entityId).first();
  if (!note) return;

  const { revision } = await softDeleteNote(
    entry.entityId,
    userId,
    note.baseRevision,
  );

  await db.notes.where("bookId").equals(entry.entityId).modify({
    syncStatus: "synced",
    revision,
    baseRevision: revision,
  });
}

// ── Dispatch ─────────────────────────────────────────────────

async function pushEntry(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  switch (entry.op) {
    case "upsert":
      if (entry.entityType === "book") return handleBookUpsert(db, userId, entry);
      if (entry.entityType === "note") return handleNoteUpsert(db, userId, entry);
      break;
    case "delete":
      if (entry.entityType === "book") return handleBookDelete(db, userId, entry);
      if (entry.entityType === "note") return handleNoteDelete(db, userId, entry);
      break;
    case "promote":
      return handleBookPromote(db, userId, entry);
  }
  throw new Error(`Unhandled push: ${entry.op} for ${entry.entityType}:${entry.entityId}`);
}

// ── Main entry point ─────────────────────────────────────────

export interface PushResult {
  pushed: number;
  failed: number;
  paused: boolean;
  newConflicts: Array<{ entityType: string; entityId: string; title?: string }>;
}

export async function pushOutbox(
  db: BookVaultDexie,
  userId: string,
): Promise<PushResult> {
  const now = Date.now();
  const allOps = await db.outbox.toArray();

  // Sort by type, then by op (upsert before delete)
  const ops = allOps
    .filter((e) => e.nextAttemptAt <= now)
    .sort((a, b) => sortKey(a) - sortKey(b));

  if (ops.length === 0) return { pushed: 0, failed: 0, paused: false, newConflicts: [] };

  console.log(`[Push] Processing ${ops.length} outbox entries`);

  let pushed = 0;
  let failed = 0;
  let paused = false;
  const newConflicts: Array<{ entityType: string; entityId: string; title?: string }> = [];

  for (const entry of ops) {
    try {
      await pushEntry(db, userId, entry);
      await db.outbox.delete(entry.id!);
      pushed++;
    } catch (error) {
      const errorClass = classifyError(error);
      const attempts = (entry.attempts ?? 0) + 1;

      if (errorClass === "auth") {
        paused = true;
        await db.outbox.update(entry.id!, {
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          errorClass,
        });
        break;
      }

      if (errorClass === "conflict") {
        let conflictInfo: { entityType: string; entityId: string; title?: string } | null = null;
        if (entry.op === "upsert" || entry.op === "promote") {
          if (entry.entityType === "book") {
            const local = await db.books.get(entry.entityId);
            if (local) conflictInfo = await handleBookConflict(db, userId, entry, local);
          } else if (entry.entityType === "note") {
            const local = await db.notes.get(entry.entityId);
            if (local) conflictInfo = await handleNoteConflict(db, userId, entry, local);
          }
        } else if (entry.op === "delete") {
          conflictInfo = await handleDeleteConflict(db, userId, entry, entry.entityType as "book" | "note");
        }
        if (conflictInfo) newConflicts.push(conflictInfo);
        failed++;
        continue;
      }

      if (attempts >= MAX_ATTEMPTS) {
        await db.outbox.update(entry.id!, {
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          errorClass: "permanent",
        });
        failed++;
        continue;
      }

      await db.outbox.update(entry.id!, {
        attempts,
        lastError: error instanceof Error ? error.message : String(error),
        errorClass,
        nextAttemptAt: now + backoffMs(attempts),
      });
      failed++;
    }
  }

  console.log(`[Push] Done: ${pushed} pushed, ${failed} failed, paused=${paused}`);
  return { pushed, failed, paused, newConflicts };
}
