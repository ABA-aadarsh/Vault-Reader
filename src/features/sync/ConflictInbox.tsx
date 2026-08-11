"use client";

import { useEffect, useState, useCallback } from "react";
import type { ConflictEntry } from "@/lib/dexie/types";
import { getOpenConflicts } from "@/features/sync/conflicts";
import { getDb } from "@/lib/dexie/db";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { FieldClashResolver } from "@/features/sync/resolvers/FieldClashResolver";
import { NoteBodyResolver } from "@/features/sync/resolvers/NoteBodyResolver";
import { UpdateVsDeleteResolver } from "@/features/sync/resolvers/UpdateVsDeleteResolver";

export function ConflictInbox() {
  const [open, setOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<ConflictEntry | null>(null);

  const loadConflicts = useCallback(async () => {
    try {
      const db = getDb();
      const open = await getOpenConflicts(db);
      setConflicts(open);
    } catch {
      // DB may not be open
    }
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      loadConflicts();
      setOpen(true);
    };
    window.addEventListener("open-conflict-inbox", handleOpen);
    return () => window.removeEventListener("open-conflict-inbox", handleOpen);
  }, [loadConflicts]);

  useEffect(() => {
    if (open) loadConflicts();
  }, [open, loadConflicts]);

  function getConflictTitle(conflict: ConflictEntry): string {
    if (conflict.entityType === "book") {
      return (conflict.localSnapshot.title as string) ?? "Untitled Book";
    }
    return "Note";
  }

  function getConflictDescription(conflict: ConflictEntry): string {
    switch (conflict.reason) {
      case "field_clash":
        return "Both devices edited the same fields";
      case "note_body":
        return "Note content differs between devices";
      case "update_vs_delete":
        return "One device edited, another deleted";
      case "cas_mismatch":
        return "Version mismatch detected";
      default:
        return "Sync conflict";
    }
  }

  function handleResolve(conflict: ConflictEntry) {
    setSelectedConflict(conflict);
  }

  function handleResolverClose() {
    setSelectedConflict(null);
    loadConflicts();
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Sync Conflicts</SheetTitle>
            <SheetDescription>
              {conflicts.length === 0
                ? "No conflicts to resolve."
                : `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} need your attention.`}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-2 overflow-auto max-h-[calc(100vh-12rem)]">
            {conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="rounded border border-border p-3 flex items-start gap-3"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {getConflictTitle(conflict)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {getConflictDescription(conflict)}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleResolve(conflict)}>
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {selectedConflict && (
        <>
          {selectedConflict.reason === "field_clash" && (
            <FieldClashResolver conflict={selectedConflict} onClose={handleResolverClose} />
          )}
          {selectedConflict.reason === "note_body" && (
            <NoteBodyResolver conflict={selectedConflict} onClose={handleResolverClose} />
          )}
          {selectedConflict.reason === "update_vs_delete" && (
            <UpdateVsDeleteResolver conflict={selectedConflict} onClose={handleResolverClose} />
          )}
        </>
      )}
    </>
  );
}
