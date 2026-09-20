import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { BookVaultDexie } from "@/data/dexie/schema";
import { enqueue } from "@/features/Sync/data/outbox";
import { pushOutbox } from "@/features/Sync/data/push";

const { storageFromMock, rpcMock, fromMock } = vi.hoisted(() => ({
  storageFromMock: vi.fn().mockReturnValue({
    list: vi.fn().mockResolvedValue({ data: [{ name: "placeholder" }], error: null }),
    upload: vi.fn().mockResolvedValue({ error: null }),
  }),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: { from: storageFromMock },
    rpc: rpcMock,
    from: fromMock,
  },
}));

let db: BookVaultDexie;

beforeEach(async () => {
  db = new BookVaultDexie("test-push");
  await db.open();
  await db.outbox.clear();
  await db.books.clear();
  await db.notes.clear();
  await db.readingState.clear();
  await db.files.clear();
  await db.images.clear();
  await db.conflicts.clear();
  await db.syncState.clear();

  rpcMock.mockReset();
  fromMock.mockReset();
  storageFromMock.mockReturnValue({
    list: vi.fn().mockResolvedValue({ data: [{ name: "file-1.pdf" }, { name: "img-1.png" }], error: null }),
    upload: vi.fn().mockResolvedValue({ error: null }),
  });
});

afterEach(async () => {
  db.close();
  await db.delete();
});

function seedBook(bookId: string, overrides: Record<string, unknown> = {}) {
  return db.books.add({
    id: bookId,
    title: "Test Book",
    author: "Author",
    tags: ["fiction"],
    isFavourite: false,
    fileId: "file-1",
    imageId: "img-1",
    syncScope: "cloud",
    revision: 1,
    baseRevision: 1,
    deletedAt: null,
    fileSyncStatus: "present",
    coverSyncStatus: "present",
    syncStatus: "pending",
    updatedAt: Date.now(),
    updatedByDeviceId: "",
    ...overrides,
  });
}

describe("push — error classification", () => {
  it("classifies CAS conflict errors correctly", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "CAS conflict: revision mismatch" },
    });

    const remoteBookChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "b1",
          title: "Cloud",
          author: "Cloud",
          tags: [],
          is_favourite: false,
          file_id: "f1",
          image_id: null,
          revision: 3,
          deleted_at: null,
          updated_at: "2025-01-15T10:00:00Z",
        },
        error: null,
      }),
    };
    fromMock.mockReturnValue(remoteBookChain);

    await seedBook("b1", { baseSnapshot: { title: "Test Book", author: "Author", tags: ["fiction"], isFavourite: false } });
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "New" },
      baseRevision: 1,
    });

    const result = await pushOutbox(db, "user-1");

    const entry = await db.outbox.where("entityId").equals("b1").first();
    const conflict = await db.conflicts.where("entityId").equals("b1").first();
    expect(conflict).toBeDefined();
    expect(conflict!.reason).toBe("field_clash");
  });

  it("classifies 401 as auth error and pauses engine", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "401 Unauthorized" },
    });

    await seedBook("b1");
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "New" },
      baseRevision: 0,
    });

    const result = await pushOutbox(db, "user-1");
    expect(result.paused).toBe(true);
    expect(result.pushed).toBe(0);

    const entry = await db.outbox.where("entityId").equals("b1").first();
    expect(entry!.errorClass).toBe("auth");
  });

  it("classifies 404 as permanent error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "404 not found" },
    });

    await seedBook("b1");
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "New" },
      baseRevision: 0,
    });

    const result = await pushOutbox(db, "user-1");
    expect(result.failed).toBe(1);

    const entry = await db.outbox.where("entityId").equals("b1").first();
    expect(entry!.errorClass).toBe("permanent");
  });

  it("classifies network errors as transient", async () => {
    rpcMock.mockRejectedValue(new Error("Failed to fetch"));

    await seedBook("b1");
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "New" },
      baseRevision: 0,
    });

    const result = await pushOutbox(db, "user-1");
    expect(result.failed).toBe(1);

    const entry = await db.outbox.where("entityId").equals("b1").first();
    expect(entry!.errorClass).toBe("transient");
    expect(entry!.lastError).toContain("Failed to fetch");
  });

  it("max attempts promotes transient to permanent", async () => {
    rpcMock.mockRejectedValue(new Error("500 Internal Server Error"));

    await seedBook("b1");
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "New" },
      baseRevision: 0,
    });

    const getEntryId = async () => {
      const entry = await db.outbox.where("entityId").equals("b1").first();
      return entry!.id!;
    };

    for (let i = 0; i < 19; i++) {
      await db.outbox.update(await getEntryId(), { nextAttemptAt: Date.now() });
      await pushOutbox(db, "user-1");
    }
    await db.outbox.update(await getEntryId(), { nextAttemptAt: Date.now() });
    await pushOutbox(db, "user-1");

    const entry = await db.outbox.where("entityId").equals("b1").first();
    expect(entry!.errorClass).toBe("permanent");
    expect(entry!.attempts).toBe(20);
  });
});

describe("push — successful upsert", () => {
  it("pushes book upsert and marks synced on success", async () => {
    rpcMock.mockResolvedValue({
      data: { revision: 2 },
      error: null,
    });

    await seedBook("b1");
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "Updated" },
      baseRevision: 1,
    });

    const result = await pushOutbox(db, "user-1");
    expect(result.pushed).toBe(1);
    expect(result.failed).toBe(0);

    const book = await db.books.get("b1");
    expect(book!.syncStatus).toBe("synced");
    expect(book!.revision).toBe(2);
    expect(book!.baseRevision).toBe(2);

    const outboxCount = await db.outbox.count();
    expect(outboxCount).toBe(0);
  });
});

describe("push — delete handling", () => {
  it("soft-deletes book on cloud and marks synced", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { revision: 2 }, error: null });
    const selectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eq3Mock = vi.fn().mockReturnValue({ select: selectMock });
    const eq2Mock = vi.fn().mockReturnValue({ eq: eq3Mock });
    const eq1Mock = vi.fn().mockReturnValue({ eq: eq2Mock });
    const updateMock = vi.fn().mockReturnValue({ eq: eq1Mock });
    fromMock.mockReturnValue({ update: updateMock });

    await seedBook("b1");
    await db.books.update("b1", { deletedAt: Date.now() });
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "delete",
      payload: {},
      baseRevision: 1,
    });

    const result = await pushOutbox(db, "user-1");
    expect(result.pushed).toBe(1);

    const book = await db.books.get("b1");
    expect(book!.syncStatus).toBe("synced");
  });
});

