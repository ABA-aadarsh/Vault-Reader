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
export { createBook, listBooks, listCloudBooks, getBook, getBookByFileId, updateBook, softDeleteBook, restoreBook, hardPurgeLocal, promoteToCloud } from "../books";
export type { CreateBookParams } from "../books";
export { getNote, upsertNote, deleteNote } from "../notes";
export { getReadingState, setPage } from "../readingState";
export { getFileBlob, removeFile, hasFile } from "../files";
export { getImageBlob, removeImage, hasImage } from "../images";
export { enqueue, inspectOutbox, getPendingCount, getOutboxStats } from "../outbox";
export type { EnqueueParams, OutboxStats } from "../outbox";
