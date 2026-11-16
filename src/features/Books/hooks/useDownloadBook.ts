"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDb } from "@/data/dexie";
import type { Book } from "@/data/domain";
import { useAuth } from "@/features/Auth";
import { ensureBookDownloaded, DownloadError } from "@/features/Sync/data/filePlanner";
import { getIsOnline, reportReachable, reportUnreachable } from "@/lib/connectivity";
import { requestPersistentStorage } from "@/lib/offline-storage";
import { warmBookRoute } from "@/lib/offline-warm";
import type { BookViewModel } from "../types";

/** Fetch the PDF into IndexedDB, then warm the reader route so it opens offline. */
export function useDownloadBook() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation<Blob, Error, BookViewModel | Book>({
    mutationFn: async (book) => {
      if (!getIsOnline()) {
        throw new DownloadError(
          "offline",
          "You're offline — connect to the internet to download this book",
        );
      }

      const source = await resolveBook(db, book);

      // Best-effort: ask the browser not to evict IndexedDB.
      void requestPersistentStorage();

      return ensureBookDownloaded(db, user.id, source);
    },
    onSuccess: (_blob, book) => {
      // A completed download is proof the network works.
      reportReachable();

      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["cloudBooks"] });

      // Fire-and-forget: warming must not hold up the "downloaded" toast.
      void warmBookRoute(book.fileId);
    },
    onError: (error) => {
      // A network failure should flip the whole UI to offline, not just toast.
      if (error instanceof DownloadError && error.kind === "offline") {
        reportUnreachable();
      }
    },
  });
}

/** Accept the view model or the Dexie row; downloading needs the row fields. */
async function resolveBook(db: ReturnType<typeof useDb>, book: BookViewModel | Book): Promise<Book> {
  if ("docId" in book) {
    const row = await db.books.get(book.docId);
    if (!row) throw new DownloadError("unknown", "Book not found");
    return row;
  }
  return book;
}
