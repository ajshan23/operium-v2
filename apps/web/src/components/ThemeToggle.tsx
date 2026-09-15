"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { resolvedTheme, toggle } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="sidebar-nav-btn sidebar-nav-btn--inactive group"
    >
      {isDark
        ? <Sun size={18} strokeWidth={1.8} className="sidebar-nav-icon motion-safe:transition-transform group-hover:rotate-12" />
        : <Moon size={18} strokeWidth={1.8} className="sidebar-nav-icon motion-safe:transition-transform group-hover:-rotate-12" />
      }
    </button>
  );
}
