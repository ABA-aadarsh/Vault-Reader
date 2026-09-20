import type { BookVaultDexie } from "@/data/dexie/schema";

const PROGRESS_SYNC_KEY = "progressSyncEnabled";

export async function getProgressSyncEnabled(db: BookVaultDexie): Promise<boolean> {
  const entry = await db.syncState.get(PROGRESS_SYNC_KEY);
  return entry?.value === true;
}

export async function setProgressSyncEnabled(
  db: BookVaultDexie,
  enabled: boolean,
): Promise<void> {
  await db.syncState.put({ key: PROGRESS_SYNC_KEY, value: enabled });
}

