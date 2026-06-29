"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="sidebar-nav-btn sidebar-nav-btn--inactive group"
    >
      {isDark
        ? <Sun size={18} strokeWidth={1.8} className="sidebar-nav-icon transition-transform group-hover:rotate-12" />
        : <Moon size={18} strokeWidth={1.8} className="sidebar-nav-icon transition-transform group-hover:-rotate-12" />
      }
    </button>
  );
}
