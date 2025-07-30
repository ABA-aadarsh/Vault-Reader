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
  version?: string;
  progress?: number;
  status?: string[];
  isFavourite: boolean;
  imageId?: string;
  verified?: string;
  origin?: string;
  note?: string;
}

export interface ImageEntry{
    id?: number;
  imageId: string;
  image: File;
}

class BookVaultDexie extends Dexie {
  files!: Table<FileEntry>;
  metadata!: Table<MetadataEntry>;
  image!: Table<ImageEntry>;
 

  constructor() {
    super("bookVaultDB");
    this.version(1).stores({
      files: "++id, fileId",
      metadata: "docId, fileId, userId, title",
      image: "++id, imageId",
    });
  }
}

export const db = new BookVaultDexie();
