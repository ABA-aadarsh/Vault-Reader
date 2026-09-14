"use client";

import { NoteEditor } from "@/features/Note/_components/NoteEditor";
import { PDFViewer, type PDFViewerHandle } from "@/features/PDFViewer/PDFViewer";
import { useBooks } from "@/features/Books/hooks/useBooks";
import { useState, useEffect, useCallback, useRef } from "react";
import React from "react";
import { Loader2, FileWarning, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDb } from "@/lib/dexie/db";
import { getFileBlob } from "@/lib/files";
import { downloadPdf } from "@/features/sync/filePlanner";
import { setPage } from "@/lib/readingState";
import type { Book } from "@/lib/domain";
import { useAuth } from "@/features/supabase/auth/components/RequireAuth";
import { useRouter } from "next/navigation";

interface PageProps {
  params: Promise<{
    bookId: string;
  }>;
}

export default function BookViewPage({ params }: PageProps) {
  const { bookId } = React.use(params);
  const { data: books, isLoading } = useBooks();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isFetchingFile, setIsFetchingFile] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const db = useDb();
  const { user } = useAuth();
  const router = useRouter();
  const blobUrlRef = useRef<string | null>(null);
  const selectedBookRef = useRef<Book | null>(null);
  const viewerRef = useRef<PDFViewerHandle>(null);
  selectedBookRef.current = selectedBook;

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
      const book = books?.find((b) => b.fileId === bookId);
      setSelectedBook(book || null);
    }
  }, [bookId, books, isLoading]);

  // Fetch the actual file blob and create blob URL
  const fetchFileBlob = useCallback(
    async (forRetry = false) => {
      const book = selectedBookRef.current;
      if (!book) return;

      try {
        setIsFetchingFile(true);
        if (forRetry) setLoadFailed(false);

        let blob = await getFileBlob(db, book.fileId);

        if (!blob && book.syncScope === "cloud") {
          blob = await downloadPdf(db, user.id, book);
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
          <h2 className="text-2xl font-semibold">Failed to load PDF</h2>
          <p className="text-muted">
            The file could not be downloaded. Check your connection and try again.
          </p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => fetchFileBlob(true)} disabled={isFetchingFile}>
              {isFetchingFile ? "Retrying..." : "Retry"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex  bg-background">
      {isFetchingFile && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-50 rounded-lg">
          <Loader2 className="w-8 h-8 animate-spin text-muted" />
        </div>
      )}

      <div className="flex-1 min-w-0 relative">
        <PDFViewer
          ref={viewerRef}
          fileUrl={fileUrl}
          className="w-full h-full"
          onPageChange={(page, totalPages) => {
            if (selectedBook) {
              setPage(db, selectedBook.id, page, totalPages);
            }
          }}
        />
      </div>

      <NoteEditor bookId={selectedBook.id} />
    </div>
  );
}
