import { describe, it, expect, afterEach } from "vitest";
import { BookVaultDexie } from "@/data/dexie/schema";

let dbA: BookVaultDexie;
let dbB: BookVaultDexie;

afterEach(async () => {
  if (dbA) {
    await dbA.close();
    await dbA.delete();
  }
  if (dbB) {
    await dbB.close();
    await dbB.delete();
  }
});

async function seedBook(db: BookVaultDexie, bookId: string, title: string) {
  await db.books.add({
    id: bookId,
    title,
    author: "Author",
    tags: [],
    isFavourite: false,
    fileId: "f1",
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

describe("per-user DB isolation", () => {
  it("two users have separate databases", async () => {
    dbA = new BookVaultDexie("user-alpha");
    dbB = new BookVaultDexie("user-beta");
    await dbA.open();
    await dbB.open();

    await seedBook(dbA, "a1", "Book A");
    await seedBook(dbB, "b1", "Book B");

    const booksA = await dbA.books.toArray();
    const booksB = await dbB.books.toArray();

    expect(booksA).toHaveLength(1);
    expect(booksA[0].title).toBe("Book A");
    expect(booksA[0].id).toBe("a1");

    expect(booksB).toHaveLength(1);
    expect(booksB[0].title).toBe("Book B");
    expect(booksB[0].id).toBe("b1");
  });

  it("notes are isolated per user", async () => {
    dbA = new BookVaultDexie("user-alpha");
    dbB = new BookVaultDexie("user-beta");
    await dbA.open();
    await dbB.open();

    await seedBook(dbA, "a1", "Book A");
    await seedBook(dbB, "b1", "Book B");

    await dbA.notes.add({
      bookId: "a1",
      body: "Note A",
      revision: 1,
      baseRevision: 1,
      deletedAt: null,
      syncStatus: "synced",
      updatedAt: Date.now(),
      updatedByDeviceId: "",
    });

    await dbB.notes.add({
      bookId: "b1",
      body: "Note B",
      revision: 1,
      baseRevision: 1,
      deletedAt: null,
      syncStatus: "synced",
      updatedAt: Date.now(),
      updatedByDeviceId: "",
    });

    const notesA = await dbA.notes.toArray();
    const notesB = await dbB.notes.toArray();

    expect(notesA).toHaveLength(1);
    expect(notesA[0].body).toBe("Note A");
    expect(notesB).toHaveLength(1);
    expect(notesB[0].body).toBe("Note B");
  });

  it("outbox entries are isolated per user", async () => {
    dbA = new BookVaultDexie("user-alpha");
    dbB = new BookVaultDexie("user-beta");
    await dbA.open();
    await dbB.open();

    await dbA.outbox.add({
      entityType: "book",
      entityId: "a1",
      op: "upsert",
      payload: { title: "A" },
      baseRevision: 1,
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
    });

    const outboxA = await dbA.outbox.toArray();
    const outboxB = await dbB.outbox.toArray();

    expect(outboxA).toHaveLength(1);
    expect(outboxB).toHaveLength(0);
  });

  it("closing one DB does not affect the other", async () => {
    dbA = new BookVaultDexie("user-alpha");
    dbB = new BookVaultDexie("user-beta");
    await dbA.open();
    await dbB.open();

    await seedBook(dbA, "a1", "Book A");
    await seedBook(dbB, "b1", "Book B");

    dbA.close();

    const booksB = await dbB.books.toArray();
    expect(booksB).toHaveLength(1);
    expect(booksB[0].title).toBe("Book B");

    dbB.close();
  });

  it("DB names include userId for isolation", () => {
    dbA = new BookVaultDexie("user-alpha");
    dbB = new BookVaultDexie("user-beta");

    expect(dbA.name).toBe("bookVaultDB:user-alpha");
    expect(dbB.name).toBe("bookVaultDB:user-beta");
  });

  it("multiple open/close cycles work correctly", async () => {
    dbA = new BookVaultDexie("user-alpha");
    await dbA.open();
    await seedBook(dbA, "a1", "First");
    dbA.close();

    dbA = new BookVaultDexie("user-alpha");
    await dbA.open();
    const books = await dbA.books.toArray();
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe("First");
  });
});
