"use client";

import { NoteEditor } from "@/features/Note/_components/NoteEditor";
import { PDFViewer } from "@/features/PDFViewer/PDFViewer";
import { useBooks } from "@/features/Books/hooks/useBooks";
import { useState, useEffect } from "react";
import React from "react";
import { Loader2 } from "lucide-react";
import { useDb } from "@/lib/dexie/db";
import { getFileBlob } from "@/lib/files";
import { downloadPdf } from "@/features/sync/filePlanner";
import type { Book } from "@/lib/domain";
import { useAuth } from "@/features/supabase/auth/components/RequireAuth";

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
  const db = useDb();
  const { user } = useAuth();

  // Find the book in the list
  useEffect(() => {
    if (!isLoading) {
      const book = books?.find((b) => b.fileId === bookId);
      setSelectedBook(book || null);
    }
  }, [bookId, books, isLoading]);

  // Fetch the actual file blob and create blob URL
  useEffect(() => {
    if (!selectedBook) return;

    let isMounted = true;
    let currentBlobUrl: string | null = null;

    const fetchFileBlob = async () => {
      try {
        setIsFetchingFile(true);

        let blob = await getFileBlob(db, selectedBook.fileId);

        if (!blob && selectedBook.syncScope === "cloud") {
          blob = await downloadPdf(db, user.id, selectedBook);
        }

        if (!isMounted) return;

        if (blob) {
          currentBlobUrl = URL.createObjectURL(blob);
          setFileUrl(currentBlobUrl);
        } else {
          console.error("File blob not found for book");
          setFileUrl(null);
        }
      } catch (error) {
        console.error("Error fetching file blob:", error);
        if (isMounted) {
          setFileUrl(null);
        }
      } finally {
        if (isMounted) {
          setIsFetchingFile(false);
        }
      }
    };

    fetchFileBlob();

    return () => {
      isMounted = false;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [selectedBook, db, user.id]);

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

  return (
    <div className="h-screen flex  bg-background">
      {isFetchingFile && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-50 rounded-lg">
          <Loader2 className="w-8 h-8 animate-spin text-muted" />
        </div>
      )}

      <PDFViewer fileUrl={fileUrl} className="w-full h-full" />

      {/* <NoteEditor /> */}
    </div>
  );
}
