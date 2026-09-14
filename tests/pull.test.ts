import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { BookVaultDexie } from "@/lib/dexie/schema";
import { pullBooks, pullNotes } from "@/features/Sync/pull";

function mockSupabaseQuery(rows: Record<string, unknown>[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    then: (resolve: (val: { data: Record<string, unknown>[] | null; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return chain;
}

vi.mock("@/features/Supabase/index", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

let db: BookVaultDexie;

beforeEach(async () => {
  db = new BookVaultDexie("test-pull");
  await db.open();
  await db.outbox.clear();
  await db.books.clear();
  await db.notes.clear();
  await db.readingState.clear();
  await db.files.clear();
  await db.images.clear();
  await db.conflicts.clear();
  await db.syncState.clear();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

function cloudRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "book-1",
    user_id: "user-1",
    title: "Cloud Book",
    author: "Cloud Author",
    tags: ["cloud"],
    is_favourite: false,
    file_id: "file-1",
    image_id: "img-1",
    revision: 2,
    deleted_at: null,
    updated_at: "2025-01-15T10:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("pull — book snapshot apply", () => {
  it("creates a new book locally when pulling from cloud", async () => {
    const { supabase } = await import("@/features/Supabase/index");
    const row = cloudRow();
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([row]));

    const result = await pullBooks(db, "user-1");
    expect(result.count).toBe(1);

    const book = await db.books.get("book-1");
    expect(book).toBeDefined();
    expect(book!.title).toBe("Cloud Book");
    expect(book!.syncScope).toBe("cloud");
    expect(book!.revision).toBe(2);
    expect(book!.baseRevision).toBe(2);
    expect(book!.syncStatus).toBe("synced");
  });

  it("updates existing book when cloud revision is newer", async () => {
    await db.books.add({
      id: "book-1",
      title: "Old Title",
      author: "Old",
      tags: ["old"],
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
    });

    const { supabase } = await import("@/features/Supabase/index");
    const row = cloudRow({ title: "Updated Title", revision: 3 });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([row]));

    const result = await pullBooks(db, "user-1");
    expect(result.count).toBe(1);

    const book = await db.books.get("book-1");
    expect(book!.title).toBe("Updated Title");
    expect(book!.revision).toBe(3);
  });

  it("skips apply when pending outbox exists for entity", async () => {
    await db.outbox.add({
      entityType: "book",
      entityId: "book-1",
      op: "upsert",
      payload: { title: "Local Edit" },
      baseRevision: 1,
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
    });

    const { supabase } = await import("@/features/Supabase/index");
    const row = cloudRow({ revision: 5 });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([row]));

    await pullBooks(db, "user-1");

    const book = await db.books.get("book-1");
    expect(book).toBeUndefined();
  });

  it("does not regress local revision (baseRevision guard)", async () => {
    await db.books.add({
      id: "book-1",
      title: "Same",
      author: "Same",
      tags: [],
      isFavourite: false,
      fileId: "f1",
      imageId: null,
      syncScope: "cloud",
      revision: 5,
      baseRevision: 5,
      deletedAt: null,
      fileSyncStatus: "present",
      coverSyncStatus: "not_downloaded",
      syncStatus: "synced",
      updatedAt: Date.now(),
      updatedByDeviceId: "",
    });

    const { supabase } = await import("@/features/Supabase/index");
    const row = cloudRow({ revision: 3 });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([row]));

    await pullBooks(db, "user-1");

    const book = await db.books.get("book-1");
    expect(book!.revision).toBe(5);
    expect(book!.baseRevision).toBe(5);
  });
});

describe("pull — tombstone apply", () => {
  it("sets deletedAt and clears fileSyncStatus on tombstone", async () => {
    await db.books.add({
      id: "book-1",
      title: "Deleted",
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
    });

    const { supabase } = await import("@/features/Supabase/index");
    const row = cloudRow({
      deleted_at: "2025-06-01T00:00:00Z",
      revision: 2,
    });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([row]));

    await pullBooks(db, "user-1");

    const book = await db.books.get("book-1");
    expect(book!.deletedAt).not.toBeNull();
    expect(book!.deletedAt! > 0).toBe(true);
  });

  it("tombstone creates book locally if it did not exist before", async () => {
    const { supabase } = await import("@/features/Supabase/index");
    const row = cloudRow({
      deleted_at: "2025-06-01T00:00:00Z",
      revision: 1,
    });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([row]));

    await pullBooks(db, "user-1");

    const book = await db.books.get("book-1");
    expect(book).toBeDefined();
    expect(book!.deletedAt).not.toBeNull();
  });

  it("tombstone on existing book resets blob statuses and removes blobs", async () => {
    await db.books.add({
      id: "book-1",
      title: "Deleted",
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
    });
    await db.files.add({ fileId: "file-1", file: new Blob(["pdf"]) });
    await db.images.add({ imageId: "img-1", image: new Blob(["img"]) });

    const { supabase } = await import("@/features/Supabase/index");
    const row = cloudRow({
      deleted_at: "2025-06-01T00:00:00Z",
      revision: 2,
    });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([row]));

    await pullBooks(db, "user-1");

    const book = await db.books.get("book-1");
    expect(book!.fileSyncStatus).toBe("not_downloaded");
    expect(book!.coverSyncStatus).toBe("not_downloaded");
    expect(await db.files.toArray()).toHaveLength(0);
    expect(await db.images.toArray()).toHaveLength(0);
  });
});

