"use client";

import { NoteEditor } from "@/features/Notes";
import {
  PDFViewer,
  PdfThumbnailRail,
  type PDFDocument,
  type PDFViewerHandle,
  setPage,
  getReadingState,
  flushReadingState,
} from "@/features/Reader";
import { invalidateReadingStates } from "@/features/Reader/hooks/useReadingStates";
import { useBooks, getFileBlob } from "@/features/Books";
import { useState, useEffect, useCallback, useRef } from "react";
import React from "react";
import { Loader2, FileWarning, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDb } from "@/data/dexie";
import { downloadPdf } from "@/features/Sync";
import { getIsOnline, reportReachable, reportUnreachable } from "@/lib/connectivity";
import { isNetworkError } from "@/lib/network-error";
import type { Book } from "@/data/domain";
import { useAuth } from "@/features/Auth";
import { useRouter } from "next/navigation";

interface PageProps {
  params: Promise<{
    fileId: string;
  }>;
}

export default function BookViewPage({ params }: PageProps) {
  const { fileId } = React.use(params);
  const { data: books, isLoading } = useBooks();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isFetchingFile, setIsFetchingFile] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [missingOffline, setMissingOffline] = useState(false);
  const [initialPage, setInitialPage] = useState<number | undefined>(undefined);
  const [pdf, setPdf] = useState<PDFDocument | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [notesOpen, setNotesOpen] = useState(true);
  const db = useDb();
  const { user } = useAuth();
  const router = useRouter();
  const blobUrlRef = useRef<string | null>(null);
  const selectedBookRef = useRef<Book | null>(null);
  const viewerRef = useRef<PDFViewerHandle>(null);
  selectedBookRef.current = selectedBook;

  const handleDocumentLoad = useCallback((document: PDFDocument) => {
    setPdf(document);
  }, []);

  const handlePageChange = useCallback(
    (page: number, totalPages: number) => {
      setCurrentPage(page);
      if (selectedBook?.id) {
        void setPage(db, selectedBook.id, page, totalPages);
      }
    },
    [db, selectedBook?.id],
  );

  const handleSelectPage = useCallback((page: number) => {
    viewerRef.current?.jumpToPage(page);
  }, []);

  const handleBack = useCallback(() => {
    router.push("/library");
  }, [router]);

  // A new blob URL means a new document: drop the previous thumbnails.
  useEffect(() => {
    setPdf(null);
    setCurrentPage(1);
  }, [fileUrl]);

  // Notes start open on desktop; on a phone they overlay the document, so
  // begin closed to keep the page readable.
  useEffect(() => {
    if (window.innerWidth < 768) setNotesOpen(false);
  }, []);

  // Persist any queued reading position when leaving the reader, then refresh
  // the sidebar's progress list — the library mounts before this write lands.
  useEffect(() => {
    return () => {
      void flushReadingState().then(invalidateReadingStates);
    };
  }, []);

  // Listen for page jumps (e.g. PageButton clicks in the note editor)
  useEffect(() => {
    const handleJumpToPage = (e: Event) => {
      const page = (e as CustomEvent<{ page: number }>).detail?.page;
      if (typeof page === "number") {
        viewerRef.current?.jumpToPage(page);
      }
    };
    window.addEventListener("jump-to-page", handleJumpToPage);
    return () => window.removeEventListener("jump-to-page", handleJumpToPage);
  }, []);

  // Find the book in the list
  useEffect(() => {
    if (!isLoading) {
      const book = books?.find((b) => b.fileId === fileId);
      setSelectedBook(book || null);
    }
  }, [fileId, books, isLoading]);

  const selectedBookId = selectedBook?.id;
  useEffect(() => {
    let cancelled = false;
    setInitialPage(undefined);

    if (!selectedBookId) return;

    getReadingState(db, selectedBookId)
      .then((state) => {
        if (cancelled) return;
        if (state && state.page > 1) {
          setInitialPage(state.page);
        }
      })
      .catch((error) => {
        console.warn("Could not load saved reading position:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [db, selectedBookId]);

  // Fetch the actual file blob and create blob URL
  const fetchFileBlob = useCallback(
    async (forRetry = false) => {
      const book = selectedBookRef.current;
      if (!book) return;

      try {
        setIsFetchingFile(true);
        if (forRetry) setLoadFailed(false);
        setMissingOffline(false);

        let blob = await getFileBlob(db, book.fileId);

        if (!blob && book.syncScope === "cloud") {
          // Offline with no local copy: explain instead of "download failed".
          if (!getIsOnline()) {
            setMissingOffline(true);
            setLoadFailed(true);
            setFileUrl(null);
            return;
          }

          blob = await downloadPdf(db, user.id, book);
          // A completed download proves the network works.
          reportReachable();
        }

        if (blob) {
          if (blobUrlRef.current) {
            const prev = blobUrlRef.current;
            window.setTimeout(() => {
              if (blobUrlRef.current !== prev) URL.revokeObjectURL(prev);
            }, 1000);
          }
          const currentBlobUrl = URL.createObjectURL(blob);
          blobUrlRef.current = currentBlobUrl;
          setFileUrl(currentBlobUrl);
        } else {
          console.error("File blob not found for book");
          setLoadFailed(true);
          setFileUrl(null);
        }
      } catch (error) {
        console.error("Error fetching file blob:", error);
        if (isNetworkError(error)) {
          // Keep the header pill and sync chip in agreement.
          reportUnreachable();
          setMissingOffline(true);
        }
        setLoadFailed(true);
        setFileUrl(null);
      } finally {
        setIsFetchingFile(false);
      }
    },
    [db, user.id],
  );

  useEffect(() => {
    const fileId = selectedBook?.fileId;
    if (!fileId) return;

    fetchFileBlob();

    return () => {
      const url = blobUrlRef.current;
      if (url) {
        blobUrlRef.current = null;
        window.setTimeout(() => URL.revokeObjectURL(url), 500);
      }
    };
  }, [selectedBook?.fileId, selectedBook?.syncScope, db, user.id, fetchFileBlob]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted" />
      </div>
    );
  }

  if (!selectedBook) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold">Book not found</h2>
          <p className="text-muted">
            The book you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  if (loadFailed && !fileUrl) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4 p-8">
          <FileWarning className="mx-auto h-16 w-16 text-red-400" />
          <h2 className="text-2xl font-semibold">
            {missingOffline ? "This book isn't downloaded yet" : "Failed to load PDF"}
          </h2>
          <p className="text-muted">
            {missingOffline
              ? "You're offline. Connect to the internet, or download this book from its menu in the library first."
              : "The file could not be downloaded. Check your connection and try again."}
          </p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => fetchFileBlob(true)} disabled={isFetchingFile}>
              {isFetchingFile ? "Retrying..." : "Retry"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/library")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-full min-w-0 overflow-hidden bg-background">
      {isFetchingFile && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-50 rounded-lg">
          <Loader2 className="w-8 h-8 animate-spin text-muted" />
        </div>
      )}

      <PDFViewer
        ref={viewerRef}
        fileUrl={fileUrl}
        initialPage={initialPage}
        title={selectedBook.title}
        onBack={handleBack}
        onDocumentLoad={handleDocumentLoad}
        notesOpen={notesOpen}
        onToggleNotes={() => setNotesOpen((open) => !open)}
        className="w-full h-full"
        onPageChange={handlePageChange}
        leftPanel={
          <PdfThumbnailRail
            key={fileUrl ?? "none"}
            className="hidden md:flex"
            pdf={pdf}
            currentPage={currentPage}
            onSelect={handleSelectPage}
          />
        }
        rightPanel={
          <>
            {/* Mobile: notes slide over the document; tap the backdrop to close. */}
            {notesOpen && (
              <button
                type="button"
                aria-label="Close notes"
                onClick={() => setNotesOpen(false)}
                className="absolute inset-0 z-20 bg-black/40 md:hidden"
              />
            )}
            <div
              className={`absolute inset-y-0 right-0 z-30 w-[min(90vw,420px)] max-w-full shadow-xl transition-transform duration-200 md:relative md:z-auto md:w-auto md:max-w-none md:translate-x-0 md:shadow-none ${
                notesOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              {/* Keyed by book so switching books flushes the previous note and
                  starts from a clean editor. */}
              <NoteEditor
                key={selectedBook.id}
                bookId={selectedBook.id}
                open={notesOpen}
                onClose={() => setNotesOpen(false)}
              />
            </div>
          </>
        }
      />
    </div>
  );
}

