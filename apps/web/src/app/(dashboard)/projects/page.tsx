"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Folder, Plus, Search, Bell, ChevronDown,
  Loader2, BookOpen, Bot, Activity, CheckSquare,
  ArrowRight, FileText, Tag, Star, X, AlertTriangle,
} from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { spacesApi, notesApi } from "@/api/notes.api";
import { coworkApi } from "@/api/cowork.api";
import { historyApi } from "@/api/history.api";

interface Space { _id: string; name: string; icon: string; noteCount?: number }
interface Note  { _id: string; title: string; updatedAt: string; tags: string[]; isStarred?: boolean }
interface CoworkSession { _id: string; id: string; title: string; source: string; createdAt: string; tags: string[] }
interface HistoryEntry  { _id: string; title: string; category: string; createdAt: string; source?: string }

export default function ProjectsPage() {
  const [spaces,         setSpaces]         = useState<Space[]>([]);
  const [activeSpaceId,  setActiveSpaceId]  = useState<string | null>(null);
  const [notes,          setNotes]          = useState<Note[]>([]);
  const [sessions,       setSessions]       = useState<CoworkSession[]>([]);
  const [history,        setHistory]        = useState<HistoryEntry[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [activeTab,      setActiveTab]      = useState<"notes" | "cowork" | "history">("cowork");

  // Load spaces
  useEffect(() => {
    spacesApi.list()
      .then(r => {
        const list = ((r as any).data ?? []) as Space[];
        setSpaces(list);
        if (list.length > 0 && list[0]) setActiveSpaceId(list[0]._id);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Load notes when space changes
  useEffect(() => {
    if (!activeSpaceId) return;
    notesApi.list(activeSpaceId)
      .then(r => setNotes(((r as any).data ?? []) as Note[]))
      .catch(() => {});
  }, [activeSpaceId]);

  // Load cowork + history once
  useEffect(() => {
    coworkApi.list({ limit: 20 })
      .then(r => setSessions(((r as any).data?.sessions ?? []) as CoworkSession[]))
      .catch(() => {});

    historyApi.getHistory({ limit: 20 } as any)
      .then(r => setHistory(((r as any).data?.items ?? []) as HistoryEntry[]))
      .catch(() => {});
  }, []);

  const filteredNotes = notes.filter(n =>
    !searchQuery || n.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredSessions = sessions.filter(s =>
    !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredHistory = history.filter(h =>
    !searchQuery || h.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return days < 7 ? `${days}d ago` : new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="flex h-full w-full overflow-hidden relative">

      {/* ── COLUMN 1: SPACES SIDEBAR ── */}
      <div className="w-[240px] border-r border-[#1a1a22] bg-[#070709] flex flex-col shrink-0 overflow-y-auto select-none">

        <div className="p-4 border-b border-[#1a1a22]">
          <Link
            href="/spaces"
            className="w-full h-[40px] px-4 rounded-xl border border-[#2a2a35] hover:border-[#8b5cf6]/50 bg-[#120e20]/20 hover:bg-[#120e20]/40 text-[13px] font-semibold text-[#fafafa] flex items-center justify-between transition-all duration-300 group"
          >
            <span>Open Notebook</span>
            <ArrowRight size={14} className="text-[#8b5cf6] group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] font-bold text-[#63637a] tracking-wider uppercase">Spaces</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-[#55556a]">
              <Loader2 size={14} className="animate-spin" />
            </div>
          ) : spaces.length === 0 ? (
            <div className="px-2 py-4 text-center">
              <p className="text-[11px] text-[#55556a]">No spaces yet.</p>
              <Link href="/spaces" className="text-[11px] text-[#8b5cf6] hover:underline mt-1 block">Create one →</Link>
            </div>
          ) : (
            spaces.map(space => (
              <button
                key={space._id}
                onClick={() => setActiveSpaceId(space._id)}
                className={`w-full h-[36px] px-3 rounded-xl border text-[13px] font-medium flex items-center gap-2.5 transition-all text-left ${
                  activeSpaceId === space._id
                    ? "bg-[#120e20]/60 border-[#8b5cf6]/45 text-[#fafafa] shadow-[0_2px_12px_rgba(139,92,246,0.12)]"
                    : "border-transparent hover:border-[#1e1e24] hover:bg-[#141418]/40 text-[#63637a] hover:text-[#fafafa]"
                }`}
              >
                <span>{space.icon || "📁"}</span>
                <span className="truncate">{space.name}</span>
              </button>
            ))
          )}
        </div>

        {/* Quick links */}
        <div className="mt-auto p-4 border-t border-[#1a1a22]/60 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-[#63637a] tracking-wider uppercase px-2 mb-1">Navigate</span>
          {[
            { label: "AI Cowork", href: "/cowork", icon: Bot },
            { label: "Tasks", href: "/tasks", icon: CheckSquare },
            { label: "History", href: "/history", icon: Activity },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="w-full h-[34px] px-3 rounded-xl border border-transparent hover:border-[#1e1e24] hover:bg-[#141418]/30 flex items-center gap-2.5 text-[12px] text-[#63637a] hover:text-[#fafafa] transition-all"
            >
              <item.icon size={13} className="text-[#8b5cf6]" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="h-[76px] border-b border-[#1a1a22] flex items-center justify-between px-8 bg-[#050505] shrink-0 z-20">
          <div className="flex-1 max-w-[420px]">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#55556a] group-focus-within:text-[#8b5cf6] transition-colors" size={15} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search notes, sessions, history..."
                className="w-full h-[38px] bg-[#0c0c0f]/80 border border-[#23232c] focus:border-[#8b5cf6]/50 rounded-xl pl-10 pr-10 text-[13px] text-[#fafafa] placeholder:text-[#55556a] focus:outline-none transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55556a] hover:text-[#fafafa]">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/notification" className="text-[#63637a] hover:text-[#fafafa] relative p-1.5 rounded-lg hover:bg-[#141418] transition-colors">
              <Bell size={18} />
            </Link>
            <UserMenu />
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8 relative bg-[#050505]">
          <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(139,92,246,0.04),transparent_60%)] rounded-full pointer-events-none blur-3xl" />

          <div className="flex items-center justify-between mb-6 relative z-10">
            <div>
              <h2 className="text-[20px] font-extrabold text-[#fafafa] tracking-tight">Memory Browser</h2>
              <p className="text-[12px] text-[#63637a] mt-0.5">All your notes, AI sessions and work history in one place.</p>
            </div>

            {/* Tab switcher */}
            <div className="flex bg-[#0c0c0f] border border-[#1e1e24] rounded-xl p-0.5 select-none shrink-0">
              {([
                { id: "cowork", label: "Cowork", icon: Bot },
                { id: "notes",  label: "Notes",  icon: FileText },
                { id: "history",label: "History", icon: Activity },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    activeTab === tab.id
                      ? "bg-[#120e20] border border-[#8b5cf6]/35 text-[#fafafa]"
                      : "text-[#63637a] hover:text-[#fafafa]"
                  }`}
                >
                  <tab.icon size={12} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-center gap-2 text-red-400 text-[12px] bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-2.5">
              <AlertTriangle size={13} />
              <span>{error}</span>
            </div>
          )}

          {/* ── COWORK TAB ── */}
          {activeTab === "cowork" && (
            <div className="flex flex-col gap-3 relative z-10">
              {filteredSessions.length === 0 ? (
                <EmptyState
                  icon={<Bot className="w-10 h-10 text-[#2a2a35]" />}
                  title="No cowork sessions yet"
                  desc="Sessions created via MCP tools or the Cowork page appear here."
                  href="/cowork"
                  linkLabel="Go to Cowork →"
                />
              ) : filteredSessions.map(s => (
                <Link
                  key={s._id || s.id}
                  href={`/cowork/${s._id || s.id}`}
                  className="bg-[#0c0c0f]/60 border border-[#1e1e24] hover:border-[#8b5cf6]/40 rounded-2xl p-4 flex items-start gap-4 transition-all hover:-translate-y-0.5"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-[#a855f7]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-bold text-[#fafafa] truncate">{s.title}</h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-[#55556a] font-medium capitalize">{s.source}</span>
                      <span className="text-[10px] text-[#55556a]">•</span>
                      <span className="text-[10px] text-[#55556a]">{timeAgo(s.createdAt)}</span>
                      {s.tags?.slice(0, 3).map((tag, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e24] border border-[#2a2a35] text-[#63637a] font-mono">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-[#55556a] shrink-0 mt-1" />
                </Link>
              ))}
            </div>
          )}

          {/* ── NOTES TAB ── */}
          {activeTab === "notes" && (
            <div className="flex flex-col gap-3 relative z-10">
              {!activeSpaceId ? (
                <EmptyState
                  icon={<BookOpen className="w-10 h-10 text-[#2a2a35]" />}
                  title="No spaces yet"
                  desc="Create a space in the Notebook to organize your notes."
                  href="/spaces"
                  linkLabel="Open Notebook →"
                />
              ) : filteredNotes.length === 0 ? (
                <EmptyState
                  icon={<FileText className="w-10 h-10 text-[#2a2a35]" />}
                  title="No notes in this space"
                  desc="Start writing in the Notebook to see your notes here."
                  href="/spaces"
                  linkLabel="Open Notebook →"
                />
              ) : filteredNotes.map(n => (
                <Link
                  key={n._id}
                  href="/spaces"
                  className="bg-[#0c0c0f]/60 border border-[#1e1e24] hover:border-[#8b5cf6]/40 rounded-2xl p-4 flex items-start gap-4 transition-all hover:-translate-y-0.5"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#10b981]/10 border border-[#10b981]/20 flex items-center justify-center shrink-0">
                    {n.isStarred
                      ? <Star size={16} className="text-[#f59e0b]" fill="currentColor" />
                      : <FileText size={16} className="text-[#10b981]" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-bold text-[#fafafa] truncate">{n.title}</h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-[#55556a]">{timeAgo(n.updatedAt)}</span>
                      {n.tags?.slice(0, 3).map((tag, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e24] border border-[#2a2a35] text-[#63637a] font-mono flex items-center gap-0.5">
                          <Tag size={8} />{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-[#55556a] shrink-0 mt-1" />
                </Link>
              ))}
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {activeTab === "history" && (
            <div className="flex flex-col gap-3 relative z-10">
              {filteredHistory.length === 0 ? (
                <EmptyState
                  icon={<Activity className="w-10 h-10 text-[#2a2a35]" />}
                  title="No history entries yet"
                  desc="Sync GitHub or Azure DevOps in History to populate your work timeline."
                  href="/history"
                  linkLabel="Go to History →"
                />
              ) : filteredHistory.map(h => (
                <Link
                  key={h._id}
                  href="/history"
                  className="bg-[#0c0c0f]/60 border border-[#1e1e24] hover:border-[#8b5cf6]/40 rounded-2xl p-4 flex items-start gap-4 transition-all hover:-translate-y-0.5"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center shrink-0">
                    <Activity size={16} className="text-[#3b82f6]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-bold text-[#fafafa] truncate">{h.title}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e24] border border-[#2a2a35] text-[#63637a] capitalize font-mono">{h.category}</span>
                      <span className="text-[10px] text-[#55556a]">{timeAgo(h.createdAt)}</span>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-[#55556a] shrink-0 mt-1" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, desc, href, linkLabel }: {
  icon: React.ReactNode; title: string; desc: string; href: string; linkLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[#1a1a22] rounded-3xl bg-[#0c0c0f]/20">
      <div className="mb-4">{icon}</div>
      <h3 className="text-[14px] font-bold text-[#fafafa] mb-1">{title}</h3>
      <p className="text-[12px] text-[#63637a] max-w-xs mb-4">{desc}</p>
      <Link href={href} className="text-[12px] text-[#8b5cf6] hover:text-[#fafafa] transition-colors font-semibold">
        {linkLabel}
      </Link>
    </div>
  );
}
