import type { OutboxEntry } from "@/lib/dexie/types";

export const MAX_ATTEMPTS = 20;
export const BACKOFF_CAP_MS = 60_000;
export const MAX_OUTBOX_BATCH = 10;

export type ErrorClass = "transient" | "auth" | "conflict" | "permanent";

export function backoffMs(attempts: number): number {
  const exp = Math.min(attempts, 6); // 2^6 = 64 → capped at 60s
  return Math.min(1000 * 2 ** exp, BACKOFF_CAP_MS);
}

export function classifyError(error: unknown): ErrorClass {
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

export function sortKey(e: OutboxEntry): number {
  return TYPE_ORDER[e.entityType] * 10 + OP_ORDER[e.op];
}