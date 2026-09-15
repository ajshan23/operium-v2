"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
} from "@/lib/theme.mjs";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (value: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  resolvedTheme: "dark",
  setPreference: () => {},
  toggle: () => {},
});

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference, systemPrefersDark()) as ResolvedTheme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch {}
    const initialPreference: ThemePreference = isThemePreference(stored)
      ? stored as ThemePreference
      : "system";
    setPreferenceState(initialPreference);
    setResolvedTheme(applyTheme(initialPreference));
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setResolvedTheme(applyTheme("system"));
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [preference]);

  const setPreference = useCallback((value: ThemePreference) => {
    try { localStorage.setItem(THEME_STORAGE_KEY, value); } catch {}
    setPreferenceState(value);
    setResolvedTheme(applyTheme(value));
  }, []);

  const toggle = useCallback(() => {
    setPreference(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setPreference]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    resolvedTheme,
    setPreference,
    toggle,
  }), [preference, resolvedTheme, setPreference, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
