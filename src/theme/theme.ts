export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "anima-theme";

export const THEME_VALUES: readonly Theme[] = ["system", "light", "dark"];

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Storage may be unavailable (private mode, blocked cookies).
  }
  return "system";
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return systemPrefersDark() ? "dark" : "light";
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}
