"use client";

import {
  BookCard,
  type VersionStatus,
  type BookViewModel,
  toBookViewModel,
  useBooks,
  AddBookButton,
  getImageBlob,
  EditBookDialog,
  useDeleteBook,
  usePromoteBook,
  useRemoveDownload,
  useFailedOutbox,
  LibraryFilterBar,
} from "@/features/Books";
import { useState, useEffect, useMemo } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LayoutGrid, List, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDb } from "@/data/dexie";
import { ConfirmationDialog } from "@/components/shared/ConfirmationDialog";
import { toast } from "sonner";
import {
  DEFAULT_LIBRARY_PREFS,
  getLibraryPrefs,
  setLibraryPrefs,
  type LibraryPrefs,
  type LibrarySort,
} from "@/lib/library-prefs";

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

/** Surface known repo errors (e.g. conflict guards) instead of a bland message. */
function friendlyError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (message.toLowerCase().includes("unresolved conflict")) {
    return "Resolve this book's sync conflict first";
  }
  return fallback;
}

export default function Page() {
  const { data: booksList, isLoading, isError } = useBooks();
  const [booksWithImages, setBooksWithImages] = useState<BookViewModel[]>([]);
  const db = useDb();
  const deleteBook = useDeleteBook();
  const promoteBook = usePromoteBook();
  const removeDownload = useRemoveDownload();
  const { data: failedOutbox } = useFailedOutbox();

  const [prefs, setPrefs] = useState<LibraryPrefs>(DEFAULT_LIBRARY_PREFS);
  const [editingBook, setEditingBook] = useState<BookViewModel | null>(null);
  const [deletingBook, setDeletingBook] = useState<BookViewModel | null>(null);
  const [promotingBook, setPromotingBook] = useState<BookViewModel | null>(null);

  // Load persisted view preferences after mount (localStorage is client-only,
  // so reading it in the initializer would cause a hydration mismatch).
  useEffect(() => {
    setPrefs(getLibraryPrefs());
  }, []);

  const updatePrefs = (patch: Partial<LibraryPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      setLibraryPrefs(next);
      return next;
    });
  };

  const failedOpFor = (docId: string) =>
    failedOutbox?.find((op) => op.entityId === docId);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    (booksList ?? []).forEach((book) => book.tags.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [booksList]);

  // Filter + sort before image blobs are loaded, so filters apply immediately.
  const visibleBooks = useMemo(() => {
    if (!booksList) return [];

    const activeTags = prefs.filterTags;
    const filtered = booksList.filter((book) => {
      if (prefs.onlyFavourites && !book.isFavourite) return false;
      if (activeTags.length > 0 && !activeTags.some((tag) => book.tags.includes(tag))) {
        return false;
      }
      return true;
    });

    if (prefs.sort === "title") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (prefs.sort === "author") {
      return [...filtered].sort(
        (a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title),
      );
    }

    // "Recently added": newest first. Dexie's primary key is a UUID, so
    // toArray() order carries no recency information — use createdAt, falling
    // back to updatedAt for rows created before the field existed.
    const addedAt = (book: (typeof filtered)[number]) =>
      book.createdAt ?? book.updatedAt;
    return [...filtered].sort(
      (a, b) => addedAt(b) - addedAt(a) || a.title.localeCompare(b.title),
    );
  }, [booksList, prefs]);

  // Resolve cover blobs for the visible books into object URLs.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    const loadImages = async () => {
      const mapped = await Promise.all(
        visibleBooks.map(async (book) => {
          const uiBook: BookViewModel = toBookViewModel(book);
          if (!book.imageId) return uiBook;

          try {
            const imageBlob = await getImageBlob(db, book.imageId);
            if (imageBlob) {
              const url = URL.createObjectURL(imageBlob);
              created.push(url);
              uiBook.image = url;
            }
          } catch (error) {
            console.error(`Error loading image for book ${book.title}:`, error);
          }
          return uiBook;
        }),
      );

      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setBooksWithImages(mapped);
    };

    loadImages();

    // Give React a moment to paint the replacement URLs before releasing the
    // previous ones (revoking first causes broken images mid-render).
    return () => {
      cancelled = true;
      if (created.length > 0) {
        setTimeout(() => created.forEach((url) => URL.revokeObjectURL(url)), 1000);
      }
    };
  }, [visibleBooks, db]);

  // Merge freshly created URLs onto the filtered list, by book id.
  const displayBooks = useMemo(() => {
    const byId = new Map(booksWithImages.map((book) => [book.docId, book]));
    return visibleBooks.map((book) => byId.get(book.id) ?? toBookViewModel(book));
  }, [visibleBooks, booksWithImages]);

  if (isLoading) return <p>Loading...</p>;
  if (isError) return <p>Error loading books.</p>;

  const handleConfirmDelete = async () => {
    if (!deletingBook) return;
    try {
      await deleteBook.mutateAsync({ bookId: deletingBook.docId });
      setDeletingBook(null);
      toast.success("Book deleted");
    } catch (error) {
      console.error("Error deleting book:", error);
      toast.error(friendlyError(error, "Failed to delete book"));
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
      toast.error(friendlyError(error, "Failed to promote book"));
    }
  };

  const handleRemoveDownload = async (book: BookViewModel) => {
    try {
      await removeDownload.mutateAsync(book.docId);
      toast.success("Download removed");
    } catch (error) {
      console.error("Error removing download:", error);
      toast.error(friendlyError(error, "Failed to remove download"));
    }
  };

  const handleToggleTag = (tag: string) => {
    const activeTags = prefs.filterTags.includes(tag)
      ? prefs.filterTags.filter((value) => value !== tag)
      : [...prefs.filterTags, tag];
    updatePrefs({ filterTags: activeTags });
  };

  const handleClearFilters = () => {
    updatePrefs({ filterTags: [], onlyFavourites: false });
  };

  const totalCount = booksList?.length ?? 0;
  const libraryIsEmpty = totalCount === 0;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-semibold">Your Library</h2>
        <div className="flex items-center space-x-4">
          <AddBookButton />
          <ToggleGroup
            type="single"
            value={prefs.viewMode}
            onValueChange={(value) => {
              if (value) updatePrefs({ viewMode: value as LibraryPrefs["viewMode"] });
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

      {!libraryIsEmpty && (
        <LibraryFilterBar
          sort={prefs.sort}
          onSortChange={(sort: LibrarySort) => updatePrefs({ sort })}
          availableTags={availableTags}
          selectedTags={prefs.filterTags}
          onToggleTag={handleToggleTag}
          onlyFavourites={prefs.onlyFavourites}
          onToggleFavourites={() => updatePrefs({ onlyFavourites: !prefs.onlyFavourites })}
          onClear={handleClearFilters}
        />
      )}

      {libraryIsEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/60 py-16 text-center">
          <Library className="mb-3 h-8 w-8 text-muted-foreground/60" />
          <h3 className="text-sm font-medium">Your library is empty</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Add a PDF to start reading. Books can stay on this device or sync
            across devices through your cloud library.
          </p>
          <div className="mt-4">
            <AddBookButton />
          </div>
        </div>
      ) : visibleBooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/60 py-16 text-center">
          <Library className="mb-3 h-8 w-8 text-muted-foreground/60" />
          <h3 className="text-sm font-medium">No books match these filters</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a different tag or clear the filters.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 cursor-pointer"
            onClick={handleClearFilters}
          >
            Clear filters
          </Button>
        </div>
      ) : prefs.viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {displayBooks.map((book) => (
            <BookCard
              key={book.docId}
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
          {displayBooks.map((book) => (
            <BookCard
              key={book.docId}
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
