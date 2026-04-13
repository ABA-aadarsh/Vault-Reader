"use client";

import { NoteEditor } from "@/features/Note/_components/NoteEditor";
import { PDFViewer } from "@/features/PDFViewer/PDFViewer";
import { useLocalBookList } from "@/features/Books/hooks/useLocalBookList";
import { useCloudBookList } from "@/features/Books/hooks/useCloudBookList";
import { useState, useEffect, useMemo } from "react";
import React from "react";
import { Loader2 } from "lucide-react";
import BooksAPI from "@/features/supabase/books/book.service";

interface PageProps {
  params: Promise<{
    bookId: string;
  }>;
}

export default function BookViewPage({ params }: PageProps) {
  const { bookId } = React.use(params);
  const { data: localBooks, isLoading: localLoading } = useLocalBookList();
  const { data: cloudBooks, isLoading: cloudLoading } = useCloudBookList();
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingFile, setIsFetchingFile] = useState(false);

  // Find the book in either local or cloud books
  useEffect(() => {
    if (!localLoading && !cloudLoading) {
      console.log({ localBooks, cloudBooks });
      const book =
        localBooks?.find((b) => b.fileId === bookId) ||
        cloudBooks?.find((b) => b.fileId === bookId);

      setSelectedBook(book || null);
      setIsLoading(false);
    }
  }, [bookId, localBooks, cloudBooks, localLoading, cloudLoading]);

  // Fetch the actual file blob for local books and create blob URL
  useEffect(() => {
    if (!selectedBook) return;

    let isMounted = true;
    let currentBlobUrl: string | null = null;

    const fetchFileBlob = async () => {
      try {
        setIsFetchingFile(true);

        // Check if this is a local book by checking if it exists in localBooks
        const isLocalBook = localBooks?.some(
          (b) => b.fileId === selectedBook.fileId,
        );

        if (isLocalBook) {
          // Fetch file blob from Dexie for local books
          const fileBlob = await BooksAPI.getlocalBook(selectedBook.fileId);

          if (!isMounted) return;

          if (fileBlob) {
            // Create blob URL for the file
            currentBlobUrl = URL.createObjectURL(fileBlob);
            setFileUrl(currentBlobUrl);
          } else {
            console.error("File blob not found for local book");
            setFileUrl(null);
          }
        } else {
          // For cloud books, use the existing fileUrl from selectedBook
          setFileUrl(selectedBook.fileUrl || null);
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

    // Cleanup: revoke the blob URL when component unmounts or selectedBook changes
    return () => {
      isMounted = false;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [selectedBook, localBooks]);

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

  const { fileId, title, author } = selectedBook;

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
