/**
 * Cache what a downloaded book needs besides its PDF: the reader route, its
 * chunks and the pdf.js worker.
 */

import { PDF_WORKER_SRC } from "@/features/Reader/data/pdfWorker";

const WARM_TIMEOUT_MS = 20_000;

export async function warmBookRoute(fileId: string): Promise<void> {
  if (typeof window === "undefined") return;

  await Promise.allSettled([warmWorker(), warmRouteDocument(`/dashboard/book/${fileId}`)]);
}

async function warmWorker(): Promise<void> {
  try {
    await fetch(PDF_WORKER_SRC);
  } catch {
    // Fetched again on first open.
  }
}

async function warmRouteDocument(url: string): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await withTimeout(navigator.serviceWorker.ready, WARM_TIMEOUT_MS);
    const worker = registration.active ?? navigator.serviceWorker.controller;
    worker?.postMessage({ type: "WARM_ROUTE", url });
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
