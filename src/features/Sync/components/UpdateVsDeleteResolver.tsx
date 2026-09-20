"use client";

import { useState } from "react";
import type { ConflictEntry } from "@/data/dexie";
import { restoreConflict, confirmDeleteConflict } from "../data/conflicts";
import { getDb } from "@/data/dexie";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface UpdateVsDeleteResolverProps {
  conflict: ConflictEntry;
  onClose: () => void;
}

export function UpdateVsDeleteResolver({ conflict, onClose }: UpdateVsDeleteResolverProps) {
  const [resolving, setResolving] = useState(false);
  const local = conflict.localSnapshot;

  async function handleRestore() {
    setResolving(true);
    try {
      const db = getDb();
      await restoreConflict(db, conflict.id!);
      onClose();
    } catch (err) {
      console.error("Failed to restore:", err);
    } finally {
      setResolving(false);
    }
  }

  async function handleConfirmDelete() {
    setResolving(true);
    try {
      const db = getDb();
      await confirmDeleteConflict(db, conflict.id!);
      onClose();
    } catch (err) {
      console.error("Failed to confirm delete:", err);
    } finally {
      setResolving(false);
    }
  }

  const title = conflict.entityType === "book" 
    ? (local.title as string) ?? "Untitled"
    : "Note";

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update vs Delete Conflict</DialogTitle>
          <DialogDescription>
            You edited &quot;{title}&quot; but another device deleted it. Choose what to do.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <div className="rounded border border-border p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">Your local changes</div>
            {conflict.entityType === "book" ? (
              <div className="text-sm space-y-1">
                <div><span className="font-medium">Title:</span> {String(local.title ?? "")}</div>
                <div><span className="font-medium">Author:</span> {String(local.author ?? "")}</div>
                <div><span className="font-medium">Tags:</span> {((local.tags as string[]) ?? []).join(", ")}</div>
              </div>
            ) : (
              <pre className="text-xs whitespace-pre-wrap font-mono max-h-32 overflow-auto">
                {String(local.body ?? "")}
              </pre>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={resolving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirmDelete} disabled={resolving}>
            {resolving ? "Deleting..." : "Confirm Delete"}
          </Button>
          <Button onClick={handleRestore} disabled={resolving}>
            {resolving ? "Restoring..." : "Restore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

