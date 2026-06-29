"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, History, FolderGit2, GitBranch, Terminal, FileText, Bell, Settings, Bot, CheckSquare
} from "lucide-react";
import { UserMenu } from "@/components/UserMenu";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { href: "/", icon: LayoutGrid, label: "Dashboard" },
    { href: "/history", icon: History, label: "History" },
    { href: "/cowork", icon: Bot, label: "Cowork" },
    { href: "/tasks", icon: CheckSquare, label: "Tasks" },
    { href: "/spaces", icon: FileText, label: "Spaces" },
    { href: "/projects", icon: FolderGit2, label: "Projects" },
    { href: "/git", icon: GitBranch, label: "Git" },
    { href: "/notification", icon: Bell, label: "Notifications" },
  ];

  return (
    <div className="flex h-screen w-screen bg-[#050505] text-[#fafafa] font-sans overflow-hidden selection:bg-[#8b5cf6]/30">

      {/* ── SIDEBAR ── */}
      <aside className="w-[80px] border-r border-[#1a1a22] bg-[#050505] flex flex-col items-center py-6 justify-between z-30 relative shrink-0">
        <div className="absolute inset-y-0 right-0 w-[1px] bg-gradient-to-b from-transparent via-[#2a2a35]/30 to-transparent opacity-50" />

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
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-all group ${
                  isActive
                    ? "text-[#fafafa] bg-[#120e20]/65 border border-[#8b5cf6]/50 shadow-[0_4px_16px_rgba(139,92,246,0.25)]"
                    : "text-[#63637a] hover:text-[#fafafa] hover:bg-[#141418]/60 border border-transparent"
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2 : 1.8} className={isActive ? "text-[#8b5cf6]" : "group-hover:scale-105 transition-transform"} />
                {item.href === "/notification" && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full border-[1.5px] border-[#050505] animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="flex flex-col gap-4 items-center">
          <Link href="/settings" title="Settings"
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all group ${
              pathname === "/settings"
                ? "text-[#fafafa] bg-[#120e20]/65 border border-[#8b5cf6]/50 shadow-[0_4px_16px_rgba(139,92,246,0.25)]"
                : "text-[#63637a] hover:text-[#fafafa] hover:bg-[#141418]/60 border border-transparent"
            }`}
          >
            <Settings size={20} strokeWidth={1.8} className={pathname === "/settings" ? "text-[#8b5cf6]" : "group-hover:scale-105 transition-transform"} />
          </Link>
          <div className="mb-2">
            <UserMenu compact />
          </div>
        </div>
      </aside>

      {/* ── MAIN CANVAS ── */}
      <main className="flex-1 flex flex-col relative bg-[#050505] overflow-hidden">
        {children}
      </main>
    </div>
  );
}
