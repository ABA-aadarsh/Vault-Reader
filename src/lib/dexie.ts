import Dexie, { Table } from "dexie";

export interface FileEntry {
  id?: number;
  fileId: string;
  file: File;
  
}

export interface MetadataEntry {
  docId: string;
  title: string;
  author: string;
  tags: string[];
  fileId: string;
  userId: string;
  version: string;
  progress: number;
  status: string[];
  isFavourite: boolean;
  imageUrl: string;
  verified: string;
  origin: string;
  note: string;
}


class BookVaultDexie extends Dexie {
  files!: Table<FileEntry>;
  metadata!: Table<MetadataEntry>;
 

  constructor() {
    super("bookVaultDB");
    this.version(1).stores({
      files: "++id, fileId",
      metadata: "docId, fileId, userId, title",
    });
  }
}

export const db = new BookVaultDexie();
