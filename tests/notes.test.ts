import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BookVaultDexie } from "@/lib/dexie/schema";
import type { BookEntry, NoteEntry } from "@/lib/dexie/types";
import { upsertNote, deleteNote } from "@/lib/notes";

let db: BookVaultDexie;

beforeEach(async () => {
  db = new BookVaultDexie("test-notes");
  await db.open();
  await db.outbox.clear();
  await db.notes.clear();
  await db.books.clear();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

function seedBook(overrides: Partial<BookEntry> = {}) {
  return db.books.add({
    id: "book-1",
    title: "Title",
    author: "Author",
    tags: [],
    isFavourite: false,
    fileId: "file-1",
    imageId: null,
    syncScope: "local",
    revision: 0,
    baseRevision: 0,
    deletedAt: null,
    fileSyncStatus: "present",
    coverSyncStatus: "present",
    syncStatus: "synced",
    updatedAt: Date.now(),
    updatedByDeviceId: "",
    ...overrides,
  });
}

function seedNote(overrides: Partial<NoteEntry> = {}) {
  return db.notes.add({
    bookId: "book-1",
    body: "original",
    revision: 1,
    baseRevision: 1,
    deletedAt: null,
    syncStatus: "synced",
    updatedAt: Date.now(),
    updatedByDeviceId: "",
    baseSnapshot: { body: "original" },
    ...overrides,
  });
}

describe("upsertNote", () => {
  it("creates a note for a local book without enqueueing to outbox", async () => {
    await seedBook();

    await upsertNote(db, "book-1", "hello");

    const note = await db.notes.get("book-1");
    expect(note).toBeDefined();
    expect(note!.body).toBe("hello");
    expect(note!.syncStatus).toBe("synced");
    expect(await db.outbox.count()).toBe(0);
  });

  it("updates an existing note for a local book", async () => {
    await seedBook();
    await seedNote();

    await upsertNote(db, "book-1", "updated");

    const note = await db.notes.get("book-1");
    expect(note!.body).toBe("updated");
    expect(await db.outbox.count()).toBe(0);
  });

  it("enqueues an outbox upsert for a cloud book and marks pending", async () => {
    await seedBook({ syncScope: "cloud" });

    await upsertNote(db, "book-1", "cloud note");

    const note = await db.notes.get("book-1");
    expect(note!.syncStatus).toBe("pending");

    const entries = await db.outbox.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].entityType).toBe("note");
    expect(entries[0].entityId).toBe("book-1");
    expect(entries[0].op).toBe("upsert");
    expect(entries[0].payload.body).toBe("cloud note");
    expect(entries[0].baseRevision).toBe(0);
  });

  it("enqueues an update against the existing baseRevision for a cloud book", async () => {
    await seedBook({ syncScope: "cloud" });
    await seedNote({ syncStatus: "synced" });

    await upsertNote(db, "book-1", "edited");

    const entries = await db.outbox.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].op).toBe("upsert");
    expect(entries[0].baseRevision).toBe(1);
    expect(entries[0].payload.body).toBe("edited");
  });

  it("throws when the note has an unresolved conflict", async () => {
    await seedBook({ syncScope: "cloud" });
    await seedNote({ syncStatus: "conflict" });

    await expect(upsertNote(db, "book-1", "nope")).rejects.toThrow(
      /unresolved conflict/i,
    );
  });
});

describe("deleteNote", () => {
  it("hard-deletes a note for a local book", async () => {
    await seedBook();
    await seedNote();

    await deleteNote(db, "book-1");

    expect(await db.notes.get("book-1")).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
  });

  it("soft-deletes and enqueues a delete for a cloud book", async () => {
    await seedBook({ syncScope: "cloud" });
    await seedNote();

    await deleteNote(db, "book-1");

    const note = await db.notes.get("book-1");
    expect(note).toBeDefined();
    expect(note!.deletedAt).not.toBeNull();
    expect(note!.syncStatus).toBe("pending");

    const entries = await db.outbox.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].entityType).toBe("note");
    expect(entries[0].op).toBe("delete");
    expect(entries[0].baseRevision).toBe(1);
  });

  it("throws when the note has an unresolved conflict", async () => {
    await seedBook({ syncScope: "cloud" });
    await seedNote({ syncStatus: "conflict" });

    await expect(deleteNote(db, "book-1")).rejects.toThrow(
      /unresolved conflict/i,
    );
  });

  it("is a no-op when no note exists", async () => {
    await seedBook();

    await deleteNote(db, "book-1");

    expect(await db.outbox.count()).toBe(0);
  });
});