"use client";

import { Book, BookCard } from "@/features/Books/_components/BookCard";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LayoutGrid, List } from "lucide-react";

export default function Page() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const dummyBooks: Book[] = [
    {
      title: "The Art of Computer Programming",
      author: "Donald E. Knuth",
      tags: ["Algorithms", "Classic"],
      fileId: "file_1",
      fileUrl: "/dummy.pdf",
      version: "1721382800000",
      isFavourite: true,
      note: "Revisit Chapter 3",
      image: "https://static.posters.cz/image/1300/214933.jpg",
    },
    {
      title: "You Don’t Know JS",
      author: "Kyle Simpson",
      tags: ["JavaScript", "Advanced"],
      fileId: "file_2",
      fileUrl: "/dummy2.pdf",
      version: "1721382800001",
      isFavourite: false,
      note: "",
      image: "https://res.cloudinary.com/bloomsbury-atlas/image/upload/w_360,c_scale,dpr_1.5/jackets/9781408855652.jpg",
    },
    {
      title: "Clean Code",
      author: "Robert C. Martin",
      tags: ["Clean", "Code", "Best Practices"],
      fileId: "file_3",
      fileUrl: "/dummy3.pdf",
      version: "1721382800002",
      isFavourite: true,
      note: "Focus on function naming",
      image: "https://m.media-amazon.com/images/I/81DI+BAN2SL._UF1000,1000_QL80_.jpg",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Your Library</h2>

        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => {
            if (value) setViewMode(value as "grid" | "list");
          }}
          className="gap-1"
        >
          <ToggleGroupItem value="grid" aria-label="Grid View" className="!rounded-sm cursor-pointer">
            <LayoutGrid className="w-5 h-5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List View" className="!rounded-sm cursor-pointer">
            <List className="w-5 h-5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {dummyBooks.map((book, i) => (
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
          {dummyBooks.map((book, i) => (
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
