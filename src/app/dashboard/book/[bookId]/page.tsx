"use client";

import { NoteEditor } from "@/features/Note/_components/NoteEditor";
import { PDFViewer } from "@/features/PDFViewer/PDFViewer";
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
      if (!selectedBook) return;

      try {
        setIsFetchingFile(true);
        if (forRetry) setLoadFailed(false);

        let blob = await getFileBlob(db, selectedBook.fileId);

        if (!blob && selectedBook.syncScope === "cloud") {
          blob = await downloadPdf(db, user.id, selectedBook);
        }

        if (blob) {
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
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
    [selectedBook, db, user.id],
  );

  useEffect(() => {
    if (!selectedBook) return;

    fetchFileBlob();

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [selectedBook, db, user.id, fetchFileBlob]);

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
            The book you're looking for doesn't exist.
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

      <PDFViewer
        fileUrl={fileUrl}
        className="w-full h-full"
        onPageChange={(page, totalPages) => {
          if (selectedBook) {
            setPage(db, selectedBook.id, page, totalPages);
          }
        }}
      />

      {/* <NoteEditor /> */}
    </div>
  );
}
