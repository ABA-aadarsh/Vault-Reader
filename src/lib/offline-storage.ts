/**
 * Best-effort storage helpers: browsers may refuse persistence or hide the
 * estimate, and neither should block a download.
 */

export interface StorageInfo {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

let persistRequested = false;

/** Ask the browser not to evict our IndexedDB under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  if (persistRequested) return navigator.storage.persisted?.() ?? false;

  persistRequested = true;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return { usage: null, quota: null, persisted: null };
  }

  let usage: number | null = null;
  let quota: number | null = null;
  let persisted: boolean | null = null;

  try {
    const estimate = await navigator.storage.estimate();
    usage = estimate.usage ?? null;
    quota = estimate.quota ?? null;
  } catch {
    // Optional.
  }

  try {
    persisted = (await navigator.storage.persisted?.()) ?? null;
  } catch {
    // Optional.
  }

  return { usage, quota, persisted };
}

/** `1536` → `1.5 MB`; `null` → `unknown`. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "unknown";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}
