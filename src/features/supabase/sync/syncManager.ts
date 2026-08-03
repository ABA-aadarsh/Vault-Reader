import { getDb } from "@/lib/dexie/db";
import { pushOutbox } from "@/features/sync/push";
import { pullFromCloud as pullSyncData } from "@/features/sync/pull";
import { planCoverDownloads } from "@/features/sync/filePlanner";
import AuthAPI from "../auth/auth.service";

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
      return;
    }

    await this.pullFromCloud();
  }

  async pullFromCloud() {
    const db = getDb();
    const user = await AuthAPI.getCurrentUser();
    if (!user) {
      console.log("[SyncManager] No user, skipping pull from cloud");
      return;
    }

    const result = await pullSyncData(db, user.id);
    await planCoverDownloads(db, user.id);
    console.log(
      `[SyncManager] Pull completed: ${result.books} books, ${result.notes} notes`,
    );
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
