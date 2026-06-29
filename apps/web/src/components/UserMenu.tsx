"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, User } from "lucide-react";
import { getUser } from "@/lib/auth";
import { authApi } from "@/api/auth.api";

interface Props {
  /** compact = sidebar avatar only (no name/chevron) */
  compact?: boolean;
}

export function UserMenu({ compact = false }: Props) {
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState<string>("devUser");
  const [avatar, setAvatar]   = useState<string | null>(null);
  const ref                   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const user = getUser();
    if (user?.name)   setName(user.name);
    else if (user?.email) setName(user.email.split("@")[0]);
    if (user?.avatar) setAvatar(user.avatar);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    await authApi.logout();
    window.location.href = "/login";
  }

  const avatarEl = (
    <div className={`rounded-full border overflow-hidden shrink-0 transition-colors ${
      compact
        ? "w-[34px] h-[34px] border-[#2a2a35] hover:border-[#8b5cf6]"
        : "w-[30px] h-[30px] border-[#2a2a35] group-hover:border-[#8b5cf6]"
    }`}>
      {avatar
        ? <img src={avatar} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        : <div className="w-full h-full bg-gradient-to-br from-[#7c3aed] to-[#6366f1] flex items-center justify-center">
            <User size={compact ? 16 : 14} className="text-white" />
          </div>
      }
    </div>
  );

  return (
    <div ref={ref} className="relative">
      {compact ? (
        <button
          onClick={() => setOpen(!open)}
          className="cursor-pointer"
          title={name}
        >
          {avatarEl}
        </button>
      ) : (
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2.5 cursor-pointer pl-3 border-l border-[#1a1a22] group"
        >
          {avatarEl}
          <span className="text-[13px] font-semibold text-[#a1a1aa] group-hover:text-[#fafafa] transition-colors max-w-[100px] truncate">
            {name}
          </span>
          <ChevronDown
            size={14}
            className={`text-[#63637a] group-hover:text-[#fafafa] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className={`absolute z-50 mt-2 bg-[#0c0c0f] border border-[#2a2a35] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden animate-[fadeIn_0.15s_ease-out] ${
          compact ? "right-0 bottom-full mb-2 w-[180px]" : "right-0 w-[200px]"
        }`}>
          {/* User info header */}
          <div className="px-4 py-3 border-b border-[#1a1a22]">
            <p className="text-[13px] font-semibold text-[#fafafa] truncate">{name}</p>
          </div>

          {/* Menu items */}
          <div className="p-1.5">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium text-[#ef4444] hover:bg-[#1f1010]/60 hover:text-[#f87171] transition-colors"
            >
              <LogOut size={14} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
