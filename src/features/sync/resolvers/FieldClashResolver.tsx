"use client";

import { useState } from "react";
import type { ConflictEntry } from "@/lib/dexie/types";
import { resolveConflict } from "@/features/sync/conflicts";
import { getDb } from "@/lib/dexie/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface FieldClashResolverProps {
  conflict: ConflictEntry;
  onClose: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  author: "Author",
  tags: "Tags",
  isFavourite: "Favourite",
};

export function FieldClashResolver({ conflict, onClose }: FieldClashResolverProps) {
  const [resolving, setResolving] = useState(false);
  const local = conflict.localSnapshot;
  const remote = conflict.remoteSnapshot;

  const clashingFields =
    conflict.clashingFields?.length
      ? conflict.clashingFields
      : Object.keys(FIELD_LABELS).filter((field) => {
          const localVal = JSON.stringify(local[field]);
          const remoteVal = JSON.stringify(remote[field]);
          return localVal !== remoteVal;
        });

  const [selections, setSelections] = useState<Record<string, "local" | "remote">>(() => {
    const initial: Record<string, "local" | "remote"> = {};
    for (const field of clashingFields) {
      initial[field] = "local";
    }
    return initial;
  });

  async function handleResolve() {
    setResolving(true);
    try {
      const db = getDb();
      const winner: Record<string, unknown> = { ...local };
      for (const field of clashingFields) {
        if (selections[field] === "remote") {
          winner[field] = remote[field];
        }
      }
      await resolveConflict(db, conflict.id!, winner, Number(remote.revision));
      onClose();
    } catch (err) {
      console.error("Failed to resolve conflict:", err);
    } finally {
      setResolving(false);
    }
  }

  function formatValue(field: string, value: unknown): string {
    if (field === "tags") return (value as string[])?.join(", ") ?? "";
    if (field === "isFavourite") return value ? "Yes" : "No";
    return String(value ?? "");
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve Field Conflict</DialogTitle>
          <DialogDescription>
            Choose which version to keep for each field.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {clashingFields.map((field) => (
            <div key={field} className="space-y-2">
              <label className="text-sm font-medium">{FIELD_LABELS[field]}</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`rounded border p-3 text-left text-sm transition ${
                    selections[field] === "local"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted"
                  }`}
                  onClick={() => setSelections((s) => ({ ...s, [field]: "local" }))}
                >
                  <div className="text-xs text-muted-foreground mb-1">Your version</div>
                  <div className="font-medium">{formatValue(field, local[field])}</div>
                </button>
                <button
                  type="button"
                  className={`rounded border p-3 text-left text-sm transition ${
                    selections[field] === "remote"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted"
                  }`}
                  onClick={() => setSelections((s) => ({ ...s, [field]: "remote" }))}
                >
                  <div className="text-xs text-muted-foreground mb-1">Remote version</div>
                  <div className="font-medium">{formatValue(field, remote[field])}</div>
                </button>
              </div>
            </div>
          ))}
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
