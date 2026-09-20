import type { BookVaultDexie } from "@/data/dexie/schema";
import type { OutboxEntry } from "@/data/dexie/types";
import {
  rpcUpsertBook,
  rpcUpsertNote,
  rpcUpsertReadingState,
  softDeleteBook,
  softDeleteNote,
} from "./rpc";
import { uploadFileIfMissing, uploadImageIfMissing } from "./upload";

export async function handleBookUpsert(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const book = await db.books.where("id").equals(entry.entityId).first();
  if (!book) throw new Error("Book not found locally");

  const payload = {
    title: book.title,
    author: book.author,
    tags: book.tags,
    isFavourite: book.isFavourite,
    fileId: book.fileId,
    imageId: book.imageId,
    ...entry.payload,
  };

  await uploadFileIfMissing(db, userId, entry.entityId, payload.fileId as string);

  if (payload.imageId) {
    await uploadImageIfMissing(db, userId, entry.entityId, payload.imageId as string);
  }

  const { revision } = await rpcUpsertBook(
    entry.entityId,
    userId,
    entry.baseRevision,
    payload,
  );

  await db.books.where("id").equals(entry.entityId).modify({
    syncStatus: "synced",
    revision,
    baseRevision: revision,
    baseSnapshot: {
      title: book.title,
      author: book.author,
      tags: book.tags,
      isFavourite: book.isFavourite,
    },
  });
}

export async function handleBookDelete(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const book = await db.books.where("id").equals(entry.entityId).first();
  if (!book) throw new Error("Book not found locally");

  const { revision } = await softDeleteBook(entry.entityId, userId, book.baseRevision);

  await db.books.where("id").equals(entry.entityId).modify({
    syncStatus: "synced",
    revision,
    baseRevision: revision,
    baseSnapshot: {
      title: book.title,
      author: book.author,
      tags: book.tags,
      isFavourite: book.isFavourite,
    },
  });
}

export async function handleBookPromote(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const book = await db.books.where("id").equals(entry.entityId).first();
  if (!book) throw new Error("Book not found locally");

  const payload = {
    title: book.title,
    author: book.author,
    tags: book.tags,
    isFavourite: book.isFavourite,
    fileId: book.fileId,
    imageId: book.imageId,
    ...entry.payload,
  };

  await uploadFileIfMissing(db, userId, entry.entityId, payload.fileId as string);

  if (payload.imageId) {
    await uploadImageIfMissing(db, userId, entry.entityId, payload.imageId as string);
  }

  const { revision } = await rpcUpsertBook(
    entry.entityId,
    userId,
    0, // strict insert
    payload,
  );

  await db.books.where("id").equals(entry.entityId).modify({
    syncScope: "cloud",
    syncStatus: "synced",
    revision,
    baseRevision: revision,
    baseSnapshot: {
      title: book.title,
      author: book.author,
      tags: book.tags,
      isFavourite: book.isFavourite,
    },
  });
}

export async function handleNoteUpsert(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const body = (entry.payload.body as string) ?? "";
  const { revision } = await rpcUpsertNote(
    entry.entityId,
    userId,
    entry.baseRevision,
    body,
  );

  await db.notes.where("bookId").equals(entry.entityId).modify({
    syncStatus: "synced",
    revision,
    baseRevision: revision,
    baseSnapshot: { body },
  });
}

export async function handleNoteDelete(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const note = await db.notes.where("bookId").equals(entry.entityId).first();
  if (!note) return;

  const { revision } = await softDeleteNote(
    entry.entityId,
    userId,
    note.baseRevision,
  );

  await db.notes.where("bookId").equals(entry.entityId).modify({
    syncStatus: "synced",
    revision,
    baseRevision: revision,
  });
}

export async function handleReadingStateUpsert(
  db: BookVaultDexie,
  userId: string,
  entry: OutboxEntry,
): Promise<void> {
  const state = await db.readingState.get(entry.entityId);
  if (!state) throw new Error("Reading state not found locally");

  const { revision } = await rpcUpsertReadingState(
    entry.entityId,
    userId,
    entry.baseRevision,
    entry.payload.page as number,
    entry.payload.percent as number,
  );

  await db.readingState.update(entry.entityId, {
    syncStatus: "synced",
    revision,
    baseRevision: revision,
  });
}
