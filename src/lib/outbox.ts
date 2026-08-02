import type { BookVaultDexie } from "./dexie/schema";
import type { OutboxEntry } from "./dexie/types";

type OutboxOp = OutboxEntry["op"];
type EntityType = OutboxEntry["entityType"];

export interface EnqueueParams {
  entityType: EntityType;
  entityId: string;
  op: OutboxOp;
  payload: Record<string, unknown>;
  baseRevision: number;
}

/**
 * Enqueue an outbox operation with coalesce logic.
 * Runs inside a single Dexie transaction for atomicity.
 *
 * Coalesce rules for same (entityType, entityId):
 *   upsert + upsert → shallow merge payload, earliest baseRevision
 *   upsert + delete  → delete wins (remove the upsert)
 *   delete + upsert  → throw error (block undelete; use restoreBook instead)
 *   promote          → always insert (no coalesce)
 */
export async function enqueue(
  db: BookVaultDexie,
  params: EnqueueParams,
): Promise<void> {
  const { entityType, entityId, op, payload, baseRevision } = params;

  if (op === "promote") {
    // Promote always inserts fresh; no coalesce
    await db.outbox.add({
      entityType,
      entityId,
      op: "promote",
      payload,
      baseRevision: 0,
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
    });
    return;
  }

  await db.transaction("rw", db.outbox, async () => {
    const existing = await db.outbox
      .where("entityType")
      .equals(entityType)
      .and((e) => e.entityId === entityId)
      .first();

    if (!existing) {
      // No existing entry — insert fresh
      await db.outbox.add({
        entityType,
        entityId,
        op,
        payload,
        baseRevision,
        createdAt: Date.now(),
        attempts: 0,
        nextAttemptAt: Date.now(),
      });
      return;
    }

    // Coalesce with existing entry
    if (op === "delete" && existing.op === "upsert") {
      // delete wins over upsert — replace with delete
      await db.outbox.update(existing.id!, {
        op: "delete",
        payload: {},
        baseRevision,
        createdAt: Date.now(),
        attempts: 0,
        nextAttemptAt: Date.now(),
        lastError: undefined,
        errorClass: undefined,
      });
      return;
    }

    if (op === "upsert" && existing.op === "delete") {
      // Block undelete via outbox — must use restoreBook() flow
      throw new Error(
        `Cannot enqueue upsert for ${entityId}: a pending delete exists. Use restoreBook() instead.`,
      );
    }

    if (op === "upsert" && existing.op === "upsert") {
      // Shallow merge payloads; keep earliest baseRevision
      const mergedPayload = { ...existing.payload, ...payload };
      const earliestBaseRevision = Math.min(existing.baseRevision, baseRevision);
      await db.outbox.update(existing.id!, {
        payload: mergedPayload,
        baseRevision: earliestBaseRevision,
        attempts: 0,
        nextAttemptAt: Date.now(),
        lastError: undefined,
        errorClass: undefined,
      });
      return;
    }

    // Fallback: delete + delete is a no-op (already pending delete)
    // Just update timestamp
    await db.outbox.update(existing.id!, {
      createdAt: Date.now(),
    });
  });
}

/**
 * Console dump of outbox entries for debugging.
 * Call from browser DevTools: inspectOutbox(db)
 */
export async function inspectOutbox(db: BookVaultDexie): Promise<void> {
  const entries = await db.outbox.toArray();
  if (entries.length === 0) {
    console.log("[Outbox] Empty");
    return;
  }
  console.table(
    entries.map((e) => ({
      id: e.id,
      entity: e.entityType,
      entityId: e.entityId.slice(0, 8),
      op: e.op,
      baseRev: e.baseRevision,
      attempts: e.attempts,
      errorClass: e.errorClass ?? "—",
      lastError: e.lastError?.slice(0, 40) ?? "—",
    })),
  );
}

/**
 * Returns the count of pending outbox operations.
 */
export async function getPendingCount(db: BookVaultDexie): Promise<number> {
  return db.outbox.count();
}

export interface OutboxStats {
  total: number;
  byEntity: Record<string, number>;
  byOp: Record<string, number>;
  byErrorClass: Record<string, number>;
}

/**
 * Returns detailed stats about pending outbox operations.
 */
export async function getOutboxStats(db: BookVaultDexie): Promise<OutboxStats> {
  const entries = await db.outbox.toArray();

  const byEntity: Record<string, number> = {};
  const byOp: Record<string, number> = {};
  const byErrorClass: Record<string, number> = {};

  for (const e of entries) {
    byEntity[e.entityType] = (byEntity[e.entityType] ?? 0) + 1;
    byOp[e.op] = (byOp[e.op] ?? 0) + 1;
    const ec = e.errorClass ?? "none";
    byErrorClass[ec] = (byErrorClass[ec] ?? 0) + 1;
  }

  return { total: entries.length, byEntity, byOp, byErrorClass };
}
