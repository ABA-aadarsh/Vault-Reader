import { db, SyncQueueEntry } from "@/lib/dexie";
import { supabase } from "../index";
import AuthAPI from "../auth/auth.service";

const FILE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_FILE_NAME!;
const IMAGE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_IMAGE_NAME!;

//TODO: Add retry limits, exponential backoff, and error categorization for better sync reliability and user feedback.

class SyncManager {
  /**
   * Queue an operation to be synced to cloud
   */
  async queueOperation(
    type: "create" | "update" | "delete",
    docId: string,
    payload: Record<string, any>
  ) {
    try {
      // Add to sync queue
      await db.syncQueue.add({
        type,
        docId,
        payload,
        createdAt: Date.now(),
        attempts: 0,
      });

      // Mark metadata as pending
      await db.metadata.where("docId").equals(docId).modify({
        syncStatus: "pending",
      });

      console.log(`[SyncManager] Queued ${type} operation for ${docId}`);

          // NEW: If online, sync immediately
    if (navigator.onLine) {
      console.log(`[SyncManager] Online detected, syncing immediately...`);
      try {
        await this.processQueue();
        console.log(`[SyncManager] Immediate sync completed`);
      } catch (error) {
        console.error(`[SyncManager] Immediate sync failed, will retry later:`, error);
        // It's queued, so user can retry when online
      }
    }
    } catch (error) {
      console.error("[SyncManager] Error queuing operation:", error);
      throw error;
    }
  }

