export interface FileEntry {
  fileId: string;
  file: Blob;
}

export interface ImageEntry {
  imageId: string;
  image: Blob;
}

export interface OutboxEntry {
  id?: number;
  entityType: "book" | "note" | "readingState" | "fileUpload";
  entityId: string;
  op: "upsert" | "delete" | "promote";
  payload: Record<string, unknown>;
  baseRevision: number;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  errorClass?: "transient" | "auth" | "conflict" | "permanent";
}

export interface ConflictEntry {
  id?: number;
  entityType: "book" | "note" | "readingState";
  entityId: string;
  bookId: string;
  localSnapshot: Record<string, unknown>;
  remoteSnapshot: Record<string, unknown>;
  reason:
    | "cas_mismatch"
    | "update_vs_delete"
    | "field_clash"
    | "note_body";
  createdAt: number;
  status: "open" | "resolved";
  clashingFields?: string[];
}

export interface SyncStateEntry {
  key: string;
  value: unknown;
}