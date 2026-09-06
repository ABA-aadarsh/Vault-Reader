"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Star,
  StickyNote,
  RefreshCcw,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { BookMenu } from "./BookMenu";

export type VersionStatus = "consistent" | "behind" | "colliding";

export type Book = {
  title: string;
  author: string;
  tags: string[];
  fileId: string;
  docId: string;
  fileUrl?: string;
  version?: string;
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
  onDeleted?: () => void;
  onEdit?: (book: Book) => void;
  onDelete?: (book: Book) => void;
  onPromote?: (book: Book) => void;
  onRemoveDownload?: (book: Book) => void;
};

export const BookCard = ({
  book,
  type = "grid",
  versionStatus = "consistent",
  onDeleted,
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

  const fallbackImage = "/placeholder.png";

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
