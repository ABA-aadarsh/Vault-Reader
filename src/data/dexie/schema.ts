import Dexie, { Table } from "dexie";
import type { Book, Note, ReadingState } from "../domain";
import {
  FileEntry,
  ImageEntry,
  OutboxEntry,
  ConflictEntry,
  SyncStateEntry,
} from "./types";

export class BookVaultDexie extends Dexie {
  books!: Table<Book>;
  notes!: Table<Note>;
  readingState!: Table<ReadingState>;
  files!: Table<FileEntry>;
  images!: Table<ImageEntry>;
  outbox!: Table<OutboxEntry>;
  conflicts!: Table<ConflictEntry>;
  syncState!: Table<SyncStateEntry>;

  constructor(userId: string) {
    super(`bookVaultDB:${userId}`);
    this.version(2).stores({
      books: "id, fileId, title, syncScope, syncStatus, deletedAt, updatedAt",
    });
    this.version(3).stores({
      books: "id, fileId, title, syncScope, syncStatus, deletedAt, updatedAt",
      notes: "bookId, syncStatus, deletedAt, updatedAt",
      readingState: "bookId, updatedAt",
      files: "fileId",
      images: "imageId",
      outbox: "++id, entityType, entityId, createdAt, nextAttemptAt",
      conflicts: "++id, entityType, entityId, bookId, status, createdAt",
      syncState: "key",
    });
  }
}
