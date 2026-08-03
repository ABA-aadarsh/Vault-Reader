import type { BookVaultDexie } from "@/lib/dexie/schema";
import type { BookEntry } from "@/lib/dexie/types";
import { supabase } from "@/features/supabase/index";

const FILE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_FILE_NAME!;
const IMAGE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_IMAGE_NAME!;

async function downloadCover(db: BookVaultDexie, userId: string, book: BookEntry): Promise<void> {
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

export async function downloadPdf(
  db: BookVaultDexie,
  userId: string,
  book: BookEntry,
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
    await db.books.update(book.id, { fileSyncStatus: "failed" });
    throw error;
  }
}
