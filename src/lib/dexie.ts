import Dexie, { Table } from "dexie";

export interface FileEntry {
  id?: number;
  fileId: string;
  file: Blob;
}

export interface MetadataEntry {
  docId: string;
  title: string;
  author: string;
  tags: string[];
  fileId: string;
  userId: string;
  version?: string;
  progress?: number;
  status?: string[];
  isFavourite: boolean;
  imageId?: string | null;
  verified?: string;
  origin?: string;
  note?: string;
  syncStatus?: 'synced' | 'pending';
  lastSyncedAt?: number;
}

export interface ImageEntry{
    id?: number;
  imageId: string | null;
  image: Blob;
}

export interface SyncQueueEntry {
  id?: number;
  type: 'create' | 'update' | 'delete';
  docId: string;
  payload: Record<string, any>;
  createdAt: number;
  attempts: number;
}

class BookVaultDexie extends Dexie {
  files!: Table<FileEntry>;
  metadata!: Table<MetadataEntry>;
  image!: Table<ImageEntry>;
  syncQueue!: Table<SyncQueueEntry>;

  constructor() {
    super("bookVaultDB");
    this.version(1).stores({
      files: "++id, fileId",
      metadata: "docId, fileId, userId, title",
      image: "++id, imageId",
      syncQueue: "++id, docId, createdAt",
    });
  }
}

export const db = new BookVaultDexie();
