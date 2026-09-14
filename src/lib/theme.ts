const THEME_KEY = "vault-theme";
const DEFAULT_THEME = "dark";

export type Theme = "light" | "dark" | "system";

export function getTheme(): Theme {
  const stored = typeof window !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
  return (stored as Theme) ?? DEFAULT_THEME;
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme): void {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}