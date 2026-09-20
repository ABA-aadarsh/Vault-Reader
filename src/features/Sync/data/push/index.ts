import type { BookVaultDexie } from "@/data/dexie/schema";
import type { OutboxEntry } from "@/data/dexie/types";
import {
  classifyError,
  backoffMs,
  sortKey,
  MAX_ATTEMPTS,
  MAX_OUTBOX_BATCH,
} from "./helpers";
import {
  handleBookUpsert,
  handleBookDelete,
  handleBookPromote,
  handleNoteUpsert,
  handleNoteDelete,
  handleReadingStateUpsert,
} from "./handlers";
import {
  handleBookConflict,
  handleNoteConflict,
  handleReadingStateConflict,
  handleDeleteConflict,
} from "./conflicts";

export interface PushResult {
  pushed: number;
  failed: number;
  paused: boolean;
  newConflicts: Array<{ entityType: string; entityId: string; title?: string }>;
}

async function pushEntry(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  switch (entry.op) {
    case "upsert":
      if (entry.entityType === "book") return handleBookUpsert(db, userId, entry);
      if (entry.entityType === "note") return handleNoteUpsert(db, userId, entry);
      if (entry.entityType === "readingState") return handleReadingStateUpsert(db, userId, entry);
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

export async function pushOutbox(
  db: BookVaultDexie,
  userId: string,
): Promise<PushResult> {
  const now = Date.now();
  const allOps = await db.outbox.toArray();

  // Sort by type, then by op (upsert before delete)
  const ops = allOps
    .filter((e) => e.nextAttemptAt <= now)
    .sort((a, b) => sortKey(a) - sortKey(b))
    .slice(0, MAX_OUTBOX_BATCH);

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
          } else if (entry.entityType === "readingState") {
            await handleReadingStateConflict(db, userId, entry);
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
