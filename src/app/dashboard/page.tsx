"use client";

import { Book, BookCard, type VersionStatus } from "@/features/Books/_components/BookCard";
import { useState, useEffect } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LayoutGrid, List } from "lucide-react";
import { useBooks } from "@/features/Books/hooks/useBooks";
import {
  AddBookButton,
} from "@/features/Books/provider/BookDropAddProvider";
import { useDb } from "@/lib/dexie/db";
import { getImageBlob } from "@/lib/images";
import { ConfirmationDialog } from "@/components/shared/ConfirmationDialog";
import { EditBookDialog } from "@/features/Books/_components/EditBookDialog";
import { useDeleteBook } from "@/features/Books/hooks/useDeleteBook";
import { usePromoteBook } from "@/features/Books/hooks/usePromoteBook";
import { useRemoveDownload } from "@/features/Books/hooks/useRemoveDownload";
import { useFailedOutbox } from "@/features/Books/hooks/useFailedOutbox";
import { toast } from "sonner";

function versionStatusFrom(syncStatus?: string): VersionStatus {
  switch (syncStatus) {
    case "conflict":
    case "failed":
      return "colliding";
    case "pending":
      return "behind";
    default:
      return "consistent";
  }
}

export default function Page() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const { data: booksList, isLoading, isError } = useBooks();
  const [booksWithImages, setBooksWithImages] = useState<Book[]>([]);
  const db = useDb();
  const deleteBook = useDeleteBook();
  const promoteBook = usePromoteBook();
  const removeDownload = useRemoveDownload();
  const { data: failedOutbox } = useFailedOutbox();

  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [deletingBook, setDeletingBook] = useState<Book | null>(null);
  const [promotingBook, setPromotingBook] = useState<Book | null>(null);

  const failedOpFor = (docId: string) =>
    failedOutbox?.find((op) => op.entityId === docId);

  // Fetch image blobs for local books and create blob URLs
  useEffect(() => {
    if (!booksList) return;

    const loadImages = async () => {
      const booksWithImageUrls = await Promise.all(
        booksList.map(async (book) => {
          const uiBook: Book = {
            title: book.title,
            author: book.author,
            tags: book.tags,
            fileId: book.fileId,
            docId: book.id,
            isFavourite: book.isFavourite,
            imageId: book.imageId,
            syncStatus: book.syncStatus,
            syncScope: book.syncScope,
            fileSyncStatus: book.fileSyncStatus,
          };
          try {
            if (book.imageId) {
              const imageBlob = await getImageBlob(db, book.imageId);
              if (imageBlob) {
                uiBook.image = URL.createObjectURL(imageBlob);
              }
            }
          } catch (error) {
            console.error(`Error loading image for book ${book.title}:`, error);
          }
          return uiBook;
        })
      );
      setBooksWithImages(booksWithImageUrls);
    };

    loadImages();

    // Cleanup blob URLs on unmount
    return () => {
      booksWithImages.forEach((book) => {
        if (book.image?.startsWith("blob:")) {
          URL.revokeObjectURL(book.image);
        }
      });
    };
  }, [booksList, db]);

  if (isLoading) return <p>Loading...</p>;
  if (isError) return <p>Error loading books.</p>;

  const displayBooks = booksWithImages.length > 0
    ? booksWithImages
    : (booksList || []).map((b) => ({
        title: b.title,
        author: b.author,
        tags: b.tags,
        fileId: b.fileId,
        docId: b.id,
        isFavourite: b.isFavourite,
        imageId: b.imageId,
        syncStatus: b.syncStatus,
        syncScope: b.syncScope,
        fileSyncStatus: b.fileSyncStatus,
      } as Book));

  const handleConfirmDelete = async () => {
    if (!deletingBook) return;
    try {
      await deleteBook.mutateAsync({ bookId: deletingBook.docId });
      setDeletingBook(null);
      setBooksWithImages((prev) => prev.filter((b) => b.fileId !== deletingBook.fileId));
      toast.success("Book deleted");
    } catch (error) {
      console.error("Error deleting book:", error);
      toast.error("Failed to delete book");
    }
  };

  const handleConfirmPromote = async () => {
    if (!promotingBook) return;
    try {
      await promoteBook.mutateAsync(promotingBook.docId);
      setPromotingBook(null);
      toast.success("Book promoted to cloud");
    } catch (error) {
      console.error("Error promoting book:", error);
      toast.error("Failed to promote book");
    }
  };

  const handleRemoveDownload = async (book: Book) => {
    try {
      await removeDownload.mutateAsync(book.docId);
      toast.success("Download removed");
    } catch (error) {
      console.error("Error removing download:", error);
      toast.error("Failed to remove download");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Your Library</h2>
        <div className="flex items-center space-x-4">
          <AddBookButton />
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value) setViewMode(value as "grid" | "list");
            }}
            className="gap-1"
          >
            <ToggleGroupItem
              value="grid"
              aria-label="Grid View"
              className="!rounded-sm cursor-pointer"
            >
              <LayoutGrid className="w-5 h-5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="list"
              aria-label="List View"
              className="!rounded-sm cursor-pointer"
            >
              <List className="w-5 h-5" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {displayBooks?.map((book) => (
            <BookCard
              key={book.fileId}
              book={book}
              type="grid"
              versionStatus={versionStatusFrom(book.syncStatus)}
              failedOp={failedOpFor(book.docId)}
              onEdit={setEditingBook}
              onDelete={setDeletingBook}
              onPromote={setPromotingBook}
              onRemoveDownload={handleRemoveDownload}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {displayBooks?.map((book) => (
            <BookCard
              key={book.fileId}
              book={book}
              type="list"
              versionStatus={versionStatusFrom(book.syncStatus)}
              failedOp={failedOpFor(book.docId)}
              onEdit={setEditingBook}
              onDelete={setDeletingBook}
              onPromote={setPromotingBook}
              onRemoveDownload={handleRemoveDownload}
            />
          ))}
        </div>
      )}

      {/* Edit dialog — rendered at page level, outside any card */}
      {editingBook && (
        <EditBookDialog
          bookId={editingBook.docId}
          initial={{
            title: editingBook.title,
            author: editingBook.author,
            tags: editingBook.tags,
            isFavourite: editingBook.isFavourite ?? false,
          }}
          syncStatus={editingBook.syncStatus ?? "synced"}
          open={!!editingBook}
          onClose={() => setEditingBook(null)}
        />
      )}

      {/* Delete dialog — rendered at page level, outside any card */}
      <ConfirmationDialog
        open={!!deletingBook}
        onOpenChange={(open) => { if (!open) setDeletingBook(null); }}
        title="Delete Book"
        description={
          deletingBook
            ? deletingBook.syncScope === "local"
              ? `Are you sure you want to delete "${deletingBook.title}"? This will permanently remove it from this device.`
              : `Are you sure you want to delete "${deletingBook.title}"? It will be removed from your library on all devices. You can restore it from Recently deleted for 30 days.`
            : ""
        }
        onConfirm={handleConfirmDelete}
        isLoading={deleteBook.isPending}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />

      {/* Promote dialog — rendered at page level, outside any card */}
      <ConfirmationDialog
        open={!!promotingBook}
        onOpenChange={(open) => { if (!open) setPromotingBook(null); }}
        title="Promote to cloud"
        description={
          promotingBook
            ? `Upload "${promotingBook.title}" to your cloud library? It will sync across your devices.`
            : ""
        }
        onConfirm={handleConfirmPromote}
        isLoading={promoteBook.isPending}
        confirmText="Promote"
        cancelText="Cancel"
        variant="default"
      />
    </div>
  );
}
