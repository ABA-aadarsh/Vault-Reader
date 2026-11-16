import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BookVaultDexie } from "@/data/dexie/schema";
import type { Book } from "@/data/domain";

const { downloadMock } = vi.hoisted(() => ({ downloadMock: vi.fn() }));

// `src/lib/supabase.ts` calls createClient(undefined, undefined) at import time,
// which throws outside a Next build — mock the whole module.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({ download: downloadMock }),
    },
  },
}));

const { ensureBookDownloaded, isQuotaError, DownloadError } = await import(
  "@/features/Sync/data/filePlanner"
);

const USER_ID = "user-download-test";

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "book-1",
    title: "Title",
    author: "Author",
    tags: [],
    isFavourite: false,
    fileId: "file-1",
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

let db: BookVaultDexie;

beforeEach(async () => {
  downloadMock.mockReset();
  db = new BookVaultDexie(USER_ID);
  await db.open();
  await db.books.add(makeBook());
});

afterEach(async () => {
  await db.close();
  await db.delete();
});

async function status(): Promise<Book["fileSyncStatus"] | undefined> {
  return (await db.books.get("book-1"))?.fileSyncStatus;
}

describe("ensureBookDownloaded", () => {
  it("stores the PDF and marks the book present", async () => {
    const pdf = new Blob(["%PDF-1.7"], { type: "application/pdf" });
    downloadMock.mockResolvedValue({ data: pdf, error: null });

    const book = makeBook();
    const result = await ensureBookDownloaded(db, USER_ID, book);

    expect(result).toBe(pdf);
    expect(await status()).toBe("present");
    expect(downloadMock).toHaveBeenCalledTimes(1);
  });

  it("short-circuits when a blob is already stored", async () => {
    const existing = new Blob(["%PDF-1.7"], { type: "application/pdf" });
    await db.files.put({ fileId: "file-1", file: existing });

    const result = await ensureBookDownloaded(db, USER_ID, makeBook());

    // IndexedDB structured-clones the blob, so compare content rather than identity.
    expect(result.size).toBe(existing.size);
    expect(result.type).toBe(existing.type);
    expect(downloadMock).not.toHaveBeenCalled();
    // A stale status is normalised on the way through.
    expect(await status()).toBe("present");
  });

  it("marks the book failed and rethrows a storage error when the quota is exhausted", async () => {
    downloadMock.mockResolvedValue({
      data: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
      error: null,
    });

    const putSpy = vi
      .spyOn(db.files, "put")
      .mockRejectedValue(new DOMException("The quota has been exceeded.", "QuotaExceededError"));

    await expect(ensureBookDownloaded(db, USER_ID, makeBook())).rejects.toMatchObject({
      name: "DownloadError",
      kind: "storage",
    });

    expect(await status()).toBe("failed");
    putSpy.mockRestore();
  });

  it("classifies network failures as offline errors and marks the book failed", async () => {
    downloadMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await ensureBookDownloaded(db, USER_ID, makeBook()).catch((cause) => cause);

    expect(error).toBeInstanceOf(DownloadError);
    expect(error.kind).toBe("offline");
    expect(await status()).toBe("failed");
  });

  it("keeps the storage error message when supabase reports an error", async () => {
    downloadMock.mockResolvedValue({ data: null, error: { message: "Object not found" } });

    const error = await ensureBookDownloaded(db, USER_ID, makeBook()).catch((cause) => cause);

    expect(error).toBeInstanceOf(DownloadError);
    expect(error.kind).toBe("unknown");
    expect(error.message).toBe("Object not found");
  });
});

describe("isQuotaError", () => {
  it("recognises DOMException quota failures", () => {
    expect(isQuotaError(new DOMException("full", "QuotaExceededError"))).toBe(true);
    expect(isQuotaError(new DOMException("nope", "AbortError"))).toBe(false);
  });

  it("recognises message-only failures", () => {
    expect(isQuotaError(new Error("QuotaExceededError: storage full"))).toBe(true);
    expect(isQuotaError(new Error("network down"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});
