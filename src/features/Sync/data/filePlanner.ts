import type { BookVaultDexie } from "@/data/dexie/schema";
import type { Book } from "@/data/domain";
import { supabase } from "@/lib/supabase";
import { getIsOnline } from "@/lib/connectivity";
import { isNetworkError } from "@/lib/network-error";

const FILE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_FILE_NAME!;
const IMAGE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_IMAGE_NAME!;

async function downloadCover(db: BookVaultDexie, userId: string, book: Book): Promise<void> {
  if (!book.imageId || book.coverSyncStatus === "present") return;
  await db.books.update(book.id, { coverSyncStatus: "downloading" });

  try {
    const path = `${userId}/${book.id}/${book.imageId}.png`;
    const { data, error } = await supabase.storage.from(IMAGE_NAME).download(path);
    if (error || !data) throw new Error(error?.message ?? "Cover download returned no data");
    await db.images.put({ imageId: book.imageId, image: data });
    await db.books.update(book.id, { coverSyncStatus: "present" });
  } catch (error) {
    await db.books.update(book.id, { coverSyncStatus: "failed" });
    console.warn(`[FilePlanner] Cover download failed for ${book.id}:`, error);
  }
}

export async function planCoverDownloads(db: BookVaultDexie, userId: string): Promise<void> {
  const books = await db.books
    .where("syncScope")
    .equals("cloud")
    .and((book) => book.deletedAt === null && book.coverSyncStatus !== "present")
    .toArray();

  await Promise.all(books.map((book) => downloadCover(db, userId, book)));
}

export type DownloadErrorKind = "storage" | "offline" | "unknown";

/** Download failure the UI can map to specific copy ("Not enough storage…"). */
export class DownloadError extends Error {
  readonly kind: DownloadErrorKind;

  constructor(kind: DownloadErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DownloadError";
    this.kind = kind;
  }
}

/** Safari reports quota failures as a generic `UnknownError`, hence the message check. */
export function isQuotaError(error: unknown): boolean {
  if (!error) return false;
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "QuotaExceededError" || error.code === 22;
  }
  const name = (error as { name?: unknown }).name;
  if (name === "QuotaExceededError") return true;

  const message = error instanceof Error ? error.message : String(error);
  return /quota|storage (is )?full|not enough (disk )?space/i.test(message);
}

export function isOfflineError(error: unknown): boolean {
  if (!getIsOnline()) return true;
  return isNetworkError(error);
}

export async function downloadPdf(
  db: BookVaultDexie,
  userId: string,
  book: Book,
): Promise<Blob> {
  const existing = await db.files.where("fileId").equals(book.fileId).first();
  if (existing?.file) {
    if (book.fileSyncStatus !== "present") await db.books.update(book.id, { fileSyncStatus: "present" });
    return existing.file;
  }
  if (!book.fileId) throw new Error("This book has no PDF file reference");

  await db.books.update(book.id, { fileSyncStatus: "downloading" });
  try {
    const path = `${userId}/${book.id}/${book.fileId}.pdf`;
    const { data, error } = await supabase.storage.from(FILE_NAME).download(path);
    if (error || !data) throw new Error(error?.message ?? "PDF download returned no data");
    await db.files.put({ fileId: book.fileId, file: data });
    await db.books.update(book.id, { fileSyncStatus: "present" });
    return data;
  } catch (error) {
    // A full disk can also reject this small write; don't mask the real error.
    await db.books.update(book.id, { fileSyncStatus: "failed" }).catch(() => undefined);
    throw error;
  }
}

const inFlightDownloads = new Map<string, Promise<Blob>>();

/**
 * Download a book's PDF for offline use. Concurrent calls share one request and
 * failures are rethrown as `DownloadError`.
 */
export async function ensureBookDownloaded(
  db: BookVaultDexie,
  userId: string,
  book: Book,
): Promise<Blob> {
  if (!book.fileId) throw new DownloadError("unknown", "This book has no PDF file reference");

  const existing = inFlightDownloads.get(book.fileId);
  if (existing) return existing;

  const download = downloadClassified(db, userId, book).finally(() => {
    inFlightDownloads.delete(book.fileId);
  });

  inFlightDownloads.set(book.fileId, download);
  return download;
}

async function downloadClassified(
  db: BookVaultDexie,
  userId: string,
  book: Book,
): Promise<Blob> {
  try {
    return await downloadPdf(db, userId, book);
  } catch (error) {
    if (isQuotaError(error)) {
      throw new DownloadError(
        "storage",
        "Not enough storage for this book — free up space and try again",
        { cause: error },
      );
    }
    if (isOfflineError(error)) {
      throw new DownloadError(
        "offline",
        "You're offline — connect to the internet to download this book",
        { cause: error },
      );
    }
    throw new DownloadError(
      "unknown",
      error instanceof Error ? error.message : "Download failed",
      { cause: error },
    );
  }
}

