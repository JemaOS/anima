import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeContext, type ThemeContextValue } from "./context";
import {
  applyResolvedTheme,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  THEME_VALUES,
  type ResolvedTheme,
  type Theme,
} from "./theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredTheme()),
  );

  useEffect(() => {
    const media =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    const apply = () => {
      const resolved = resolveTheme(theme);
      setResolvedTheme(resolved);
      applyResolvedTheme(resolved);
    };

    apply();

    if (theme !== "system" || media === null) {
      return;
    }

    const handleChange = () => apply();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    if (!THEME_VALUES.includes(next)) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable; the in-memory theme still applies.
    }
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
