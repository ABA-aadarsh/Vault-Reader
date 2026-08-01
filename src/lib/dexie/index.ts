export { BookVaultDexie } from "./schema";
export type {
  BookEntry,
  NoteEntry,
  ReadingStateEntry,
  FileEntry,
  ImageEntry,
  OutboxEntry,
  ConflictEntry,
  SyncStateEntry,
} from "./types";
export {
  openUserDb,
  getDb,
  closeUserDb,
  UserDbProvider,
  useDb,
  useUserId,
} from "./db";
export type { Book, Note, ReadingState, SyncScope, SyncStatus, FileSyncStatus } from "../domain";
export {
  bookToDomain,
  bookToDexie,
  noteToDomain,
  noteToDexie,
  readingStateToDomain,
  readingStateToDexie,
} from "../mappers";
