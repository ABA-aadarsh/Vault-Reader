"use client";

import { Star, X, HardDriveDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LibrarySort } from "@/lib/library-prefs";

const SORT_OPTIONS: Array<{ value: LibrarySort; label: string }> = [
  { value: "added", label: "Recently added" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
];

interface LibraryFilterBarProps {
  sort: LibrarySort;
  onSortChange: (sort: LibrarySort) => void;
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onlyFavourites: boolean;
  onToggleFavourites: () => void;
  onlyDownloaded: boolean;
  onToggleDownloaded: () => void;
  onClear: () => void;
}

export function LibraryFilterBar({
  sort,
  onSortChange,
  availableTags,
  selectedTags,
  onToggleTag,
  onlyFavourites,
  onToggleFavourites,
  onlyDownloaded,
  onToggleDownloaded,
  onClear,
}: LibraryFilterBarProps) {
  const hasActiveFilter = selectedTags.length > 0 || onlyFavourites || onlyDownloaded;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onToggleFavourites}
          aria-pressed={onlyFavourites}
          className={`h-7 rounded-full border px-2.5 text-xs cursor-pointer ${
            onlyFavourites
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${onlyFavourites ? "fill-current" : ""}`} />
          Favourites
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onToggleDownloaded}
          aria-pressed={onlyDownloaded}
          className={`h-7 rounded-full border px-2.5 text-xs cursor-pointer ${
            onlyDownloaded
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          <HardDriveDownload className="h-3.5 w-3.5" />
          Downloaded
        </Button>

        {availableTags.map((tag) => {
          const active = selectedTags.includes(tag);
          return (
            <Button
              key={tag}
              type="button"
              size="sm"
              variant={active ? "secondary" : "ghost"}
              onClick={() => onToggleTag(tag)}
              aria-pressed={active}
              className={`h-7 rounded-full border px-2.5 text-xs cursor-pointer ${
                active
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {tag}
            </Button>
          );
        })}

        {hasActiveFilter && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClear}
            className="h-7 cursor-pointer px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Sort */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="text-xs text-muted-foreground">Sort by</span>
        <Select
          value={sort}
          onValueChange={(value) => onSortChange(value as LibrarySort)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Sort by"
            className="w-[150px] cursor-pointer text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
