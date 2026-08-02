import type { BookVaultDexie } from "./dexie/schema";

/**
 * Get a cover image blob by imageId.
 */
export async function getImageBlob(
  db: BookVaultDexie,
  imageId: string,
): Promise<Blob | null> {
  const entry = await db.images.where("imageId").equals(imageId).first();
  return entry?.image ?? null;
}

/**
 * Remove a cover image blob by imageId.
 */
export async function removeImage(
  db: BookVaultDexie,
  imageId: string,
): Promise<void> {
  await db.images.where("imageId").equals(imageId).delete();
}

/**
 * Check if an image blob exists for the given imageId.
 */
export async function hasImage(
  db: BookVaultDexie,
  imageId: string,
): Promise<boolean> {
  const entry = await db.images.where("imageId").equals(imageId).first();
  return !!entry;
}
