import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BookVaultDexie } from "@/data/dexie/schema";
import type { Book } from "@/data/domain";
import { searchLocal } from "@/features/Search/data/localSearch";

let db: BookVaultDexie;

beforeEach(async () => {
  db = new BookVaultDexie("test-local-search");
  await db.open();
  await db.books.clear();
  await db.notes.clear();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

function makeBook(overrides: Partial<Book> & { id: string }): Book {
  return {
    title: "Untitled",
    author: "",
    tags: [],
    isFavourite: false,
    fileId: `file-${overrides.id}`,
    imageId: null,
    syncScope: "cloud",
    revision: 1,
    baseRevision: 1,
    deletedAt: null,
    fileSyncStatus: "not_downloaded",
    coverSyncStatus: "not_downloaded",
    syncStatus: "synced",
    updatedAt: Date.now(),
    updatedByDeviceId: "",
    ...overrides,
  };
}

describe("searchLocal — field matching", () => {
  it("returns nothing for an empty query", async () => {
    await db.books.add(makeBook({ id: "b1", title: "Dune" }));
    expect(await searchLocal(db, "   ")).toEqual([]);
  });

  it("matches by title, author and tag", async () => {
    await db.books.add(makeBook({ id: "b1", title: "The Hobbit", author: "Tolkien", tags: ["fantasy"] }));
    await db.books.add(makeBook({ id: "b2", title: "Dune", author: "Herbert", tags: ["sci-fi"] }));

    const byTitle = await searchLocal(db, "hobbit");
    expect(byTitle).toHaveLength(1);
    expect(byTitle[0].bookId).toBe("b1");
    expect(byTitle[0].kind).toBe("book");

    const byAuthor = await searchLocal(db, "herbert");
    expect(byAuthor.map((hit) => hit.bookId)).toEqual(["b2"]);

    const byTag = await searchLocal(db, "fantasy");
    expect(byTag.map((hit) => hit.bookId)).toEqual(["b1"]);
  });

  it("ranks exact matches above prefixes above substrings", async () => {
    await db.books.add(makeBook({ id: "exact", title: "Dune" }));
    await db.books.add(makeBook({ id: "prefix", title: "Dune Messiah" }));
    await db.books.add(makeBook({ id: "substring", title: "Children of Dune" }));

    const hits = await searchLocal(db, "dune");
    expect(hits.map((hit) => hit.bookId)).toEqual(["exact", "prefix", "substring"]);
  });

  it("matches multi-term queries across a field", async () => {
    await db.books.add(makeBook({ id: "b1", title: "The Lord of the Rings" }));
    const hits = await searchLocal(db, "lord rings");
    expect(hits.map((hit) => hit.bookId)).toEqual(["b1"]);
  });
});

describe("searchLocal — notes", () => {
  it("returns a note hit with a snippet when only the body matches", async () => {
    await db.books.add(makeBook({ id: "b1", title: "Meditations", author: "Marcus Aurelius" }));
    await db.notes.add({
      bookId: "b1",
      body: "On the shortness of life and the importance of focus.",
      revision: 1,
      baseRevision: 1,
      deletedAt: null,
      syncStatus: "synced",
      updatedAt: Date.now(),
      updatedByDeviceId: "",
    });

    const hits = await searchLocal(db, "shortness");
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("note");
    if (hits[0].kind === "note") {
      expect(hits[0].snippet).toContain("shortness");
      expect(hits[0].title).toBe("Meditations");
    }
  });

  it("prefers a metadata hit over a note hit for the same book", async () => {
    await db.books.add(makeBook({ id: "b1", title: "Dune" }));
    await db.notes.add({
      bookId: "b1",
      body: "Dune is also mentioned in the body.",
      revision: 1,
      baseRevision: 1,
      deletedAt: null,
      syncStatus: "synced",
      updatedAt: Date.now(),
      updatedByDeviceId: "",
    });

    const hits = await searchLocal(db, "dune");
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("book");
  });
});

describe("searchLocal — exclusions and limits", () => {
  it("excludes soft-deleted books and their notes", async () => {
    await db.books.add(makeBook({ id: "gone", title: "Ghost Book", deletedAt: Date.now() }));
    await db.notes.add({
      bookId: "gone",
      body: "Ghost note body",
      revision: 1,
      baseRevision: 1,
      deletedAt: null,
      syncStatus: "synced",
      updatedAt: Date.now(),
      updatedByDeviceId: "",
    });

    expect(await searchLocal(db, "ghost")).toEqual([]);
  });

  it("respects the limit", async () => {
    for (let i = 0; i < 12; i += 1) {
      await db.books.add(makeBook({ id: `b${i}`, title: `Saga volume ${i}` }));
    }

    const hits = await searchLocal(db, "saga", 5);
    expect(hits).toHaveLength(5);
  });

  it("returns the highest-scoring hit first", async () => {
    await db.books.add(makeBook({ id: "b1", title: "Saga" }));
    await db.books.add(makeBook({ id: "b2", title: "Saga volume two" }));

    const hits = await searchLocal(db, "saga");
    expect(hits[0].bookId).toBe("b1");
  });
});
