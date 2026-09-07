"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, CloudUpload, Download, Trash2 } from "lucide-react";
import type { Book } from "./BookCard";
import { useAuth } from "@/features/supabase/auth/components/RequireAuth";

interface BookMenuProps {
  book: Book;
  onEdit?: (book: Book) => void;
  onPromote?: (book: Book) => void;
  onRemoveDownload?: (book: Book) => void;
  onDelete?: (book: Book) => void;
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive = false,
  disabled = false,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function BookMenu({
  book,
  onEdit,
  onPromote,
  onRemoveDownload,
  onDelete,
}: BookMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { session, fromCache } = useAuth();

  const sessionExpired = fromCache || (session.expires_at
    ? session.expires_at * 1000 < Date.now()
    : false);
  const isLocal = book.syncScope === "local";
  const hasDownload = book.fileSyncStatus === "present";

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const trigger = (fn?: (book: Book) => void) => () => {
    setOpen(false);
    fn?.(book);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="More actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-48 rounded-md border border-border bg-card shadow-md py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            icon={<Pencil className="w-4 h-4" />}
            label="Edit"
            onClick={trigger(onEdit)}
          />
          {isLocal && (
            <MenuItem
              icon={<CloudUpload className="w-4 h-4" />}
              label="Promote to cloud"
              onClick={trigger(onPromote)}
              disabled={sessionExpired}
              title={sessionExpired ? "Sign in to sync" : undefined}
            />
          )}
          {!isLocal && hasDownload && (
            <MenuItem
              icon={<Download className="w-4 h-4" />}
              label="Remove download"
              onClick={trigger(onRemoveDownload)}
            />
          )}
          <MenuItem
            icon={<Trash2 className="w-4 h-4" />}
            label="Delete from library"
            onClick={trigger(onDelete)}
            destructive
          />
        </div>
      )}
    </div>
  );
}
