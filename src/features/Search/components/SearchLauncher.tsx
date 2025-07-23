"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, File, Star, ArrowRight } from "lucide-react";
import { useSearchLauncher } from "../provider/SearchLauncherProvider";
import OpenBookLibraryAPI from "@/features/BookSearch/functions";

export function SearchLauncher() {
  const { open: isSearchLauncherOpen, onClose: closeSearchLauncher, onOpen: openSearchLauncher } = useSearchLauncher();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ key: string, link: string, isFavorite?: boolean, author: string }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherOpenRef = useRef<boolean>(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);


  // Keep launcher open reference in sync
  useEffect(() => {
    launcherOpenRef.current = isSearchLauncherOpen;
  }, [isSearchLauncherOpen]);

  // Focus input on open
  useEffect(() => {
    if (isSearchLauncherOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    setQuery("");
    setSelectedIndex(0);
  }, [isSearchLauncherOpen]);

  const searchLauncherKeyboardListener = (e: KeyboardEvent) => {
    if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (launcherOpenRef.current) {
        closeSearchLauncher();
      } else {
        openSearchLauncher();
      }
    }
    if (launcherOpenRef.current) {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeSearchLauncher();
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          if (results.length > 0) {
            e.preventDefault();
            handleSelect(results[selectedIndex]);
          }
          break;
      }
    }
  }



  const handleSelect = (item: { link?: string }) => {
    if (item.link) {
      router.push(item.link);
      closeSearchLauncher();
    }
  };

  // Global keyboard shortcut handler (always active)
  useEffect(() => {
    window.addEventListener("keydown", searchLauncherKeyboardListener);
    return () => window.removeEventListener("keydown", searchLauncherKeyboardListener);
  }, []);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);

    updateOnlineStatus(); // initialize
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (!query.trim() || !isOnline) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      const data = await OpenBookLibraryAPI.search(query);
      setResults(
        data.map((item, index) => ({
          key: item.title,
          link: "#", // Replace with actual link or open viewer
          isFavorite: false,
          author: item.author,
          image: item.image,
          description: item.description,
        }))
      );
    }, 400); // debounce

    return () => clearTimeout(timeout);
  }, [query, isOnline]);

  useEffect(() => {
    if (!query.trim() || !isOnline) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const data = await OpenBookLibraryAPI.search(query);
        setResults(
          data.map((item, index) => ({
            key: item.title,
            link: "#",
            isFavorite: false,
            author: item.author,
            image: item.image,
            description: item.description,
          }))
        );
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    }, 400); // debounce

    return () => clearTimeout(timeout);
  }, [query, isOnline]);


  return (
    <Dialog open={isSearchLauncherOpen} onOpenChange={closeSearchLauncher}>
      <DialogContent
        className="p-0 overflow-hidden border-0 shadow-2xl bg-popover rounded-xl max-w-2xl w-[90vw] max-h-[80vh]"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Search Documents</DialogTitle>

        {/* Header with Search Input */}
        <div className="relative">
          <div className="flex items-center gap-4 px-6 py-5 bg-gradient-to-r from-popover to-popover/95">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                    // setResults(searchItems(e.target.value));
                  }}
                  placeholder="Search your documents..."
                  className="bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base placeholder:text-muted-foreground/70 h-auto py-2 border font-normal w-[90%]"
                />
              </div>
            </div>
          </div>

          {/* Subtle separator */}
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {!isOnline ? (
            // 🔌 Offline state
            <div className="text-center py-12 px-6">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <h3 className="font-medium text-sm mb-1">You are offline</h3>
              <p className="text-xs text-muted-foreground">
                Online search is disabled
              </p>
            </div>
          ) : loading ? (
            // 🔄 Loading state
            <div className="flex flex-col items-center justify-center py-16 px-6 text-muted-foreground animate-pulse">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm mb-1">Searching books...</h3>
              <p className="text-xs">Fetching results from Open Library</p>
            </div>
          ) : results.length > 0 ? (
            // ✅ Results state
            <div>
              <h4 className="text-xs text-muted-foreground font-medium px-6 pt-4 pb-1">
                Open Library Results – Online
              </h4>
              <ul className="pb-2">
                {results.map((item, index) => (
                  <li key={item.key + index}>
                    <button
                      className={cn(
                        "w-full text-left px-6 py-3 flex items-center gap-4 transition-all duration-150 group relative",
                        selectedIndex === index
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50 hover:text-accent-foreground"
                      )}
                      onClick={() => handleSelect({ link: item.link })}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-md flex items-center justify-center transition-colors",
                          selectedIndex === index
                            ? "bg-accent-foreground/10"
                            : "bg-muted/50 group-hover:bg-accent-foreground/10"
                        )}
                      >
                        <File className="w-4 h-4" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {item.key}
                          </span>
                          {item.isFavorite && (
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-current flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {item.author}
                        </p>
                      </div>

                      <ArrowRight
                        className={cn(
                          "w-4 h-4 transition-all duration-150",
                          selectedIndex === index
                            ? "opacity-100 translate-x-0"
                            : "opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0"
                        )}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : query ? (
            // ❌ No results
            <div className="text-center py-12 px-6">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <h3 className="font-medium text-sm mb-1">No books found</h3>
              <p className="text-xs text-muted-foreground">
                Try adjusting your search terms
              </p>
            </div>
          ) : (
            // 💡 Empty input
            <div className="text-center py-12 px-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-primary/70" />
              </div>
              <h3 className="font-medium text-sm mb-1">Search your vault</h3>
              <p className="text-xs text-muted-foreground">
                Type to find documents, notes, and more
              </p>
            </div>
          )}
        </div>



        {/* Footer with navigation hints */}
        {results.length > 0 && (
          <>
            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            <div className="px-6 py-3 bg-muted/30">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-background/50 rounded text-[10px] font-mono">↑↓</kbd>
                    <span>Navigate</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-background/50 rounded text-[10px] font-mono">↵</kbd>
                    <span>Open</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-background/50 rounded text-[10px] font-mono">Esc</kbd>
                  <span>Close</span>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}