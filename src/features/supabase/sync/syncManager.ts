import { getDb } from "@/lib/dexie/db";
import type { OutboxEntry } from "@/lib/dexie/types";
import { supabase } from "../index";
import AuthAPI from "../auth/auth.service";

const FILE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_FILE_NAME!;
const IMAGE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_IMAGE_NAME!;

class SyncManager {
  /**
   * Trigger an immediate sync cycle if online.
   * Entity writes and outbox enqueue are handled by repo functions (books.ts, notes.ts).
   */
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
    try {
      const pendingOps = await db.outbox.toArray();

      if (pendingOps.length === 0) {
        console.log("[SyncManager] No pending operations");
        return;
      }

      console.log(
        `[SyncManager] Processing ${pendingOps.length} pending operations`
      );

      for (const op of pendingOps) {
        try {
          await this._syncOperation(op);
          await db.outbox.delete(op.id!);
          console.log(`[SyncManager] Successfully synced ${op.op} for ${op.entityId}`);
        } catch (error) {
          console.error(
            `[SyncManager] Error syncing ${op.op} for ${op.entityId}:`,
            error
          );
          await db.outbox.update(op.id!, {
            attempts: (op.attempts || 0) + 1,
            lastError: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      console.error("[SyncManager] Error processing queue:", error);
      throw error;
    }
  }

  private async _syncOperation(op: OutboxEntry) {
    const user = await AuthAPI.getCurrentUser();
    if (!user) {
      throw new Error("User not authenticated");
    }

    switch (op.op) {
      case "upsert":
        if (op.entityType === "book") {
          await this._syncBookUpsert(op.entityId, op.payload, op.baseRevision, user.id);
        }
        break;
      case "delete":
        if (op.entityType === "book") {
          await this._syncBookDelete(op.entityId, user.id);
        }
        break;
      case "promote":
        await this._syncBookPromote(op.entityId, op.payload, user.id);
        break;
    }
  }

  private async _syncBookUpsert(entityId: string, payload: any, baseRevision: number, userId: string) {
    const db = getDb();

    const fileEntry = await db.files.where("fileId").equals(payload.fileId).first();
    if (!fileEntry || !fileEntry.file) {
      throw new Error("File not found in local storage");
    }

    console.log(`[SyncManager] Uploading file for ${entityId}...`);

    const fileName = `${userId}/${entityId}/${payload.fileId}.pdf`;

    const { error: fileError } = await supabase.storage
      .from(FILE_NAME)
      .upload(fileName, fileEntry.file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (fileError) {
      throw new Error(`File upload failed: ${fileError.message}`);
    }

    console.log(`[SyncManager] File uploaded, now uploading metadata...`);

    if (payload.imageId) {
      const imageEntry = await db.images.where("imageId").equals(payload.imageId).first();
      if (imageEntry && imageEntry.image) {
        const imageName = `${userId}/${entityId}/${payload.imageId}.png`;

        const { error: imageError } = await supabase.storage
          .from(IMAGE_NAME)
          .upload(imageName, imageEntry.image, {
            cacheControl: "3600",
            upsert: false,
          });

        if (imageError) {
          console.warn(`[SyncManager] Image upload failed: ${imageError.message}`);
        }
      }
    }

    if (baseRevision === 0) {
      const { error: metadataError } = await supabase
        .from("books")
        .insert({
          id: entityId,
          user_id: userId,
          title: payload.title,
          author: payload.author,
          tags: payload.tags || [],
          is_favourite: payload.isFavourite || false,
          file_id: payload.fileId,
          image_id: payload.imageId || null,
          revision: 1,
        })
        .select()
        .single();

      if (metadataError) {
        throw new Error(`Create failed: ${metadataError.message}`);
      }
    } else {
      const { error: metadataError } = await supabase
        .from("books")
        .update({
          title: payload.title,
          author: payload.author,
          tags: payload.tags,
          is_favourite: payload.isFavourite,
          file_id: payload.fileId,
          image_id: payload.imageId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entityId)
        .eq("user_id", userId)
        .eq("revision", baseRevision);

      if (metadataError) {
        throw new Error(`Update failed: ${metadataError.message}`);
      }
    }

    console.log(`[SyncManager] Metadata uploaded successfully`);

    const book = await db.books.where("id").equals(entityId).first();
    if (book) {
      await db.books.where("id").equals(entityId).modify({
        syncStatus: "synced",
        revision: baseRevision === 0 ? 1 : baseRevision + 1,
        baseRevision: baseRevision === 0 ? 1 : baseRevision + 1,
      });
    }
  }

  private async _syncBookDelete(entityId: string, userId: string) {
    const db = getDb();

    const book = await db.books.where("id").equals(entityId).first();
    if (!book) {
      throw new Error("Book not found locally");
    }

    const { error: deleteError } = await supabase
      .from("books")
      .update({
        deleted_at: new Date().toISOString(),
        revision: book.revision + 1,
      })
      .eq("id", entityId)
      .eq("user_id", userId)
      .eq("revision", book.revision);

    if (deleteError) {
      throw new Error(`Delete failed: ${deleteError.message}`);
    }

    await db.books.where("id").equals(entityId).modify({
      syncStatus: "synced",
      revision: book.revision + 1,
      baseRevision: book.revision + 1,
    });
  }

  private async _syncBookPromote(entityId: string, payload: any, userId: string) {
    const db = getDb();
    const book = await db.books.where("id").equals(entityId).first();
    if (!book) {
      throw new Error("Book not found locally");
    }

    await this._syncBookUpsert(entityId, {
      title: book.title,
      author: book.author,
      tags: book.tags,
      fileId: book.fileId,
      isFavourite: book.isFavourite,
      imageId: book.imageId,
    }, 0, userId);

    await db.books.where("id").equals(entityId).modify({
      syncScope: "cloud",
      syncStatus: "synced",
    });
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
