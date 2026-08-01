import Dexie, { Table } from "dexie";
import {
  BookEntry,
  NoteEntry,
  ReadingStateEntry,
  FileEntry,
  ImageEntry,
  OutboxEntry,
  ConflictEntry,
  SyncStateEntry,
} from "./types";

export class BookVaultDexie extends Dexie {
  books!: Table<BookEntry>;
  notes!: Table<NoteEntry>;
  readingState!: Table<ReadingStateEntry>;
  files!: Table<FileEntry>;
  images!: Table<ImageEntry>;
  outbox!: Table<OutboxEntry>;
  conflicts!: Table<ConflictEntry>;
  syncState!: Table<SyncStateEntry>;

  constructor(userId: string) {
    super(`bookVaultDB:${userId}`);
    this.version(1).stores({
      books: "id, title, syncScope, syncStatus, deletedAt, updatedAt",
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
