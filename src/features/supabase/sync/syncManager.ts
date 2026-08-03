import { getDb } from "@/lib/dexie/db";
import { pushOutbox } from "@/features/sync/push";
import { supabase } from "../index";
import AuthAPI from "../auth/auth.service";

const FILE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_FILE_NAME!;
const IMAGE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_IMAGE_NAME!;

class SyncManager {
  async triggerSyncIfOnline() {
    if (!navigator.onLine) return;

    try {
      await this.processQueue();
    } catch (error) {
      console.error("[SyncManager] Immediate sync failed, will retry later:", error);
    }
  }

  async processQueue() {
    const db = getDb();
    const user = await AuthAPI.getCurrentUser();
    if (!user) {
      console.log("[SyncManager] No user, skipping push");
      return;
    }

    const result = await pushOutbox(db, user.id);

    if (result.paused) {
      console.log("[SyncManager] Auth error — sync paused until re-auth");
    }
  }

  async pullFromCloud() {
    const db = getDb();
    try {
      const user = await AuthAPI.getCurrentUser();
      if (!user) {
        console.log("[SyncManager] No user, skipping pull from cloud");
        return;
      }

      console.log("[SyncManager] Pulling books from cloud...");

      const { data: cloudBooks, error } = await supabase
        .from("books")
        .select("*")
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (error) {
        throw new Error(`Failed to fetch cloud books: ${error.message}`);
      }

      if (!cloudBooks || cloudBooks.length === 0) {
        console.log("[SyncManager] No books in cloud");
        return;
      }

      const localBooks = await db.books.toArray();
      const localBookIds = new Map(localBooks.map(b => [b.id, b]));
      const pendingOps = await db.outbox.toArray();
      const pendingEntityIds = new Set(pendingOps.map(op => op.entityId));

      let newBooksCount = 0;
      let updatedBooksCount = 0;

      for (const cloudBook of cloudBooks) {
        const localBook = localBookIds.get(cloudBook.id);

        if (localBook) {
          if (pendingEntityIds.has(cloudBook.id)) {
            console.log(`[SyncManager] Skipping ${cloudBook.id} (has pending edits)`);
            continue;
          }

          if (cloudBook.revision <= localBook.baseRevision) {
            continue;
          }

          console.log(`[SyncManager] Updating ${cloudBook.id} from cloud`);
          await db.books.where("id").equals(cloudBook.id).modify({
            title: cloudBook.title,
            author: cloudBook.author,
            tags: cloudBook.tags || [],
            isFavourite: cloudBook.is_favourite || false,
            revision: cloudBook.revision,
            baseRevision: cloudBook.revision,
            syncStatus: "synced",
            updatedAt: Date.now(),
          });
          updatedBooksCount++;
          continue;
        }

        try {
          let fileBlob = null;
          if (cloudBook.file_id) {
            const fileName = `${user.id}/${cloudBook.id}/${cloudBook.file_id}.pdf`;
            
            const { data: fileData, error: fileError } = await supabase.storage
              .from(FILE_NAME)
              .download(fileName);

            if (fileError) {
              console.warn(`[SyncManager] Failed to download file ${fileName}: ${fileError.message}`);
              continue;
            }
            fileBlob = fileData;
          }

          let imageBlob = null;
          if (cloudBook.image_id) {
            const imageName = `${user.id}/${cloudBook.id}/${cloudBook.image_id}.png`;
            
            const { data: imageData, error: imageError } = await supabase.storage
              .from(IMAGE_NAME)
              .download(imageName);

            if (imageError) {
              console.warn(`[SyncManager] Failed to download image ${imageName}: ${imageError.message}`);
            } else {
              imageBlob = imageData;
            }
          }

          if (fileBlob) {
            await db.files.add({
              fileId: cloudBook.file_id,
              file: fileBlob,
            });
          }

          if (imageBlob && cloudBook.image_id) {
            await db.images.add({
              imageId: cloudBook.image_id,
              image: imageBlob,
            });
          }

          const now = Date.now();
          await db.books.add({
            id: cloudBook.id,
            title: cloudBook.title,
            author: cloudBook.author,
            tags: cloudBook.tags || [],
            fileId: cloudBook.file_id,
            imageId: cloudBook.image_id || null,
            isFavourite: cloudBook.is_favourite || false,
            syncScope: "cloud",
            revision: cloudBook.revision,
            baseRevision: cloudBook.revision,
            deletedAt: null,
            fileSyncStatus: fileBlob ? "present" : "not_downloaded",
            coverSyncStatus: imageBlob ? "present" : "not_downloaded",
            syncStatus: "synced",
            updatedAt: now,
            updatedByDeviceId: "",
          });

          newBooksCount++;
          console.log(`[SyncManager] Synced cloud book: ${cloudBook.title}`);
        } catch (error) {
          console.error(`[SyncManager] Failed to sync cloud book ${cloudBook.id}:`, error);
        }
      }

      console.log(`[SyncManager] Pull completed: ${newBooksCount} new books, ${updatedBooksCount} updated`);
    } catch (error) {
      console.error("[SyncManager] Error pulling from cloud:", error);
      throw error;
    }
  }

  async getQueueCount() {
    const db = getDb();
    const count = await db.outbox.count();
    return count;
  }

  async getPendingOperations() {
    const db = getDb();
    return await db.outbox.toArray();
  }

  async clearQueue() {
    const db = getDb();
    await db.outbox.clear();
    await db.books.toCollection().modify({
      syncStatus: "synced",
    });
  }
}

export const syncManager = new SyncManager();
