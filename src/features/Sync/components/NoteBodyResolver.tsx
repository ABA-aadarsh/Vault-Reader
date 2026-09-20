"use client";

import { useState } from "react";
import type { ConflictEntry } from "@/data/dexie";
import { resolveConflict } from "../data/conflicts";
import { getDb } from "@/data/dexie";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface NoteBodyResolverProps {
  conflict: ConflictEntry;
  onClose: () => void;
}

export function NoteBodyResolver({ conflict, onClose }: NoteBodyResolverProps) {
  const [resolving, setResolving] = useState(false);
  const [selection, setSelection] = useState<"local" | "remote">("local");
  const local = conflict.localSnapshot;
  const remote = conflict.remoteSnapshot;

  async function handleResolve() {
    setResolving(true);
    try {
      const db = getDb();
      const winner = selection === "local" ? local : remote;
      await resolveConflict(db, conflict.id!, winner, Number(remote.revision));
      onClose();
    } catch (err) {
      console.error("Failed to resolve conflict:", err);
    } finally {
      setResolving(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Resolve Note Conflict</DialogTitle>
          <DialogDescription>
            Choose which version of the note to keep.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4 flex-1 overflow-hidden">
          <div className="flex flex-col overflow-hidden">
            <button
              type="button"
              className={`rounded border p-3 text-left text-sm transition mb-2 ${
                selection === "local"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted"
              }`}
              onClick={() => setSelection("local")}
            >
              <div className="text-xs font-medium text-muted-foreground mb-1">Your version</div>
            </button>
            <div className="flex-1 overflow-auto rounded border border-border p-3 bg-muted/30">
              <pre className="text-xs whitespace-pre-wrap font-mono">
                {String(local.body ?? "")}
              </pre>
            </div>
          </div>
          <div className="flex flex-col overflow-hidden">
            <button
              type="button"
              className={`rounded border p-3 text-left text-sm transition mb-2 ${
                selection === "remote"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted"
              }`}
              onClick={() => setSelection("remote")}
            >
              <div className="text-xs font-medium text-muted-foreground mb-1">Remote version</div>
            </button>
            <div className="flex-1 overflow-auto rounded border border-border p-3 bg-muted/30">
              <pre className="text-xs whitespace-pre-wrap font-mono">
                {String(remote.body ?? "")}
              </pre>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={resolving}>
            Cancel
          </Button>
          <Button onClick={handleResolve} disabled={resolving}>
            {resolving ? "Resolving..." : "Resolve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

