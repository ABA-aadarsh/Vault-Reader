export interface BookEntry {
  id: string;
  title: string;
  author: string;
  tags: string[];
  isFavourite: boolean;
  fileId: string;
  imageId: string | null;
  syncScope: "local" | "cloud";
  revision: number;
  baseRevision: number;
  deletedAt: number | null;
  fileSyncStatus: "not_downloaded" | "downloading" | "present" | "failed";
  coverSyncStatus: "not_downloaded" | "downloading" | "present" | "failed";
  syncStatus: "synced" | "pending" | "conflict" | "failed";
  updatedAt: number;
  updatedByDeviceId: string;
  origin?: string;
}

export interface NoteEntry {
  bookId: string;
  body: string;
  revision: number;
  baseRevision: number;
  deletedAt: number | null;
  syncStatus: "synced" | "pending" | "conflict" | "failed";
  updatedAt: number;
  updatedByDeviceId: string;
}

export interface ReadingStateEntry {
  bookId: string;
  page: number;
  percent: number;
  revision: number;
  baseRevision: number;
  updatedAt: number;
  deviceId: string;
  syncStatus: "synced" | "pending" | "conflict" | "failed";
}

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
}

export interface SyncStateEntry {
  key: string;
  value: unknown;
}
