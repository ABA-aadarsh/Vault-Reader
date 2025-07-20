"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, File, Star, ArrowRight } from "lucide-react";
import { useSearchLauncher } from "../provider/SearchLauncherProvider";
import { DialogTitle } from "@radix-ui/react-dialog";

export function SearchLauncher() {
  const { open: isSearchLauncherOpen, onClose: closeSearchLauncher, onOpen: openSearchLauncher } = useSearchLauncher();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{key: string, link: string, isFavorite?: boolean}[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherOpenRef = useRef<boolean>(false);

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
    if(e.key === "k" && (e.metaKey || e.ctrlKey)){
      e.preventDefault();
      if(launcherOpenRef.current){
        closeSearchLauncher();
      }else{
        openSearchLauncher();
      }
    }
    if(launcherOpenRef.current){
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
          {results.length > 0 ? (
            <ul className="py-2">
              {results.map((item, index) => (
                <li key={item.key}>
                  <button
                    className={cn(
                      "w-full text-left px-6 py-3 flex items-center gap-4 transition-all duration-150 group relative",
                      selectedIndex === index 
                        ? "bg-accent text-accent-foreground" 
                        : "hover:bg-accent/50 hover:text-accent-foreground"
                    )}
                    onClick={() => handleSelect({link: item.link})}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    {/* File icon */}
                    <div className={cn(
                      "w-8 h-8 rounded-md flex items-center justify-center transition-colors",
                      selectedIndex === index 
                        ? "bg-accent-foreground/10" 
                        : "bg-muted/50 group-hover:bg-accent-foreground/10"
                    )}>
                      <File className="w-4 h-4" />
                    </div>
                    
                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {item.key}
                        </span>
                        {item.isFavorite && (
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-current flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        PDF Document
                      </p>
                    </div>
                    
                    {/* Arrow indicator */}
                    <ArrowRight className={cn(
                      "w-4 h-4 transition-all duration-150",
                      selectedIndex === index 
                        ? "opacity-100 translate-x-0" 
                        : "opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0"
                    )} />
                  </button>
                </li>
              ))}
            </ul>
          ) : query ? (
            /* No results state */
            <div className="text-center py-12 px-6">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <h3 className="font-medium text-sm mb-1">No documents found</h3>
              <p className="text-xs text-muted-foreground">
                Try adjusting your search terms
              </p>
            </div>
          ) : (
            /* Empty state */
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