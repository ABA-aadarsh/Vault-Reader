"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Star,
  StickyNote,
  RefreshCcw,
  AlertTriangle,
  CheckCircle,
  TriangleAlert,
} from "lucide-react";
import { BookMenu } from "./BookMenu";
import type { OutboxEntry } from "@/lib/dexie/types";
import { useRetryOutbox, useDiscardOutbox } from "@/features/Books/hooks/useFailedOutbox";

export type VersionStatus = "consistent" | "behind" | "colliding";

export type Book = {
  title: string;
  author: string;
  tags: string[];
  fileId: string;
  docId: string;
  isFavourite?: boolean;
  note?: string;
  image?: string | null;
  imageId?: string | null;
  syncStatus?: "synced" | "pending" | "conflict" | "failed";
  syncScope?: "local" | "cloud";
  fileSyncStatus?: "not_downloaded" | "downloading" | "present" | "failed";
};

type BookCardProps = {
  book: Book;
  type?: "grid" | "list";
  versionStatus?: VersionStatus;
  failedOp?: OutboxEntry;
  onEdit?: (book: Book) => void;
  onDelete?: (book: Book) => void;
  onPromote?: (book: Book) => void;
  onRemoveDownload?: (book: Book) => void;
};

function FailedOpMenu({ failedOp }: { failedOp: OutboxEntry }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { retry } = useRetryOutbox();
  const { discard } = useDiscardOutbox();

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="text-red-600 hover:text-red-700 transition-colors"
        title="Sync failed — tap for options"
      >
        <TriangleAlert className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-card shadow-md py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
            <p>Sync failed for this item.</p>
            {failedOp.lastError && (
              <p className="mt-1 truncate" title={failedOp.lastError}>
                {failedOp.lastError}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={async () => {
              await retry(failedOp.id!);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            Retry sync
          </button>
          <button
            type="button"
            onClick={async () => {
              await discard(failedOp);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors"
          >
            <TriangleAlert className="w-4 h-4" />
            Discard change
          </button>
        </div>
      )}
    </div>
  );
}

export const BookCard = ({
  book,
  type = "grid",
  versionStatus = "consistent",
  failedOp,
  onEdit,
  onDelete,
  onPromote,
  onRemoveDownload,
}: BookCardProps) => {
  const router = useRouter();

  const {
    title,
    author,
    tags,
    image,
    isFavourite,
    note,
    fileId,
    fileSyncStatus,
  } = book;

  const handleCardClick = () => {
    router.push(`/dashboard/book/${fileId}`);
  };

  const renderVersionIcon = () => {
    switch (versionStatus) {
      case "consistent":
        return <CheckCircle className="text-green-600 w-4 h-4" />;
      case "behind":
        return <RefreshCcw className="text-yellow-600 w-4 h-4" />;
      case "colliding":
        return <AlertTriangle className="text-red-600 w-4 h-4" />;
      default:
        return null;
    }
  };

  const fallbackImage = "/placeholder.jpeg";

  if (type === "grid") {
    return (
      <div
        onClick={handleCardClick}
        className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 shadow-sm cursor-pointer hover:shadow-md hover:border-primary/50 transition-all"
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-muted">
          <Image
            src={image ?? fallbackImage}
            alt={title}
            fill
            className="object-cover"
          />
          {fileSyncStatus === "failed" && (
            <div
              className="absolute top-2 right-2 w-3 h-3 rounded-full bg-red-600 border-2 border-white"
              title="PDF download failed"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-sm">
          <h3 className="font-medium text-foreground truncate">{title}</h3>
          {isFavourite && <Star className="text-yellow-400 w-4 h-4" />}
        </div>

        <p className="text-card-foreground text-xs truncate">{author}</p>

        <div className="flex justify-between items-center text-xs">
          <div className="flex gap-1 flex-wrap">
            {tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="bg-accent text-accent-foreground px-2 py-0.5 rounded-md text-[10px]"
              >
                {tag}
              </span>
            ))}
            {tags.length > 2 && (
              <span className="text-muted">+{tags.length - 2}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {note && <StickyNote className="text-muted w-4 h-4" />}
            {renderVersionIcon()}
            {failedOp && <FailedOpMenu failedOp={failedOp} />}
            <BookMenu
              book={book}
              onEdit={onEdit}
              onPromote={onPromote}
              onRemoveDownload={onRemoveDownload}
              onDelete={onDelete}
            />
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div
      onClick={handleCardClick}
      className="bg-card border border-border rounded-md px-4 py-3 flex items-center justify-between gap-4 shadow-sm cursor-pointer hover:shadow-md hover:border-primary/50 transition-all"
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-12 h-16 relative rounded bg-muted overflow-hidden shrink-0">
          <Image
            src={image ?? fallbackImage}
            alt={title}
            fill
            className="object-cover"
          />
          {fileSyncStatus === "failed" && (
            <div
              className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-600 border border-white"
              title="PDF download failed"
            />
          )}
        </div>

        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm truncate text-foreground">
              {title}
            </h3>
            {isFavourite && <Star className="text-yellow-400 w-4 h-4" />}
          </div>
          <p className="text-card-foreground text-xs truncate">{author}</p>
          <div className="flex gap-1 text-[10px] mt-1 flex-wrap">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="bg-accent text-accent-foreground px-2 py-0.5 rounded-md"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {note && <StickyNote className="text-muted w-4 h-4" />}
        {renderVersionIcon()}
        {failedOp && <FailedOpMenu failedOp={failedOp} />}
        <BookMenu
          book={book}
          onEdit={onEdit}
          onPromote={onPromote}
          onRemoveDownload={onRemoveDownload}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
};
