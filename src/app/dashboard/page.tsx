"use client";

import { Book, BookCard } from "@/features/Books/_components/BookCard";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LayoutGrid, List, Plus } from "lucide-react";
import { useLocalBookList } from "@/features/Books/hooks/useLocalBookList";
import { useCloudBookList } from "@/features/Books/hooks/useCloudBookList";
import { Button } from "@/components/ui/button";
import {
  AddBookButton,
  useBookAdd,
} from "@/features/Books/provider/BookDropAddProvider";

export default function Page() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const { data: dummyBooks, isLoading, isError } = useCloudBookList();
  // const localBooks: Book[] = []

  if (isLoading) return <p>Loading...</p>;
  if (isError) return <p>Error loading books.</p>;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Your Library</h2>
        <div className="flex items-center space-x-4">
          <AddBookButton/>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value) setViewMode(value as "grid" | "list");
            }}
            className="gap-1"
          >
            <ToggleGroupItem
              value="grid"
              aria-label="Grid View"
              className="!rounded-sm cursor-pointer"
            >
              <LayoutGrid className="w-5 h-5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="list"
              aria-label="List View"
              className="!rounded-sm cursor-pointer"
            >
              <List className="w-5 h-5" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {dummyBooks?.map((book, i) => (
            <BookCard
              key={book.fileId}
              book={book}
              type="grid"
              versionStatus={
                i === 0 ? "consistent" : i === 1 ? "behind" : "colliding"
              }
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {dummyBooks?.map((book, i) => (
            <BookCard
              key={book.fileId}
              book={book}
              type="list"
              versionStatus={
                i === 0 ? "consistent" : i === 1 ? "behind" : "colliding"
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
