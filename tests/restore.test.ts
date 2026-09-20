import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BookVaultDexie } from "@/data/dexie/schema";
import type { Book } from "@/data/domain";
import { restoreBook, softDeleteBook } from "@/features/Books/data/books";

let db: BookVaultDexie;

beforeEach(async () => {
  db = new BookVaultDexie("test-restore");
  await db.open();
  await db.outbox.clear();
  await db.books.clear();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

function seedCloudBook(overrides: Partial<Book> = {}) {
  return db.books.add({
    id: "book-1",
    title: "Title",
    author: "Author",
    tags: [],
    isFavourite: false,
    fileId: "file-1",
    imageId: "img-1",
    syncScope: "cloud",
    revision: 1,
    baseRevision: 1,
    deletedAt: null,
    fileSyncStatus: "present",
    coverSyncStatus: "present",
    syncStatus: "synced",
    updatedAt: Date.now(),
    updatedByDeviceId: "",
    ...overrides,
  });
}

describe("restoreBook", () => {
  it("clears deletedAt, resets blob statuses and enqueues upsert", async () => {
    await seedCloudBook({ deletedAt: Date.now() });

    await restoreBook(db, "book-1");

    const book = await db.books.get("book-1");
    expect(book!.deletedAt).toBeNull();
    expect(book!.fileSyncStatus).toBe("not_downloaded");
    expect(book!.coverSyncStatus).toBe("not_downloaded");
    expect(book!.syncStatus).toBe("pending");

    const entries = await db.outbox.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].op).toBe("upsert");
    expect(entries[0].baseRevision).toBe(1);
  });

  it("replaces a pending delete with the restore upsert", async () => {
    await seedCloudBook();

    await softDeleteBook(db, "book-1");
    expect((await db.outbox.toArray())[0].op).toBe("delete");

    await restoreBook(db, "book-1");

    const entries = await db.outbox.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].op).toBe("upsert");
    expect(entries[0].baseRevision).toBe(1);

    const book = await db.books.get("book-1");
    expect(book!.deletedAt).toBeNull();
    expect(book!.syncStatus).toBe("pending");
  });
});
