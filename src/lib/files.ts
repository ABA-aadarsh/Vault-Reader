import type { BookVaultDexie } from "./dexie/schema";

/**
 * Get a PDF file blob by fileId.
 */
export async function getFileBlob(
  db: BookVaultDexie,
  fileId: string,
): Promise<Blob | null> {
  const entry = await db.files.where("fileId").equals(fileId).first();
  return entry?.file ?? null;
}

/**
 * Remove a PDF file blob by fileId.
 * Used when removing a download or hard-purging a local book.
 */
export async function removeFile(
  db: BookVaultDexie,
  fileId: string,
): Promise<void> {
  await db.files.where("fileId").equals(fileId).delete();
}

/**
 * Check if a file blob exists for the given fileId.
 */
export async function hasFile(
  db: BookVaultDexie,
  fileId: string,
): Promise<boolean> {
  const entry = await db.files.where("fileId").equals(fileId).first();
  return !!entry;
}
