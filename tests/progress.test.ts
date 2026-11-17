import { afterEach, describe, expect, it } from "vitest";
import { BookVaultDexie } from "@/data/dexie/schema";
import { flushReadingState, getReadingState, setPage } from "@/features/Reader/data/readingState";

let db: BookVaultDexie;

afterEach(async () => {
  await flushReadingState();
  if (db) {
    await db.close();
    await db.delete();
  }
});

async function seedBook(database: BookVaultDexie, bookId: string): Promise<void> {
  await database.books.add({
    id: bookId,
    title: "Progress book",
    author: "Author",
    tags: [],
    isFavourite: false,
    fileId: `file-${bookId}`,
    imageId: null,
    syncScope: "local",
    revision: 0,
    baseRevision: 0,
    deletedAt: null,
    fileSyncStatus: "not_downloaded",
    coverSyncStatus: "not_downloaded",
    syncStatus: "synced",
    updatedAt: Date.now(),
    updatedByDeviceId: "",
  });
}

async function makeDb(name: string): Promise<BookVaultDexie> {
  db = new BookVaultDexie(`${name}-${crypto.randomUUID()}`);
  return db;
}

describe("reading progress persistence", () => {
  it("writes the first position immediately", async () => {
    const database = await makeDb("progress-lead");
    await seedBook(database, "book-lead");

    await setPage(database, "book-lead", 3, 100);
    await flushReadingState();

    const state = await getReadingState(database, "book-lead");
    expect(state?.page).toBe(3);
    expect(state?.percent).toBe(3);
  });

  it("coalesces rapid page turns and persists the final page", async () => {
    const database = await makeDb("progress-trailing");
    await seedBook(database, "book-trailing");

    await setPage(database, "book-trailing", 2, 100);
    await flushReadingState();

    await setPage(database, "book-trailing", 5, 100);
    await setPage(database, "book-trailing", 7, 100);
    await setPage(database, "book-trailing", 9, 100);

    // Nothing has been written yet between flushes.
    const before = await getReadingState(database, "book-trailing");
    expect(before?.page).toBe(2);

    await flushReadingState();

    const after = await getReadingState(database, "book-trailing");
    expect(after?.page).toBe(9);
    expect(after?.percent).toBe(9);
  });

  it("flushes positions for multiple books", async () => {
    const database = await makeDb("progress-multi");
    await seedBook(database, "book-a");
    await seedBook(database, "book-b");

    await setPage(database, "book-a", 11, 50);
    await setPage(database, "book-b", 22, 50);
    await flushReadingState();

    const a = await getReadingState(database, "book-a");
    const b = await getReadingState(database, "book-b");
    expect(a?.page).toBe(11);
    expect(b?.page).toBe(22);
  });

  it("does not enqueue sync work for a local book", async () => {
    const database = await makeDb("progress-local");
    await seedBook(database, "book-local");

    await setPage(database, "book-local", 4, 10);
    await flushReadingState();

    const outbox = await database.outbox.toArray();
    expect(outbox).toHaveLength(0);
  });
});