  /**
   * Process all pending operations in the queue
   */
  async processQueue() {
    try {
      const pendingOps = await db.syncQueue.toArray();

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
          // Remove from queue on success
          await db.syncQueue.delete(op.id!);
          console.log(`[SyncManager] Successfully synced ${op.type} for ${op.docId}`);
        } catch (error) {
          console.error(
            `[SyncManager] Error syncing ${op.type} for ${op.docId}:`,
            error
          );
          // Increment attempts
          await db.syncQueue.update(op.id!, {
            attempts: (op.attempts || 0) + 1,
          });
        }
      }
    } catch (error) {
      console.error("[SyncManager] Error processing queue:", error);
      throw error;
    }
  }

  /**
   * Sync a single operation to cloud
   */
  private async _syncOperation(op: SyncQueueEntry) {
    const user = await AuthAPI.getCurrentUser();
    if (!user) {
      throw new Error("User not authenticated");
    }

    switch (op.type) {
      case "create":
        await this._syncCreate(op.docId, op.payload, user.id);
        break;
      case "update":
        await this._syncUpdate(op.docId, op.payload, user.id);
        break;
      case "delete":
        await this._syncDelete(op.docId, user.id);
        break;
    }
  }

  /**
   * Sync create operation - upload files and metadata
   */
  private async _syncCreate(docId: string, payload: any, userId: string) {
    try {
      // Get the stored file blob from Dexie
      const fileEntry = await db.files.where("fileId").equals(payload.fileId).first();
      if (!fileEntry || !fileEntry.file) {
        throw new Error("File not found in local storage");
      }

      console.log(`[SyncManager] Uploading file for ${docId}...`);

      // Upload file to Supabase Storage
      const fileExtension = "pdf"; // default, could detect from metadata
      const fileName = `${payload.fileId}.${fileExtension}`;

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

      // Upload image if exists
      if (payload.imageId) {
        const imageEntry = await db.image.where("imageId").equals(payload.imageId).first();
        if (imageEntry && imageEntry.image) {
          const imageExtension = "png";
          const imageName = `${payload.imageId}.${imageExtension}`;

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

      // Create metadata record in Supabase
      const { error: metadataError } = await supabase
        .from("metadata")
        .insert({
          id: docId,
          title: payload.title,
          author: payload.author,
          tags: payload.tags,
          file_id: payload.fileId,
          user_id: userId,
          isFavourite: payload.isFavourite,
          imageId: payload.imageId,
          verified: true,
          version: 1,
        })
        .select()
        .single();

      if (metadataError) {
        throw new Error(`Create failed: ${metadataError.message}`);
      }

      console.log(`[SyncManager] Metadata uploaded successfully`);

      // Mark as synced in local DB
      await db.metadata.where("docId").equals(docId).modify({
        syncStatus: "synced",
        lastSyncedAt: Date.now(),
      });
    } catch (error) {
      console.error(`[SyncManager] _syncCreate error:`, error);
      throw error;
    }
  }

  /**
   * Sync update operation
   */
  private async _syncUpdate(docId: string, payload: any, userId: string) {
    const { error } = await supabase
      .from("metadata")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", docId)
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Update failed: ${error.message}`);
    }

    // Mark as synced in local DB
    await db.metadata.where("docId").equals(docId).modify({
      syncStatus: "synced",
      lastSyncedAt: Date.now(),
    });
  }

/**
 * Sync delete operation - delete metadata, file, and image from cloud
 */
private async _syncDelete(docId: string, userId: string) {
  // First, get the metadata to find file references
  const { data: metadata, error: fetchError } = await supabase
    .from("metadata")
    .select("file_id, imageId")
    .eq("id", docId)
    .eq("user_id", userId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch metadata for deletion: ${fetchError.message}`);
  }

  if (!metadata) {
    throw new Error("Metadata not found");
  }

  try {
    // Delete file from storage
    if (metadata.file_id) {
      const fileExtension = "pdf";
      const fileName = `${metadata.file_id}.${fileExtension}`;
      
      const { error: fileDeleteError } = await supabase.storage
        .from(FILE_NAME)
        .remove([fileName]);

      if (fileDeleteError) {
        console.warn(`[SyncManager] File deletion failed: ${fileDeleteError.message}`);
        // Don't throw, continue with metadata deletion
      } else {
        console.log(`[SyncManager] File deleted: ${fileName}`);
      }
    }

    // Delete image from storage if it exists
    if (metadata.imageId) {
      const imageExtension = "png";
      const imageName = `${metadata.imageId}.${imageExtension}`;
      
      const { error: imageDeleteError } = await supabase.storage
        .from(IMAGE_NAME)
        .remove([imageName]);

      if (imageDeleteError) {
        console.warn(`[SyncManager] Image deletion failed: ${imageDeleteError.message}`);
        // Don't throw, continue with metadata deletion
      } else {
        console.log(`[SyncManager] Image deleted: ${imageName}`);
      }
    }

    // Delete metadata record from database
    const { error: metadataError } = await supabase
      .from("metadata")
      .delete()
      .eq("id", docId)
      .eq("user_id", userId);

    if (metadataError) {
      throw new Error(`Metadata deletion failed: ${metadataError.message}`);
    }

    console.log(`[SyncManager] ✓ Deleted ${docId} from cloud (metadata, file, and image)`);
  } catch (error) {
    console.error(`[SyncManager] _syncDelete error:`, error);
    throw error;
  }
}
  /**
   * Pull all books from cloud and sync to local storage
   * Handles updates and new books with timestamp comparison
   */
  async pullFromCloud() {
    try {
      const user = await AuthAPI.getCurrentUser();
      // console.log("[SyncManager] Checking for cloud updates for user:", user?.id);
      if (!user) {
        console.log("[SyncManager] No user, skipping pull from cloud");
        return;
      }

      console.log("[SyncManager] Pulling books from cloud...");

      // Fetch all books for this user from cloud
      const { data: cloudBooks, error } = await supabase
        .from("metadata")
        .select("*")
        .eq("user_id", user.id);
        console.log(`[SyncManager] Fetched ${cloudBooks?.length || 0} books from cloud`);
      if (error) {
        throw new Error(`Failed to fetch cloud books: ${error.message}`);
      }

      if (!cloudBooks || cloudBooks.length === 0) {
        console.log("[SyncManager] No books in cloud");
        return;
      }

      // Get local books and pending operations
      const localBooks = await db.metadata.toArray();
      const localBookIds = new Map(localBooks.map(b => [b.docId, b]));
      const pendingOps = await db.syncQueue.toArray();
      const pendingDocIds = new Set(pendingOps.map(op => op.docId));

      let newBooksCount = 0;
      let updatedBooksCount = 0;

      // For each cloud book, check if it exists locally
      for (const cloudBook of cloudBooks) {
        const localBook = localBookIds.get(cloudBook.id);

        if (localBook) {
          // Book exists locally - check if it has pending edits
          if (pendingDocIds.has(cloudBook.id)) {
            console.log(`[SyncManager] ⏸️ Skipping ${cloudBook.id} (has pending edits)`);
            continue;
          }

          // Compare timestamps - only update if cloud is newer
          const cloudUpdated = cloudBook.updated_at 
            ? new Date(cloudBook.updated_at).getTime() 
            : 0;
          const localUpdated = localBook.lastSyncedAt || 0;

          if (cloudUpdated <= localUpdated) {
            // Local is same or newer, skip
            continue;
          }

          // Cloud is newer - update metadata only (keep local file)
          console.log(`[SyncManager] 🔄 Updating ${cloudBook.id} from cloud`);
          await db.metadata.where("docId").equals(cloudBook.id).modify({
            title: cloudBook.title,
            author: cloudBook.author,
            tags: cloudBook.tags || [],
            isFavourite: cloudBook.isFavourite || false,
            lastSyncedAt: Date.now(),
          });
          updatedBooksCount++;
          continue;
        }

        // New book not in local - download it
        try {
          // Download file from cloud storage
          let fileBlob = null;
          if (cloudBook.file_id) {
            const fileExtension = "pdf"; // Match upload extension
            const fileName = `${cloudBook.file_id}.${fileExtension}`;
            
            const { data: fileData, error: fileError } = await supabase.storage
              .from(FILE_NAME)
              .download(fileName);

            if (fileError) {
              console.warn(`[SyncManager] Failed to download file ${fileName}: ${fileError.message}`);
              continue;
            }
            fileBlob = fileData;
          }

          // Download image from cloud storage if exists
          let imageBlob = null;
          if (cloudBook.imageId) {
            const imageExtension = "png"; // TODO: get the actual extension // Match upload extension
            const imageName = `${cloudBook.imageId}.${imageExtension}`;
            
            const { data: imageData, error: imageError } = await supabase.storage
              .from(IMAGE_NAME)
              .download(imageName);

            if (imageError) {
              console.warn(`[SyncManager] Failed to download image ${imageName}: ${imageError.message}`);
              // Don't fail, image is optional
            } else {
              imageBlob = imageData;
            }
          }

          // Store file locally
          if (fileBlob) {
            await db.files.add({
              fileId: cloudBook.file_id,
              file: fileBlob,
            });
          }

          // Store image locally
          if (imageBlob && cloudBook.imageId) {
            await db.image.add({
              imageId: cloudBook.imageId,
              image: imageBlob,
            });
          }

          // Store metadata locally
          await db.metadata.add({
            docId: cloudBook.id,
            title: cloudBook.title,
            author: cloudBook.author,
            tags: cloudBook.tags || [],
            fileId: cloudBook.file_id,
            userId: user.id,
            isFavourite: cloudBook.isFavourite || false,
            imageId: cloudBook.imageId || null,
            syncStatus: "synced",
            lastSyncedAt: Date.now(),
          });

          newBooksCount++;
          console.log(`[SyncManager] ✓ Synced cloud book: ${cloudBook.title}`);
        } catch (error) {
          console.error(`[SyncManager] Failed to sync cloud book ${cloudBook.id}:`, error);
          // Continue with next book
        }
      }

      console.log(`[SyncManager] ✓ Pull completed: ${newBooksCount} new books, ${updatedBooksCount} updated`);
    } catch (error) {
      console.error("[SyncManager] Error pulling from cloud:", error);
      throw error;
    }
  }

  /**
   * Get count of pending operations
   */
  async getQueueCount() {
    const count = await db.syncQueue.count();
    return count;
  }

  /**
   * Get all pending operations (useful for debugging/UI)
   */
  async getPendingOperations() {
    return await db.syncQueue.toArray();
  }

  /**
   * Clear queue (useful for testing)
   */
  async clearQueue() {
    await db.syncQueue.clear();
    await db.metadata.toCollection().modify({
      syncStatus: "synced",
    });
  }
}

export const syncManager = new SyncManager();
