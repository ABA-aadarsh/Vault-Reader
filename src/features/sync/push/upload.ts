import type { BookVaultDexie } from "@/lib/dexie/schema";
import { supabase } from "@/features/Supabase/index";

const FILE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_FILE_NAME!;
const IMAGE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_IMAGE_NAME!;

export async function uploadFileIfMissing(
  db: BookVaultDexie,
  userId: string,
  bookId: string,
  fileId: string,
): Promise<void> {
  const existing = await supabase.storage
    .from(FILE_NAME)
    .list(`${userId}/${bookId}`);

  if (existing.data?.some((f) => f.name === `${fileId}.pdf`)) return;

  const fileEntry = await db.files.where("fileId").equals(fileId).first();
  if (!fileEntry?.file) throw new Error("File not found in local storage");

  const path = `${userId}/${bookId}/${fileId}.pdf`;
  const { error } = await supabase.storage
    .from(FILE_NAME)
    .upload(path, fileEntry.file, { cacheControl: "3600", upsert: false });

  if (error) throw new Error(`File upload failed: ${error.message}`);
}

export async function uploadImageIfMissing(
  db: BookVaultDexie,
  userId: string,
  bookId: string,
  imageId: string,
): Promise<void> {
  const existing = await supabase.storage
    .from(IMAGE_NAME)
    .list(`${userId}/${bookId}`);

  if (existing.data?.some((f) => f.name === `${imageId}.png`)) return;

  const imageEntry = await db.images.where("imageId").equals(imageId).first();
  if (!imageEntry?.image) return;

  const path = `${userId}/${bookId}/${imageId}.png`;
  const { error } = await supabase.storage
    .from(IMAGE_NAME)
    .upload(path, imageEntry.image, { cacheControl: "3600", upsert: false });

  if (error) console.warn(`[Push] Image upload failed: ${error.message}`);
}