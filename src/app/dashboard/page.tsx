"use client";

import { Book, BookCard } from "@/features/Books/_components/BookCard";

export default function Page() {
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
      image: "https://placehold.co/200x300?text=TAOCP",
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
      image: "https://placehold.co/200x300?text=YDKJS",
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
      image: "https://placehold.co/200x300?text=Clean+Code",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-12">
      <div>
        <h2 className="text-xl font-semibold mb-4">Grid View</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {dummyBooks.map((book, i) => (
            <BookCard
              key={book.fileId}
              book={book}
              type="grid"
              versionStatus={i === 0 ? "consistent" : i === 1 ? "behind" : "colliding"}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">List View</h2>
        <div className="space-y-4">
          {dummyBooks.map((book, i) => (
            <BookCard
              key={book.fileId}
              book={book}
              type="list"
              versionStatus={i === 0 ? "consistent" : i === 1 ? "behind" : "colliding"}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
