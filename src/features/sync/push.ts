import type { BookVaultDexie } from "@/lib/dexie/schema";
import type { OutboxEntry } from "@/lib/dexie/types";
import { supabase } from "@/features/supabase/index";

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
  const { error } = await supabase
    .from("books")
    .update({
      deleted_at: new Date().toISOString(),
      revision: newRevision,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookId)
    .eq("user_id", userId)
    .eq("revision", currentRevision);

  if (error) throw new Error(error.message);
  return { revision: newRevision };
}

async function softDeleteNote(
  bookId: string,
  userId: string,
  currentRevision: number,
): Promise<{ revision: number }> {
  const newRevision = currentRevision + 1;
  const { error } = await supabase
    .from("notes")
    .update({
      deleted_at: new Date().toISOString(),
      revision: newRevision,
      updated_at: new Date().toISOString(),
    })
    .eq("book_id", bookId)
    .eq("user_id", userId)
    .eq("revision", currentRevision);

  if (error) throw new Error(error.message);
  return { revision: newRevision };
}

// ── Handlers ─────────────────────────────────────────────────

async function handleBookUpsert(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  await uploadFileIfMissing(db, userId, entry.entityId, entry.payload.fileId as string);

  if (entry.payload.imageId) {
    await uploadImageIfMissing(db, userId, entry.entityId, entry.payload.imageId as string);
  }

  const { revision } = await rpcUpsertBook(
    entry.entityId,
    userId,
    entry.baseRevision,
    entry.payload,
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
  await uploadFileIfMissing(db, userId, entry.entityId, entry.payload.fileId as string);

  if (entry.payload.imageId) {
    await uploadImageIfMissing(db, userId, entry.entityId, entry.payload.imageId as string);
  }

  const { revision } = await rpcUpsertBook(
    entry.entityId,
    userId,
    0, // strict insert
    entry.payload,
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
}

// ── Main entry point ─────────────────────────────────────────

export interface PushResult {
  pushed: number;
  failed: number;
  paused: boolean; // true if auth error paused the engine
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

  if (ops.length === 0) return { pushed: 0, failed: 0, paused: false };

  console.log(`[Push] Processing ${ops.length} outbox entries`);

  let pushed = 0;
  let failed = 0;
  let paused = false;

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
        // Don't schedule retry — engine pauses until re-auth
        await db.outbox.update(entry.id!, {
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          errorClass,
        });
        break; // stop processing — auth failure pauses everything
      }

      if (errorClass === "conflict" || attempts >= MAX_ATTEMPTS) {
        // Permanent stop — needs user intervention (Phase 7 for conflicts)
        await db.outbox.update(entry.id!, {
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          errorClass: errorClass === "conflict" ? "conflict" : "permanent",
        });
        failed++;
        continue;
      }

      // Transient or permanent — schedule retry
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
  return { pushed, failed, paused };
}
