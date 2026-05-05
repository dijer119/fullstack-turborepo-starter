export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "company-map.theme";

export function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark" || v === "system";
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(v) ? v : "system";
}

/** Resolves to "dark" or "light" given current preference + OS setting. */
export function resolveActiveScheme(theme: Theme): "dark" | "light" {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const useDark = resolveActiveScheme(theme) === "dark";
  document.documentElement.classList.toggle("dark", useDark);
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}
