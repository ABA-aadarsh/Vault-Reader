"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Search, File, ArrowRight, StickyNote, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSearchLauncher } from "../provider/SearchLauncherProvider";
import { OpenBookLibraryAPI } from "../data/openLibrary";
import { searchLocal, type LocalSearchHit } from "../data/localSearch";
import { useDb } from "@/data/dexie";

const LOCAL_DEBOUNCE_MS = 120;
const REMOTE_DEBOUNCE_MS = 400;
const REMOTE_MIN_QUERY = 3;

type SearchItem =
  | {
      section: "local";
      key: string;
      kind: "book" | "note";
      fileId: string;
      title: string;
      subtitle: string;
    }
  | {
      section: "remote";
      key: string;
      title: string;
      subtitle: string;
      link: string;
      image?: string;
    };

export function SearchLauncher() {
  const { open: isSearchLauncherOpen, onClose: closeSearchLauncher, onOpen: openSearchLauncher } = useSearchLauncher();
  const [query, setQuery] = useState("");
  const [localHits, setLocalHits] = useState<LocalSearchHit[]>([]);
  const [remoteHits, setRemoteHits] = useState<{ title: string; link: string; author: string; image?: string }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherOpenRef = useRef<boolean>(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const db = useDb();
  const router = useRouter();

  const items = useMemo<SearchItem[]>(() => {
    const local: SearchItem[] = localHits.map((hit) => ({
      section: "local",
      key: `local-${hit.kind}-${hit.bookId}`,
      kind: hit.kind,
      fileId: hit.fileId,
      title: hit.title,
      subtitle:
        hit.kind === "note"
          ? hit.snippet || hit.author
          : hit.author || "No author",
    }));

    const remote: SearchItem[] = remoteHits.map((hit, index) => ({
      section: "remote",
      key: `remote-${hit.link}-${index}`,
      title: hit.title,
      subtitle: hit.author,
      link: hit.link,
      image: hit.image,
    }));

    return [...local, ...remote];
  }, [localHits, remoteHits]);

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
    setLocalHits([]);
    setRemoteHits([]);
    setSelectedIndex(0);
  }, [isSearchLauncherOpen]);

  const handleSelect = useCallback((item: SearchItem | undefined) => {
    if (!item) return;

    if (item.section === "local") {
      router.push(`/library/book/${item.fileId}`);
      closeSearchLauncher();
      return;
    }

    window.open(item.link, "_blank", "noopener,noreferrer");
    closeSearchLauncher();
  }, [closeSearchLauncher, router]);

  const searchLauncherKeyboardListener = useCallback((e: KeyboardEvent) => {
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
          setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          if (items.length > 0) {
            e.preventDefault();
            handleSelect(items[selectedIndex]);
          }
          break;
      }
    }
  }, [items, selectedIndex, closeSearchLauncher, openSearchLauncher, handleSelect]);

  // Global keyboard shortcut handler (always active)
  useEffect(() => {
    window.addEventListener("keydown", searchLauncherKeyboardListener);
    return () => window.removeEventListener("keydown", searchLauncherKeyboardListener);
  }, [searchLauncherKeyboardListener]);

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

  // Local library search — always available, online or not.
  useEffect(() => {
    if (!query.trim()) {
      setLocalHits([]);
      setLoadingLocal(false);
      return;
    }

    setLoadingLocal(true);
    const timeout = setTimeout(async () => {
      try {
        setLocalHits(await searchLocal(db, query));
      } catch (err) {
        console.error("Local search error:", err);
        setLocalHits([]);
      } finally {
        setLoadingLocal(false);
      }
    }, LOCAL_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query, db]);

  // Open Library search — online only.
  useEffect(() => {
    if (!query.trim() || query.trim().length < REMOTE_MIN_QUERY || !isOnline) {
      setRemoteHits([]);
      setLoadingRemote(false);
      return;
    }

    setLoadingRemote(true);
    const timeout = setTimeout(async () => {
      try {
        const data = await OpenBookLibraryAPI.search(query);
        setRemoteHits(
          data.map((item) => ({
            title: item.title,
            link: `https://openlibrary.org${item.key}`,
            author: item.author,
            image: item.image,
          }))
        );
      } catch (err) {
        console.error("Search error:", err);
        setRemoteHits([]);
      } finally {
        setLoadingRemote(false);
      }
    }, REMOTE_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query, isOnline]);

  // Keep the highlight in range as result sections change.
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

  const busy = loadingLocal || loadingRemote;
  let lastSection: SearchItem["section"] | null = null;

  return (
    <Dialog open={isSearchLauncherOpen} onOpenChange={closeSearchLauncher}>
      <DialogContent
        className="p-0 overflow-hidden border-0 shadow-2xl bg-popover rounded-xl max-w-2xl w-[90vw] max-h-[80vh]"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Search library</DialogTitle>

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
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your library…"
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
          {!query.trim() && !busy ? (
            // 💡 Empty input
            <div className="text-center py-12 px-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-primary/70" />
              </div>
              <h3 className="font-medium text-sm mb-1">Search your vault</h3>
              <p className="text-xs text-muted-foreground">
                Find books and notes in your library
              </p>
            </div>
          ) : items.length > 0 ? (
            // ✅ Results (library + Open Library)
            <ul className="py-2">
              {items.map((item, index) => {
                const showHeader = item.section !== lastSection;
                lastSection = item.section;

                return (
                  <li key={item.key}>
                    {showHeader && (
                      <h4 className="text-xs text-muted-foreground font-medium px-6 pt-3 pb-1">
                        {item.section === "local"
                          ? "In your library"
                          : "Open Library — online"}
                      </h4>
                    )}
                    <button
                      className={cn(
                        "w-full text-left px-6 py-3 flex items-center gap-4 transition-all duration-150 group relative",
                        selectedIndex === index
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50 hover:text-accent-foreground"
                      )}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div
                        className={cn(
                          "w-9 h-12 rounded-sm overflow-hidden flex-shrink-0 flex items-center justify-center transition-colors",
                          selectedIndex === index
                            ? "bg-accent-foreground/10"
                            : "bg-muted/50 group-hover:bg-accent-foreground/10"
                        )}
                      >
                        {item.section === "remote" && item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : item.section === "local" && item.kind === "note" ? (
                          <StickyNote className="w-4 h-4" />
                        ) : (
                          <File className="w-4 h-4" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm truncate block">
                          {item.title}
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {item.subtitle}
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
                );
              })}
            </ul>
          ) : busy ? (
            // 🔄 Loading state
            <div className="flex flex-col items-center justify-center py-16 px-6 text-muted-foreground animate-pulse">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm mb-1">Searching…</h3>
              <p className="text-xs">
                {isOnline ? "Library and Open Library" : "Your offline library"}
              </p>
            </div>
          ) : (
            // ❌ No results
            <div className="text-center py-12 px-6">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                {isOnline ? (
                  <Search className="w-6 h-6 text-muted-foreground/50" />
                ) : (
                  <WifiOff className="w-6 h-6 text-muted-foreground/50" />
                )}
              </div>
              <h3 className="font-medium text-sm mb-1">No matches</h3>
              <p className="text-xs text-muted-foreground">
                {isOnline
                  ? "Nothing found in your library or on Open Library"
                  : "Nothing in your library. Online search needs a connection."}
              </p>
            </div>
          )}
        </div>

        {/* Footer with navigation hints */}
        {items.length > 0 && (
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
