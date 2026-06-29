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
  const [open, setOpen]     = useState(false);
  const [name, setName]     = useState<string>("devUser");
  const [avatar, setAvatar] = useState<string | null>(null);
  const ref                 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const user = getUser();
    if (user?.name)   setName(user.name);
    else if (user?.email) setName(user.email.split("@")[0]);
    if (user?.avatar) setAvatar(user.avatar);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    await authApi.logout();
    window.location.href = "/login";
  }

  const avatarEl = (
    <div
      className={`rounded-full overflow-hidden shrink-0 transition-all ${
        compact ? "w-[34px] h-[34px]" : "w-[30px] h-[30px]"
      }`}
      style={{ border: "1px solid var(--border-default)" }}
    >
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
        <button onClick={() => setOpen(!open)} className="cursor-pointer hover:opacity-85 transition-opacity" title={name}>
          {avatarEl}
        </button>
      ) : (
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2.5 cursor-pointer pl-3 group"
          style={{ borderLeft: "1px solid var(--border-subtle)" }}
        >
          {avatarEl}
          <span className="text-[13px] font-semibold max-w-[100px] truncate transition-colors"
            style={{ color: "var(--text-secondary)" }}>
            {name}
          </span>
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            style={{ color: "var(--text-muted)" }}
          />
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div
          className={`usermenu-dropdown absolute z-50 mt-2 rounded-xl overflow-hidden ${
            compact ? "right-0 bottom-full mb-2 w-[180px]" : "right-0 w-[200px]"
          }`}
          style={{
            background: "var(--s1)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
            animation: "fadeUp 0.15s cubic-bezier(0.16,1,0.3,1) forwards",
          }}
        >
          {/* User info header */}
          <div className="usermenu-header px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <p className="usermenu-name text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {name}
            </p>
          </div>

          {/* Menu items */}
          <div className="p-1.5">
            <button
              onClick={handleLogout}
              className="usermenu-logout w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
              style={{ color: "var(--error)" }}
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
