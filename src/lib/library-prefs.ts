/**
 * Per-device library view preferences.
 *
 * Mirrors the `theme` precedent: UI preferences live in localStorage rather
 * than the synced user DB, so they are not pushed to the cloud and do not
 * create conflict surface.
 */

const PREFS_KEY = "vault-library-prefs";

export type LibrarySort = "added" | "title" | "author";
export type LibraryViewMode = "grid" | "list";

export interface LibraryPrefs {
  sort: LibrarySort;
  filterTags: string[];
  onlyFavourites: boolean;
  viewMode: LibraryViewMode;
}

export const DEFAULT_LIBRARY_PREFS: LibraryPrefs = {
  sort: "added",
  filterTags: [],
  onlyFavourites: false,
  viewMode: "grid",
};

const SORT_VALUES: LibrarySort[] = ["added", "title", "author"];
const VIEW_VALUES: LibraryViewMode[] = ["grid", "list"];

function sanitize(value: unknown): LibraryPrefs {
  if (!value || typeof value !== "object") return { ...DEFAULT_LIBRARY_PREFS };

  const raw = value as Partial<LibraryPrefs>;

  return {
    sort: SORT_VALUES.includes(raw.sort as LibrarySort)
      ? (raw.sort as LibrarySort)
      : DEFAULT_LIBRARY_PREFS.sort,
    filterTags: Array.isArray(raw.filterTags)
      ? raw.filterTags.filter((tag): tag is string => typeof tag === "string")
      : [],
    onlyFavourites: raw.onlyFavourites === true,
    viewMode: VIEW_VALUES.includes(raw.viewMode as LibraryViewMode)
      ? (raw.viewMode as LibraryViewMode)
      : DEFAULT_LIBRARY_PREFS.viewMode,
  };
}

export function getLibraryPrefs(): LibraryPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_LIBRARY_PREFS };

  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (!stored) return { ...DEFAULT_LIBRARY_PREFS };
    return sanitize(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_LIBRARY_PREFS };
  }
}

export function setLibraryPrefs(prefs: LibraryPrefs): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Quota or privacy mode — preferences are best-effort.
  }
}
