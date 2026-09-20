"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useUpdateBook } from "../hooks/useUpdateBook";

interface EditBookDialogProps {
  bookId: string;
  initial: {
    title: string;
    author: string;
    tags: string[];
    isFavourite: boolean;
  };
  syncStatus: "synced" | "pending" | "conflict" | "failed";
  open: boolean;
  onClose: () => void;
}

export function EditBookDialog({
  bookId,
  initial,
  syncStatus,
  open,
  onClose,
}: EditBookDialogProps) {
  const updateBook = useUpdateBook();
  const [title, setTitle] = useState(initial.title);
  const [author, setAuthor] = useState(initial.author);
  const [tagsInput, setTagsInput] = useState(initial.tags.join(", "));
  const [isFavourite, setIsFavourite] = useState(initial.isFavourite);

  useEffect(() => {
    if (open) {
      setTitle(initial.title);
      setAuthor(initial.author);
      setTagsInput(initial.tags.join(", "));
      setIsFavourite(initial.isFavourite);
    }
  }, [open, initial]);

  async function handleSave() {
    if (syncStatus === "conflict") {
      toast.error("Resolve the conflict on this book first");
      return;
    }

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const updates: { title?: string; author?: string; tags?: string[]; isFavourite?: boolean } = {};
    if (title !== initial.title) updates.title = title;
    if (author !== initial.author) updates.author = author;
    const sameTags =
      tags.length === initial.tags.length &&
      tags.every((t) => initial.tags.includes(t)) &&
      initial.tags.every((t) => tags.includes(t));
    if (!sameTags) updates.tags = tags;
    if (isFavourite !== initial.isFavourite) updates.isFavourite = isFavourite;

    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    try {
      await updateBook.mutateAsync({
        bookId,
        updates,
      });
      toast.success("Book updated");
      onClose();
    } catch (err) {
      if (err instanceof Error && err.message.includes("conflict")) {
        toast.error("Resolve the conflict on this book first");
      } else {
        toast.error("Failed to update book");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Book</DialogTitle>
          <DialogDescription>
            Update the book metadata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Book title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-author">Author</Label>
            <Input
              id="edit-author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-tags">Tags</Label>
            <Input
              id="edit-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Comma-separated tags"
            />
            <p className="text-xs text-muted-foreground">
              Separate multiple tags with commas
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-favourite"
              checked={isFavourite}
              onCheckedChange={(v) => setIsFavourite(v === true)}
            />
            <Label htmlFor="edit-favourite" className="cursor-pointer">
              Favourite
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateBook.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateBook.isPending}>
            {updateBook.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
