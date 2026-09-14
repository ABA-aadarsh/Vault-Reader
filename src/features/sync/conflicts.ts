import type { BookVaultDexie } from "@/lib/dexie/schema";
import type { ConflictEntry } from "@/lib/dexie/types";
import { enqueue } from "@/lib/outbox";
import { engine } from "@/features/Sync/SyncEngine";

export async function createConflict(
  db: BookVaultDexie,
  entityType: "book" | "note",
  entityId: string,
  localSnapshot: Record<string, unknown>,
  remoteSnapshot: Record<string, unknown>,
  reason: ConflictEntry["reason"],
  clashingFields?: string[],
): Promise<ConflictEntry> {
  const bookId = entityType === "book" ? entityId : entityId;
  const conflict: Omit<ConflictEntry, "id"> = {
    entityType,
    entityId,
    bookId,
    localSnapshot,
    remoteSnapshot,
    reason,
    clashingFields,
    createdAt: Date.now(),
    status: "open",
  };

  const id = await db.conflicts.add(conflict);

  if (entityType === "book") {
    await db.books.where("id").equals(entityId).modify({ syncStatus: "conflict" });
  } else if (entityType === "note") {
    await db.notes.where("bookId").equals(entityId).modify({ syncStatus: "conflict" });
  }

  return { ...conflict, id };
}

export async function getOpenConflicts(db: BookVaultDexie): Promise<ConflictEntry[]> {
  return db.conflicts.where("status").equals("open").toArray();
}

export async function getConflictById(
  db: BookVaultDexie,
  conflictId: number,
): Promise<ConflictEntry | undefined> {
  return db.conflicts.get(conflictId);
}

export async function resolveConflict(
  db: BookVaultDexie,
  conflictId: number,
  winner: Record<string, unknown>,
  baseRevision: number,
): Promise<void> {
  const conflict = await db.conflicts.get(conflictId);
  if (!conflict) throw new Error("Conflict not found");

  await db.conflicts.update(conflictId, { status: "resolved" });

  if (conflict.entityType === "book") {
    await db.books.where("id").equals(conflict.entityId).modify({
      ...winner,
      syncStatus: "pending",
      updatedAt: Date.now(),
      baseSnapshot: {
        title: (winner.title as string) ?? "",
        author: (winner.author as string) ?? "",
        tags: (winner.tags as string[]) ?? [],
        isFavourite: Boolean(winner.isFavourite),
      },
    });

    await enqueue(db, {
      entityType: "book",
      entityId: conflict.entityId,
      op: "upsert",
      payload: winner,
      baseRevision,
    });
  } else if (conflict.entityType === "note") {
    await db.notes.where("bookId").equals(conflict.entityId).modify({
      body: winner.body as string,
      syncStatus: "pending",
      updatedAt: Date.now(),
      baseSnapshot: { body: (winner.body as string) ?? "" },
    });

    await enqueue(db, {
      entityType: "note",
      entityId: conflict.entityId,
      op: "upsert",
      payload: { body: winner.body },
      baseRevision,
    });
  }

  engine.scheduleSync();
}

export async function confirmDeleteConflict(
  db: BookVaultDexie,
  conflictId: number,
): Promise<void> {
  const conflict = await db.conflicts.get(conflictId);
  if (!conflict) throw new Error("Conflict not found");

  await db.conflicts.update(conflictId, { status: "resolved" });

  if (conflict.entityType === "book") {
    const book = await db.books.get(conflict.entityId);
    if (book) {
      await db.books.where("id").equals(conflict.entityId).modify({
        deletedAt: Date.now(),
        syncStatus: "pending",
        updatedAt: Date.now(),
      });

      await enqueue(db, {
        entityType: "book",
        entityId: conflict.entityId,
        op: "delete",
        payload: {},
        baseRevision: Number(conflict.remoteSnapshot.revision),
      });
    }
  }

  engine.scheduleSync();
}

export async function restoreConflict(
  db: BookVaultDexie,
  conflictId: number,
): Promise<void> {
  const conflict = await db.conflicts.get(conflictId);
  if (!conflict) throw new Error("Conflict not found");

  await db.conflicts.update(conflictId, { status: "resolved" });

  if (conflict.entityType === "book") {
    const local = conflict.localSnapshot;
    await db.books.where("id").equals(conflict.entityId).modify({
      title: local.title as string,
      author: local.author as string,
      tags: local.tags as string[],
      isFavourite: local.isFavourite as boolean,
      fileId: local.fileId as string,
      imageId: (local.imageId as string) ?? null,
      deletedAt: null,
      syncStatus: "pending",
      updatedAt: Date.now(),
      baseSnapshot: {
        title: (local.title as string) ?? "",
        author: (local.author as string) ?? "",
        tags: (local.tags as string[]) ?? [],
        isFavourite: Boolean(local.isFavourite),
      },
    });

    await enqueue(db, {
      entityType: "book",
      entityId: conflict.entityId,
      op: "upsert",
      payload: {
        title: local.title,
        author: local.author,
        tags: local.tags,
        fileId: local.fileId,
        isFavourite: local.isFavourite,
        imageId: local.imageId,
      },
      baseRevision: Number(conflict.remoteSnapshot.revision),
    });
  }

  engine.scheduleSync();
}
