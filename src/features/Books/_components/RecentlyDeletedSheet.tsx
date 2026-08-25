"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw } from "lucide-react";
import { useRecentlyDeleted } from "@/features/Books/hooks/useRecentlyDeleted";
import { useRestoreBook } from "@/features/Books/hooks/useRestoreBook";
import { useDeleteBook } from "@/features/Books/hooks/useDeleteBook";
import { toast } from "sonner";

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function RecentlyDeletedSheet() {
  const [open, setOpen] = useState(false);
  const { data: deleted = [], refetch } = useRecentlyDeleted();
  const restoreBook = useRestoreBook();
  const deleteBook = useDeleteBook();

  useEffect(() => {
    const handle = () => setOpen(true);
    window.addEventListener("open-recently-deleted", handle);
    return () => window.removeEventListener("open-recently-deleted", handle);
  }, []);

  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  async function handleRestore(bookId: string) {
    try {
      await restoreBook.mutateAsync(bookId);
      toast.success("Book restored");
    } catch {
      toast.error("Failed to restore book");
    }
  }

  async function handlePurge(bookId: string) {
    try {
      await deleteBook.mutateAsync({ bookId, hard: true });
      toast.success("Book permanently deleted");
    } catch {
      toast.error("Failed to delete book");
    }
  }

  function daysLeft(deletedAt: number | null): number {
    if (!deletedAt) return 0;
    return Math.max(0, Math.ceil((deletedAt + TOMBSTONE_TTL_MS - Date.now()) / 86400000));
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Recently deleted</SheetTitle>
          <SheetDescription>
            {deleted.length === 0
              ? "No deleted books."
              : "Books are kept for 30 days, then permanently removed."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2 overflow-auto">
          {deleted.map((book) => (
            <div
              key={book.id}
              className="rounded border border-border p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{book.title}</div>
                <div className="text-xs text-muted-foreground">
                  {daysLeft(book.deletedAt)} day{daysLeft(book.deletedAt) === 1 ? "" : "s"} left
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRestore(book.id)}
                  disabled={restoreBook.isPending}
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handlePurge(book.id)}
                  disabled={deleteBook.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete forever
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