describe("pull — note apply", () => {
  it("creates a note when book exists locally", async () => {
    await db.books.add({
      id: "book-1",
      title: "Book",
      author: "A",
      tags: [],
      isFavourite: false,
      fileId: "f1",
      imageId: null,
      syncScope: "cloud",
      revision: 1,
      baseRevision: 1,
      deletedAt: null,
      fileSyncStatus: "present",
      coverSyncStatus: "not_downloaded",
      syncStatus: "synced",
      updatedAt: Date.now(),
      updatedByDeviceId: "",
    });

    const { supabase } = await import("@/features/Supabase/index");
    const noteRow = {
      book_id: "book-1",
      user_id: "user-1",
      body: "Hello world",
      revision: 1,
      deleted_at: null,
      updated_at: "2025-01-15T10:00:00Z",
    };
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([noteRow]));

    const result = await pullNotes(db, "user-1");
    expect(result.count).toBe(1);

    const note = await db.notes.get("book-1");
    expect(note).toBeDefined();
    expect(note!.body).toBe("Hello world");
    expect(note!.syncStatus).toBe("synced");
  });

  it("skips note when book does not exist locally", async () => {
    const { supabase } = await import("@/features/Supabase/index");
    const noteRow = {
      book_id: "missing-book",
      user_id: "user-1",
      body: "Hello world",
      revision: 1,
      deleted_at: null,
      updated_at: "2025-01-15T10:00:00Z",
    };
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([noteRow]));

    const result = await pullNotes(db, "user-1");
    expect(result.count).toBe(0);
  });

  it("updates existing note when cloud revision is newer", async () => {
    await db.books.add({
      id: "book-1",
      title: "Book",
      author: "A",
      tags: [],
      isFavourite: false,
      fileId: "f1",
      imageId: null,
      syncScope: "cloud",
      revision: 1,
      baseRevision: 1,
      deletedAt: null,
      fileSyncStatus: "present",
      coverSyncStatus: "not_downloaded",
      syncStatus: "synced",
      updatedAt: Date.now(),
      updatedByDeviceId: "",
    });

    await db.notes.add({
      bookId: "book-1",
      body: "Old note",
      revision: 1,
      baseRevision: 1,
      deletedAt: null,
      syncStatus: "synced",
      updatedAt: Date.now(),
      updatedByDeviceId: "",
    });

    const { supabase } = await import("@/features/Supabase/index");
    const noteRow = {
      book_id: "book-1",
      user_id: "user-1",
      body: "Updated note",
      revision: 2,
      deleted_at: null,
      updated_at: "2025-06-01T00:00:00Z",
    };
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([noteRow]));

    await pullNotes(db, "user-1");

    const note = await db.notes.get("book-1");
    expect(note!.body).toBe("Updated note");
    expect(note!.revision).toBe(2);
  });
});

describe("pull — cursor advancement", () => {
  it("stores cursor after processing rows", async () => {
    const { supabase } = await import("@/features/Supabase/index");
    const row = cloudRow({ updated_at: "2025-03-01T00:00:00Z" });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([row]));

    await pullBooks(db, "user-1");

    const cursorEntry = await db.syncState.get("booksPullCursor");
    expect(cursorEntry).toBeDefined();
    expect((cursorEntry!.value as { updatedAt: string }).updatedAt).toBe("2025-03-01T00:00:00Z");
    expect((cursorEntry!.value as { id: string }).id).toBe("book-1");
  });

  it("does not advance cursor when all rows are skipped (pending)", async () => {
    await db.outbox.add({
      entityType: "book",
      entityId: "book-1",
      op: "upsert",
      payload: { title: "Edit" },
      baseRevision: 1,
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
    });

    const { supabase } = await import("@/features/Supabase/index");
    const row = cloudRow();
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabaseQuery([row]));

    await pullBooks(db, "user-1");

    const cursorEntry = await db.syncState.get("booksPullCursor");
    expect(cursorEntry).toBeUndefined();
  });
});