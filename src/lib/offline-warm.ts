/**
 * Cache what a downloaded book needs besides its PDF: the reader route, its
 * chunks and the pdf.js worker.
 */

import type { BookVaultDexie } from "@/data/dexie/schema";
import { getIsOnline } from "@/lib/connectivity";
import { PDF_WORKER_SRC } from "@/features/Reader/data/pdfWorker";

const WARM_TIMEOUT_MS = 20_000;

/**
 * Re-warm routes for books already downloaded. A cache version bump (or an
 * evicted cache) leaves the PDFs in IndexedDB without a warmed reader route.
 */
export async function warmDownloadedBooks(db: BookVaultDexie): Promise<void> {
  if (typeof window === "undefined" || typeof caches === "undefined") return;
  if (!getIsOnline()) return;

  const books = await db.books.toArray().catch(() => []);
  for (const book of books) {
    if (book.deletedAt || book.fileSyncStatus !== "present" || !book.fileId) continue;
    if (await caches.match(`/dashboard/book/${book.fileId}`, { ignoreVary: true })) continue;
    await warmBookRoute(book.fileId);
  }
}

export async function warmBookRoute(fileId: string): Promise<void> {
  if (typeof window === "undefined") return;

  await Promise.allSettled([
    warmWorker(),
    postToWorker("WARM_ROUTE", `/dashboard/book/${fileId}`, [PDF_WORKER_SRC]),
  ]);
}

/** Drop a book's warmed route when its download is removed. */
export async function unwarmBookRoute(fileId: string): Promise<void> {
  if (typeof window === "undefined") return;

  await postToWorker("REMOVE_BOOK_ROUTE", `/dashboard/book/${fileId}`);
}

async function warmWorker(): Promise<void> {
  try {
    await fetch(PDF_WORKER_SRC);
  } catch {
    // Fetched again on first open.
  }
}

async function postToWorker(
  type: "WARM_ROUTE" | "REMOVE_BOOK_ROUTE",
  url: string,
  assets?: string[],
): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await withTimeout(navigator.serviceWorker.ready, WARM_TIMEOUT_MS);
    const worker = registration.active ?? navigator.serviceWorker.controller;
    worker?.postMessage({ type, url, assets });
  } catch {
    // No active worker (e.g. dev) — nothing to warm.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Timed out")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
