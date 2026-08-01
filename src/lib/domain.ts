export interface Book {
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

export interface Note {
  bookId: string;
  body: string;
  revision: number;
  baseRevision: number;
  deletedAt: number | null;
  syncStatus: "synced" | "pending" | "conflict" | "failed";
  updatedAt: number;
  updatedByDeviceId: string;
}

export interface ReadingState {
  bookId: string;
  page: number;
  percent: number;
  revision: number;
  baseRevision: number;
  updatedAt: number;
  deviceId: string;
  syncStatus: "synced" | "pending" | "conflict" | "failed";
}

export type SyncScope = "local" | "cloud";
export type SyncStatus = "synced" | "pending" | "conflict" | "failed";
export type FileSyncStatus = "not_downloaded" | "downloading" | "present" | "failed";
