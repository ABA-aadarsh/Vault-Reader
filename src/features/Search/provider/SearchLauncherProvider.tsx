"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";

interface SearchContextType {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  toggle: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function SearchLauncherProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const onOpen = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  return (
    <SearchContext.Provider value={{ open, onOpen, onClose, toggle }}>
      {children}
    </SearchContext.Provider>
  );
}

export const useSearchLauncher = (): SearchContextType => {
  const context = useContext(SearchContext);
  if (!context) throw new Error("useSearch must be used within a SearchProvider");
  return context;
};
