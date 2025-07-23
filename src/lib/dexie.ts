import Dexie, { Table } from "dexie";

export interface FileEntry {
  id?: number;
  fileId: string;
  file: File;
  createdAt: string;
}

export interface MetadataEntry {
  id?: number;
  docId: string;
  userId: string;
  title: string;
  author: string;
  tags: string[];
  fileId: string;
  fileUrl: string;
  isFavourite: boolean;
  verified: string;
  note: string;
  image: string;
}

export interface PermissionEntry {
  id?: number;
  fileId: string;
  permissioned_to: string[];
}

class BookVaultDexie extends Dexie {
  files!: Table<FileEntry>;
  metadata!: Table<MetadataEntry>;
  permissions!: Table<PermissionEntry>;

  constructor() {
    super("bookVaultDB");
    this.version(1).stores({
      files: "++id, fileId, createdAt",
      metadata: "++id, fileId, userId, title",
      permissions: "++id, fileId",
    });
  }
}

export const db = new BookVaultDexie();
