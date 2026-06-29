"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
interface Ctx { theme: Theme; toggle: () => void; }

const ThemeContext = createContext<Ctx>({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const applied = document.documentElement.getAttribute("data-theme") as Theme | null;
    setTheme(applied === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    setTheme(prev => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("operium-theme", next); } catch {}
      return next;
    });
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
