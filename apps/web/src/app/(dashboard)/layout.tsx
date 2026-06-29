"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, History, FolderGit2, GitBranch, Terminal, FileText, Bell, Settings, Bot, CheckSquare
} from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { href: "/",            icon: LayoutGrid,  label: "Dashboard" },
    { href: "/history",     icon: History,     label: "History" },
    { href: "/cowork",      icon: Bot,         label: "Cowork" },
    { href: "/tasks",       icon: CheckSquare, label: "Tasks" },
    { href: "/spaces",      icon: FileText,    label: "Spaces" },
    { href: "/projects",    icon: FolderGit2,  label: "Projects" },
    { href: "/git",         icon: GitBranch,   label: "Git" },
    { href: "/notification",icon: Bell,        label: "Notifications" },
  ];

  return (
    <div className="flex h-screen w-screen font-sans overflow-hidden" style={{ background: "var(--s0)", color: "var(--text-primary)" }}>

      {/* ── SIDEBAR ── */}
      <aside
        className="w-[80px] flex flex-col items-center py-6 justify-between z-30 relative shrink-0"
        style={{
          background: "var(--s0)",
          borderRight: "1px solid var(--border-subtle)",
          transition: "background 300ms ease, border-color 300ms ease",
        }}
      >
        {/* Subtle gradient line on right edge */}
        <div className="absolute inset-y-0 right-0 w-[1px] pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, var(--border-default), transparent)", opacity: 0.5 }} />

        {/* Logo */}
        <Link href="/" className="relative group cursor-pointer">
          <div className="absolute inset-0 bg-[#8b5cf6] rounded-full blur-md opacity-35 group-hover:opacity-60 transition-opacity duration-500" />
          <div className="w-[46px] h-[46px] rounded-full bg-gradient-to-tr from-[#7c3aed] via-[#8b5cf6] to-[#ec4899] border border-white/15 shadow-[0_4px_20px_rgba(139,92,246,0.45),inset_0_1px_1px_rgba(255,255,255,0.25)] flex items-center justify-center relative z-10">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
              <path d="M12 2C12 2 17 8.5 17 12.5C17 15.26 14.76 17.5 12 17.5C9.24 17.5 7 15.26 7 12.5C7 8.5 12 2 12 2Z" />
            </svg>
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex flex-col gap-5 items-center flex-1 w-full mt-10">
          {navItems.map((item) => {
            const Icon  = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`sidebar-nav-btn ${isActive ? "sidebar-nav-btn--active" : "sidebar-nav-btn--inactive"} group`}
              >
                <Icon size={20} strokeWidth={isActive ? 2 : 1.8} className="sidebar-nav-icon" />
                {item.href === "/notification" && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full animate-pulse"
                    style={{ border: "1.5px solid var(--s0)" }} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: theme toggle + settings + avatar */}
        <div className="flex flex-col gap-3 items-center">
          <ThemeToggle />
          <Link
            href="/settings"
            title="Settings"
            className={`sidebar-nav-btn ${pathname === "/settings" ? "sidebar-nav-btn--active" : "sidebar-nav-btn--inactive"} group`}
          >
            <Settings size={20} strokeWidth={1.8} className="sidebar-nav-icon" />
          </Link>
          <div className="mb-2">
            <UserMenu compact />
          </div>
        </div>
      </aside>

      {/* ── MAIN CANVAS ── */}
      <main className="flex-1 flex flex-col relative overflow-hidden" style={{ background: "var(--s0)" }}>
        {children}
      </main>
    </div>
  );
}
