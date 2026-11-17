"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Button, buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Image from "next/image";
import { Search, Settings, Star, Trash2 } from "lucide-react";
import { useSearchLauncher } from "@/features/Search";
import { useRouter } from "next/navigation";
import { SyncStatusChip, SyncNowButton } from "@/features/Sync";
import { useBooks } from "@/features/Books";
import { useAuth } from "@/features/Auth";
import type { Book } from "@/data/domain";

function SidebarBookList({ books, label }: { books: Book[]; label: string }) {
  const router = useRouter();
  return (
    <SidebarGroup>
      <h3 className="text-sm font-medium text-muted-foreground mb-2">{label}</h3>
      {books.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground/70">Nothing here yet</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {books.map((book) => (
            <li
              key={book.id}
              className="hover:bg-muted px-2 py-1 rounded flex justify-between items-center cursor-pointer"
              onClick={() => router.push(`/library/book/${book.fileId}`)}
            >
              <span className="truncate">{book.title}</span>
              {book.isFavourite && <Star size={14} className="text-yellow-400 flex-shrink-0" />}
            </li>
          ))}
        </ul>
      )}
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { onOpen: onSearchLauncherOpen } = useSearchLauncher();
  const router = useRouter();
  const { user } = useAuth();
  const { data: books } = useBooks();

  const allBooks = books ?? [];
  const recentBooks = [...allBooks]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3);
  const favouriteBooks = allBooks
    .filter((book) => book.isFavourite)
    .sort((a, b) => a.title.localeCompare(b.title));

  const displayName =
    typeof user?.user_metadata?.name === "string" && user.user_metadata.name.trim()
      ? user.user_metadata.name
      : user?.email ?? "";
  const username = displayName.split(/\s+/)[0] || "User";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("") || "U";

  return (
    <Sidebar className="bg-card text-foreground border-r-muted" variant="sidebar">
      <SidebarHeader className="flex items-center flex-row px-4 py-3 border-b border-border ">
        <div className="flex items-center gap-2 cursor-pointer"
          onClick={() => router.push("/library")}
        >
          <div className="w-8 h-8 bg-secondary rounded overflow-hidden relative">
            <Image
              src="/logo.png"
              alt="V"
              className="object-cover"
              fill
            />
          </div>
          <span className="font-semibold text-lg">Vault Reader</span>
        </div>
      </SidebarHeader>

      {/* Content */}
      <SidebarContent className="flex-1 p-4">
        {/* Search */}
        <div className="mb-4">
          <Button onClick={onSearchLauncherOpen} asChild>
            <div className={buttonVariants({
              variant: "secondary",
              size: "lg",
              className: "w-full !justify-between !px-2"
            })}>
              <div className="flex items-center gap-2">
                <Search />
                <span>Search</span>
              </div>
              <div className="hidden sm:flex items-center justify-end gap-1 text-xs text-muted-foreground">
                <kbd className="px-2 py-1 bg-muted/50 rounded text-[10px] font-mono">
                  Ctrl
                </kbd>
                <kbd className="px-2 py-1 bg-muted/50 rounded text-[10px] font-mono">K</kbd>
              </div>
            </div>
          </Button>
        </div>

        <ScrollArea className="space-y-6">
          {allBooks.length > 0 && (
            <SidebarBookList books={recentBooks} label="Recent" />
          )}

          <SidebarBookList books={favouriteBooks} label="Favourites" />

          {/* Manage Group */}
          <SidebarGroup>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Manage</h3>
            <Button
              variant="ghost"
              className="w-full justify-start px-2 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => window.dispatchEvent(new CustomEvent("open-recently-deleted"))}
            >
              <Trash2 className="mr-2 w-4 h-4" />
              Recently deleted
            </Button>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>

      {/* Footer Avatar */}
      <SidebarFooter className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <SyncStatusChip />
          <SyncNowButton />
        </div>
        <div className="flex items-center gap-3">
          <Avatar className="w-9 h-9">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate text-sm font-medium">{username}</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Settings"
            title="Settings"
            className="text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => router.push("/library/settings")}
          >
            <Settings size={18} />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

