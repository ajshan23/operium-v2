"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users, Plus, Search, Bell,
  Bookmark, GitCommit, GitPullRequest, X,
  Activity, FileText, Code2, ListTodo, Bug, Layers,
  Calendar, Rocket, BookOpen, Star, AlertTriangle, Copy, Check, Trash2,
  Clock, RotateCcw, RefreshCw, Loader2
} from "lucide-react";
import { historyApi, HistoryEntry } from "@/api/history.api";

interface Memory {
  id: string;
  title: string;
  description: string;
  category: string;
  type: "simple" | "code" | "checklist";
  createdAt: string;
  isMilestone?: boolean;
  isImportant?: boolean;
  isBlocker?: boolean;
  codeSnippet?: { code: string; language: string; filename?: string };
  checklistItems?: { text: string; completed: boolean }[];
  repo: string;
  source?: "manual" | "git" | "pr" | "deploy" | "build" | "azure";
}

function entryToMemory(e: HistoryEntry): Memory {
  return {
    id:           e._id,
    title:        e.title,
    description:  e.description || "",
    category:     e.category,
    type:         e.type,
    createdAt:    e.createdAt,
    isMilestone:  e.isMilestone,
    isImportant:  e.isImportant,
    isBlocker:    e.isBlocker,
    codeSnippet:  e.codeSnippet,
    checklistItems: e.checklistItems,
    repo:         e.metadata?.repo || e.metadata?.project || "",
    source:       e.source as Memory["source"],
  };
}

const CATEGORY_ICONS: { [key: string]: any } = {
  General:        FileText,
  Meeting:        Users,
  "PR Review":    GitPullRequest,
  "Daily Standup": ListTodo,
  Coding:         Code2,
  Debugging:      Bug,
  Design:         Layers,
  Planning:       Calendar,
  Deployment:     Rocket,
  Wiki:           BookOpen,
};

const CATEGORIES = [
  "All", "General", "Meeting", "PR Review", "Daily Standup",
  "Coding", "Debugging", "Design", "Planning", "Deployment", "Wiki",
];

export default function HistoryPage() {
  const [memories,    setMemories]    = useState<Memory[]>([]);
  const [heatmap,     setHeatmap]     = useState<number[]>(Array(112).fill(0));
  const [totalEntries, setTotalEntries] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(false);

  const [showSaveMemoryModal,  setShowSaveMemoryModal]  = useState(false);
  const [isSaving,             setIsSaving]             = useState(false);
  const [syncError,            setSyncError]            = useState<string | null>(null);
  const [fetchError,           setFetchError]           = useState<string | null>(null);

  // Form states
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [category,    setCategory]    = useState("General");
  const [type,        setType]        = useState<"simple" | "code" | "checklist">("simple");
  const [isMilestone, setIsMilestone] = useState(false);
  const [isImportant, setIsImportant] = useState(false);
  const [isBlocker,   setIsBlocker]   = useState(false);
  const [source,      setSource]      = useState<"manual" | "git" | "pr" | "deploy">("manual");

  const [codeContent,   setCodeContent]   = useState("");
  const [codeLang,      setCodeLang]      = useState("typescript");
  const [codeFilename,  setCodeFilename]  = useState("");
  const [checklistItems, setChecklistItems] = useState<{ text: string; completed: boolean }[]>([{ text: "", completed: false }]);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState("All"); // used by fetchHistory
  const [searchQuery,      setSearchQuery]       = useState("");
  const [filterHighlight,  setFilterHighlight]   = useState<"all" | "milestone" | "blocker" | "important">("all");
  const [selectedSource,   setSelectedSource]    = useState<"all" | "manual" | "git" | "pr" | "deploy" | "build" | "azure">("all");
  const [selectedTimeframe, setSelectedTimeframe] = useState<"all" | "today" | "yesterday" | "week">("all");

  const [copiedId,       setCopiedId]       = useState<string | null>(null);
  const [isSyncingGitHub, setIsSyncingGitHub] = useState(false);
  const [isSyncingAzure,  setIsSyncingAzure]  = useState(false);

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const tz = -new Date().getTimezoneOffset();
      const res = await historyApi.getStats(tz);
      setHeatmap((res as any).data.cells.map((c: any) => c.level));
      setTotalEntries((res as any).data.totalEntries);
    } catch { /* silently fail */ }
  }, []);

  const buildTimeframeDates = () => {
    if (selectedTimeframe === "all") return {};
    const now = new Date();
    if (selectedTimeframe === "today") {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (selectedTimeframe === "yesterday") {
      const start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
      const end   = new Date(now); end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    if (selectedTimeframe === "week") {
      const start = new Date(now); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
      return { startDate: start.toISOString() };
    }
    return {};
  };

  const fetchHistory = useCallback(async (pageNum = 1, append = false) => {
    setLoading(true);
    if (!append) setFetchError(null);
    try {
      const params: any = {
        page:  pageNum,
        limit: 30,
        ...(selectedCategory !== "All" && { category: selectedCategory }),
        ...(searchQuery      !== ""    && { q: searchQuery }),
        ...(filterHighlight  === "milestone" && { isMilestone: true }),
        ...(filterHighlight  === "blocker"   && { isBlocker:   true }),
        ...(filterHighlight  === "important" && { isImportant: true }),
        ...(selectedSource   !== "all"       && { source: selectedSource }),
        ...buildTimeframeDates(),
      };

      const res = await historyApi.getHistory(params);
      const data = (res as any).data;
      const mapped = data.items.map(entryToMemory);

      setMemories(prev => append ? [...prev, ...mapped] : mapped);
      setPage(pageNum);
      setHasMore(pageNum < data.totalPages);
    } catch (err: any) {
      setFetchError(err.message || "Failed to load history");
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, searchQuery, filterHighlight, selectedSource, selectedTimeframe]);

  useEffect(() => {
    fetchHistory(1);
    fetchStats();
  }, [fetchHistory, fetchStats]);

  // ── Sync handlers ─────────────────────────────────────────────────────────

  const handleSyncGitHub = async () => {
    setSyncError(null);
    setIsSyncingGitHub(true);
    try {
      await historyApi.syncGithub();
      await fetchHistory(1);
      await fetchStats();
    } catch (err: any) {
      setSyncError(err.message || "GitHub sync failed");
    }
    setIsSyncingGitHub(false);
  };

  const handleSyncAzure = async () => {
    setSyncError(null);
    setIsSyncingAzure(true);
    try {
      await historyApi.syncAzure();
      await fetchHistory(1);
      await fetchStats();
    } catch (err: any) {
      setSyncError(err.message || "Azure sync failed");
    }
    setIsSyncingAzure(false);
  };

  // ── CRUD helpers ─────────────────────────────────────────────────────────

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const addChecklistItem    = () => setChecklistItems([...checklistItems, { text: "", completed: false }]);
  const removeChecklistItem = (i: number) => setChecklistItems(checklistItems.filter((_, idx) => idx !== i));
  const updateChecklistItemText = (i: number, text: string) => {
    const next = [...checklistItems]; next[i].text = text; setChecklistItems(next);
  };

  const handleToggleChecklistItem = async (memoryId: string, itemIdx: number) => {
    // Optimistic UI update
    setMemories(prev => prev.map(m => {
      if (m.id === memoryId && m.checklistItems) {
        const items = m.checklistItems.map((c, i) => i === itemIdx ? { ...c, completed: !c.completed } : c);
        return { ...m, checklistItems: items };
      }
      return m;
    }));
    // Persist async — fire and forget
    const mem = memories.find(m => m.id === memoryId);
    if (mem?.checklistItems) {
      const items = mem.checklistItems.map((c, i) => i === itemIdx ? { ...c, completed: !c.completed } : c);
      historyApi.updateEntry(memoryId, { checklistItems: items as any }).catch(() => {});
    }
  };

  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await historyApi.createEntry({
        title,
        description,
        category,
        type,
        isMilestone,
        isImportant,
        isBlocker,
        isOngoing: false,
        source,
        ...(type === "code" && {
          codeSnippet: { code: codeContent, language: codeLang, filename: codeFilename || "snippet" }
        }),
        ...(type === "checklist" && {
          checklistItems: checklistItems.filter(i => i.text.trim() !== "")
        }),
      } as any);

      // Reset form
      setTitle(""); setDescription(""); setCategory("General"); setType("simple");
      setIsMilestone(false); setIsImportant(false); setIsBlocker(false);
      setSource("manual");
      setCodeContent(""); setCodeFilename(""); setCodeLang("typescript");
      setChecklistItems([{ text: "", completed: false }]);
      setShowSaveMemoryModal(false);

      await fetchHistory(1);
      await fetchStats();
    } catch (err: any) {
      alert(err.message || "Failed to save");
    }
    setIsSaving(false);
  };

  // ── Filtering (client-side for category pill & highlight counts) ──────────

  const filteredMemories = memories; // Server already filters; client side handles just UI counts

  const groupedMemories: Record<string, Memory[]> = {};
  filteredMemories.forEach(m => {
    const date      = new Date(m.createdAt);
    const today     = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    let dateLabel   = "";
    if (date.toDateString() === today.toDateString())     dateLabel = "Today";
    else if (date.toDateString() === yesterday.toDateString()) dateLabel = "Yesterday";
    else dateLabel = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
    if (!groupedMemories[dateLabel]) groupedMemories[dateLabel] = [];
    groupedMemories[dateLabel].push(m);
  });

  return (
    <div className="flex h-full w-full overflow-hidden relative">

      {/* ── COLUMN 1: TIMELINE FILTERS SIDEBAR ── */}
      <div className="w-[260px] border-r border-[#1a1a22] bg-[#070709] flex flex-col shrink-0 overflow-y-auto select-none">

        <div className="p-4 border-b border-[#1a1a22]">
          <button
            onClick={() => setShowSaveMemoryModal(true)}
            className="w-full h-[40px] px-4 rounded-xl border border-[#2a2a35] hover:border-[#8b5cf6]/50 bg-[#120e20]/20 hover:bg-[#120e20]/40 text-[13px] font-semibold text-[#fafafa] flex items-center justify-between transition-all duration-300 group"
          >
            <span>Add History</span>
            <Plus size={16} className="text-[#8b5cf6] group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>

        <div className="p-4 border-b border-[#1a1a22]/50 flex items-center justify-between">
          <span className="text-[12px] font-extrabold text-[#fafafa] tracking-wider uppercase">Timeline Filters</span>
          {(filterHighlight !== "all" || selectedSource !== "all" || selectedTimeframe !== "all" || selectedCategory !== "All" || searchQuery !== "") && (
            <button
              onClick={() => { setFilterHighlight("all"); setSelectedSource("all"); setSelectedTimeframe("all"); setSelectedCategory("All"); setSearchQuery(""); }}
              className="text-[10px] text-[#8b5cf6] hover:text-[#a78bfa] font-bold flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={11} /> Reset
            </button>
          )}
        </div>

        {/* Highlights Filter Group */}
        <div className="p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[10px] font-bold text-[#63637a] tracking-wider uppercase">Highlights</span>
          </div>
          {[
            { id: "all",       label: "All Memories", icon: Bookmark,      color: "text-[#8b5cf6]", count: totalEntries },
            { id: "milestone", label: "Milestones",   icon: Rocket,        color: "text-purple-400", count: memories.filter(m => m.isMilestone).length },
            { id: "blocker",   label: "Blockers",     icon: AlertTriangle, color: "text-red-400",    count: memories.filter(m => m.isBlocker).length },
            { id: "important", label: "Important",    icon: Star,          color: "text-amber-400",  count: memories.filter(m => m.isImportant).length },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = filterHighlight === item.id;
            return (
              <button key={item.id} onClick={() => setFilterHighlight(item.id as any)}
                className={`w-full h-[38px] px-3 rounded-xl border flex items-center justify-between text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-[#120e20]/60 border-[#8b5cf6]/45 text-[#fafafa] shadow-[0_2px_12px_rgba(139,92,246,0.12),inset_0_1px_0_rgba(255,255,255,0.02)]"
                    : "border-transparent hover:border-[#1e1e24] hover:bg-[#141418]/40 text-[#63637a] hover:text-[#fafafa]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={15} className={item.color} />
                  <span>{item.label}</span>
                </div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                  isActive ? "bg-[#1d1630] border-[#8b5cf6]/30 text-[#8b5cf6]" : "bg-[#141418] border-[#1e1e24] text-[#55556a]"
                }`}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sources Filter Group */}
        <div className="p-4 flex flex-col gap-1.5 border-t border-[#1a1a22]/60">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[10px] font-bold text-[#63637a] tracking-wider uppercase">Sources</span>
          </div>
          {[
            { id: "all",    label: "All Sources",  icon: Layers,        color: "text-[#8b5cf6]",  count: memories.length },
            { id: "manual", label: "Manual",       icon: FileText,      color: "text-blue-400",   count: memories.filter(m => m.source === "manual").length },
            { id: "git",    label: "Git Commits",  icon: GitCommit,     color: "text-emerald-400", count: memories.filter(m => m.source === "git").length },
            { id: "pr",     label: "PR Reviews",   icon: GitPullRequest, color: "text-[#a855f7]", count: memories.filter(m => m.source === "pr").length },
            { id: "deploy", label: "Deployments",  icon: Rocket,        color: "text-pink-400",   count: memories.filter(m => m.source === "deploy" || m.source === "build").length },
            { id: "azure",  label: "Azure DevOps", icon: Activity,      color: "text-blue-300",   count: memories.filter(m => m.source === "azure").length },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = selectedSource === item.id;
            return (
              <button key={item.id} onClick={() => setSelectedSource(item.id as any)}
                className={`w-full h-[38px] px-3 rounded-xl border flex items-center justify-between text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-[#120e20]/60 border-[#8b5cf6]/45 text-[#fafafa] shadow-[0_2px_12px_rgba(139,92,246,0.12),inset_0_1px_0_rgba(255,255,255,0.02)]"
                    : "border-transparent hover:border-[#1e1e24] hover:bg-[#141418]/40 text-[#63637a] hover:text-[#fafafa]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={15} className={item.color} />
                  <span>{item.label}</span>
                </div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                  isActive ? "bg-[#1d1630] border-[#8b5cf6]/30 text-[#8b5cf6]" : "bg-[#141418] border-[#1e1e24] text-[#55556a]"
                }`}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Timeframes Filter Group */}
        <div className="p-4 flex flex-col gap-1.5 border-t border-[#1a1a22]/60 flex-1">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[10px] font-bold text-[#63637a] tracking-wider uppercase">Timeframe</span>
          </div>
          {[
            { id: "all",       label: "All Time",   icon: Calendar },
            { id: "today",     label: "Today",      icon: Clock },
            { id: "yesterday", label: "Yesterday",  icon: Calendar },
            { id: "week",      label: "This Week",  icon: Calendar },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = selectedTimeframe === item.id;
            return (
              <button key={item.id} onClick={() => setSelectedTimeframe(item.id as any)}
                className={`w-full h-[38px] px-3 rounded-xl border flex items-center justify-between text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-[#120e20]/60 border-[#8b5cf6]/45 text-[#fafafa] shadow-[0_2px_12px_rgba(139,92,246,0.12),inset_0_1px_0_rgba(255,255,255,0.02)]"
                    : "border-transparent hover:border-[#1e1e24] hover:bg-[#141418]/40 text-[#63637a] hover:text-[#fafafa]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={15} className={isActive ? "text-[#8b5cf6]" : "text-[#63637a]"} />
                  <span>{item.label}</span>
                </div>
              </button>
            );
          })}
        </div>

      </div>

      {/* ── INNER PAGE CONTAINER ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── HEADER ── */}
        <header className="h-[76px] border-b border-[#1a1a22] flex items-center justify-between px-8 bg-[#050505] shrink-0 z-20">
          <div className="flex-1 max-w-[420px]">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#55556a] group-focus-within:text-[#8b5cf6] transition-colors" size={15} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search history..."
                className="w-full h-[38px] bg-[#0c0c0f]/80 border border-[#23232c] focus:border-[#8b5cf6]/50 rounded-xl pl-10 pr-10 text-[13px] text-[#fafafa] placeholder:text-[#55556a] focus:outline-none focus:shadow-[0_0_15px_rgba(139,92,246,0.1)] transition-all"
              />
              {loading && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8b5cf6] animate-spin" size={14} />}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button className="text-[#63637a] hover:text-[#fafafa] relative p-1.5 rounded-lg hover:bg-[#141418]">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#ef4444] rounded-full shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
            </button>
          </div>
        </header>

        {/* ── SPLIT BODY ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ── COLUMN 2: HISTORY FEED ── */}
          <div className="flex-1 overflow-y-auto p-8 relative bg-[#050505] flex flex-col min-w-0">
            <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(139,92,246,0.04),transparent_60%)] rounded-full pointer-events-none blur-3xl" />

            {/* Error banner */}
            {fetchError && (
              <div className="mb-4 shrink-0 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{fetchError}</span>
                <button onClick={() => fetchHistory(1)} className="ml-auto text-[11px] font-semibold text-red-300 hover:text-red-200 transition-colors">Retry</button>
              </div>
            )}

            {/* Timeline Feed */}
            {loading && memories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#55556a]">
                <Loader2 size={40} className="stroke-1 mb-3 animate-spin text-[#8b5cf6]" />
                <p className="text-[13px]">Loading history…</p>
              </div>
            ) : !fetchError && memories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#55556a]">
                <Bookmark size={40} className="stroke-1 mb-3" />
                <p className="text-[13px]">No history found. Add your first entry or sync an integration.</p>
              </div>
            ) : (
              <div className="relative pl-6 flex flex-col gap-8 flex-1">
                <div className="absolute left-[11px] top-6 bottom-6 w-[1.5px] bg-[#16161e]" />

                {Object.entries(groupedMemories).map(([dateLabel, items]) => (
                  <div key={dateLabel} className="flex flex-col gap-5 relative">
                    <div className="relative pl-6 z-10 select-none">
                      <div className="absolute left-[8px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#8b5cf6] border border-[#050505] shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                      <span className="text-[11px] font-bold text-[#8b5cf6] uppercase tracking-wider">{dateLabel}</span>
                    </div>

                    {items.map((m) => {
                      const Icon = CATEGORY_ICONS[m.category] || FileText;

                      let glowBorderClass = "border-[#1e1e24] hover:border-[#8b5cf6]/40 shadow-[0_4px_24px_rgba(0,0,0,0.4)]";
                      let headerBadge: React.ReactNode = null;

                      if (m.isMilestone) {
                        glowBorderClass = "border-purple-500/50 bg-[#120e20]/40 shadow-[0_0_15px_rgba(139,92,246,0.15)]";
                        headerBadge = (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold uppercase tracking-wide flex items-center gap-1">
                            <Rocket size={10} /> Milestone
                          </span>
                        );
                      } else if (m.isBlocker) {
                        glowBorderClass = "border-red-500/40 bg-[#1f1010]/30 shadow-[0_0_15px_rgba(239,68,68,0.12)]";
                        headerBadge = (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 font-bold uppercase tracking-wide flex items-center gap-1">
                            <AlertTriangle size={10} /> Blocker
                          </span>
                        );
                      } else if (m.isImportant) {
                        glowBorderClass = "border-amber-500/40 bg-[#1c160e]/30 shadow-[0_0_15px_rgba(245,158,11,0.12)]";
                        headerBadge = (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase tracking-wide flex items-center gap-1">
                            <Star size={10} className="fill-amber-300" /> Important
                          </span>
                        );
                      }

                      return (
                        <div key={m.id} className="relative pl-6">
                          <div className={`absolute left-[-22px] top-3.5 w-6 h-6 rounded-full flex items-center justify-center z-10 shadow-[0_2px_6px_rgba(0,0,0,0.3)] ${
                            m.isMilestone
                              ? "bg-[#120e20] border border-purple-500/50 text-[#8b5cf6] shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                              : m.isBlocker
                                ? "bg-[#1f1010] border border-red-500/50 text-[#ef4444]"
                                : "bg-[#0c0c0f] border border-[#2a2a35] text-[#a1a1aa]"
                          }`}>
                            <Icon size={12} strokeWidth={2.2} />
                          </div>

                          <div className={`bg-[#0c0c0f]/60 backdrop-blur-md border rounded-2xl p-5 hover:shadow-[0_4px_30px_rgba(139,92,246,0.06),inset_0_1px_1px_rgba(255,255,255,0.02)] transition-all duration-300 ${glowBorderClass}`}>
                            <div className="flex items-start justify-between gap-4 mb-2">
                              <div className="flex flex-col gap-1">
                                <h4 className="text-[14px] font-semibold text-[#fafafa] flex flex-wrap items-center gap-2">
                                  <span>{m.title}</span>
                                  {headerBadge}
                                </h4>
                                <div className="flex items-center gap-2 text-[11px] text-[#63637a] font-medium">
                                  <span>{m.category}</span>
                                  {m.repo && <><span>•</span><span>{m.repo}</span></>}
                                </div>
                              </div>
                              <span className="text-[11px] text-[#55556a] font-semibold shrink-0">
                                {new Date(m.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>

                            {m.description && (
                              <p className="text-[13px] text-[#a1a1aa] leading-relaxed whitespace-pre-wrap mt-2 mb-3">
                                {m.description}
                              </p>
                            )}

                            {m.type === "code" && m.codeSnippet && (
                              <div className="mt-3 bg-[#070709] border border-[#1e1e24] rounded-xl overflow-hidden font-mono text-[12px] text-[#a1a1aa] shadow-inner select-text">
                                <div className="flex items-center justify-between px-4 py-2 bg-[#0c0c0f] border-b border-[#1e1e24]">
                                  <span className="text-[#63637a] text-[11px] truncate">{m.codeSnippet.filename || "snippet"}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] text-[#8b5cf6] uppercase font-bold">{m.codeSnippet.language}</span>
                                    <button onClick={() => handleCopy(m.id, m.codeSnippet!.code)} className="text-[#63637a] hover:text-[#fafafa] transition-colors" title="Copy code">
                                      {copiedId === m.id ? <Check size={13} className="text-[#22c55e]" /> : <Copy size={13} />}
                                    </button>
                                  </div>
                                </div>
                                <pre className="p-4 overflow-x-auto leading-relaxed whitespace-pre font-mono bg-[#070709]/80 text-[#d4d4d8]">
                                  <code>{m.codeSnippet.code}</code>
                                </pre>
                              </div>
                            )}

                            {m.type === "checklist" && m.checklistItems && (
                              <div className="flex flex-col gap-2 mt-3 p-3 bg-[#0c0c0f]/60 border border-[#1e1e24] rounded-xl select-none">
                                {m.checklistItems.map((check, idx) => (
                                  <div key={idx} className="flex items-start gap-2.5 group/item">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleChecklistItem(m.id, idx)}
                                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                        check.completed ? "bg-[#22c55e]/20 border-[#22c55e]" : "border-[#2a2a35] bg-[#141418] hover:border-[#63637a]"
                                      }`}
                                    >
                                      {check.completed && <Check size={10} className="text-[#22c55e] stroke-[3]" />}
                                    </button>
                                    <span className={`text-[12px] transition-colors ${check.completed ? "text-[#55556a] line-through" : "text-[#a1a1aa]"}`}>
                                      {check.text}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-between border-t border-[#1e1e24]/40 mt-4 pt-3">
                              <span className="text-[10px] font-mono text-[#55556a] uppercase flex items-center gap-1.5">
                                {(() => {
                                  switch (m.source) {
                                    case "git":   return <GitCommit     size={11} className="text-[#3b82f6]"  />;
                                    case "pr":    return <GitPullRequest size={11} className="text-[#a855f7]" />;
                                    case "deploy":
                                    case "build": return <Rocket         size={11} className="text-[#22c55e]" />;
                                    case "azure": return <Activity       size={11} className="text-[#0078d4]" />;
                                    default:      return <FileText       size={11} className="text-[#63637a]"  />;
                                  }
                                })()}
                                <span>Source: {m.source || "manual"}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Load more */}
                {hasMore && (
                  <button
                    onClick={() => fetchHistory(page + 1, true)}
                    disabled={loading}
                    className="self-center mt-2 h-[36px] px-6 rounded-xl border border-[#2a2a35] text-[12px] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#8b5cf6]/40 transition-all disabled:opacity-50"
                  >
                    {loading ? "Loading…" : "Load more"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── COLUMN 3: ACTIVITY PULSE & SYNC ── */}
          <div className="w-[280px] border-l border-[#1a1a22] bg-[#070709] overflow-y-auto p-6 flex flex-col gap-8 shrink-0 select-none">

            {/* Activity Pulse Heatmap */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#63637a] tracking-wider uppercase">Activity Pulse</span>
                <span className="text-[9px] font-mono text-[#55556a]">16 WEEKS</span>
              </div>
              <div className="grid gap-1 p-2 bg-[#0c0c0f] border border-[#1e1e24] rounded-2xl" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
                {heatmap.map((level, i) => (
                  <div
                    key={i}
                    className={`h-[9px] rounded-sm transition-all duration-300 ${
                      level === 0 ? "bg-[#141418]" :
                      level === 1 ? "bg-[#8b5cf6]/20" :
                      level === 2 ? "bg-[#8b5cf6]/40" :
                      level === 3 ? "bg-[#8b5cf6]/65" :
                                    "bg-[#8b5cf6] shadow-[0_0_8px_rgba(139,92,246,0.6)]"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between text-[9px] text-[#55556a] px-1">
                <span>Less</span>
                <div className="flex gap-0.5">
                  {[0,1,2,3,4].map(l => (
                    <div key={l} className={`w-2 h-2 rounded-sm ${
                      l === 0 ? "bg-[#141418]" : l === 1 ? "bg-[#8b5cf6]/20" : l === 2 ? "bg-[#8b5cf6]/40" : l === 3 ? "bg-[#8b5cf6]/65" : "bg-[#8b5cf6] shadow-[0_0_4px_rgba(139,92,246,0.6)]"
                    }`} />
                  ))}
                </div>
                <span>More</span>
              </div>
            </div>

            {/* Integrations & Sync Section */}
            <div className="flex flex-col gap-4 border-t border-[#1a1a22]/60 pt-6">
              <span className="text-[10px] font-bold text-[#63637a] tracking-wider uppercase flex items-center gap-1.5">
                <Activity size={12} className="text-[#8b5cf6]" />
                <span>Integrations & Sync</span>
              </span>

              {syncError && (
                <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {syncError}
                </div>
              )}

              <div className="flex flex-col gap-3">
                {/* GitHub Sync */}
                <button
                  onClick={handleSyncGitHub}
                  disabled={isSyncingGitHub || isSyncingAzure}
                  className="w-full h-[54px] px-4 rounded-xl border border-[#2a2a35] hover:border-[#8b5cf6]/50 bg-[#120e20]/15 hover:bg-[#120e20]/30 transition-all flex items-center justify-between group disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-[#a1a1aa] group-hover:text-[#8b5cf6] transition-colors">
                      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                    </svg>
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[12px] font-semibold text-[#fafafa]">Sync GitHub</span>
                      <span className="text-[9px] text-[#63637a] text-left">Commits & PR Reviews</span>
                    </div>
                  </div>
                  <RefreshCw className={`w-4 h-4 text-[#8b5cf6] ${isSyncingGitHub ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
                </button>

                {/* Azure DevOps Sync */}
                <button
                  onClick={handleSyncAzure}
                  disabled={isSyncingGitHub || isSyncingAzure}
                  className="w-full h-[54px] px-4 rounded-xl border border-[#2a2a35] hover:border-[#0078d4]/50 bg-[#0c1324]/15 hover:bg-[#0c1324]/30 transition-all flex items-center justify-between group disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-[#a1a1aa] group-hover:text-[#0078d4] transition-colors">
                      <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v15.12l-5.624 4.453-10.18-3.58v3.58L3.16 18.283l14.166 1.86V4.18z" />
                    </svg>
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[12px] font-semibold text-[#fafafa]">Sync Azure DevOps</span>
                      <span className="text-[9px] text-[#63637a] text-left">Repos, PRs & Builds</span>
                    </div>
                  </div>
                  <RefreshCw className={`w-4 h-4 text-[#0078d4] ${isSyncingAzure ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── MODAL: SAVE MEMORY ── */}
      {showSaveMemoryModal && (
        <div className="fixed inset-0 bg-[#000000]/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out] select-none">
          <div className="bg-[#0c0c0f] border border-[#2a2a35] w-full max-w-[500px] rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7),0_0_24px_rgba(139,92,246,0.1)] relative z-50 animate-[zoomIn_0.2s_ease-out] overflow-y-auto max-h-[90vh]">
            <div className="absolute top-[-40%] left-[20%] w-[300px] h-[300px] bg-[radial-gradient(circle,rgba(139,92,246,0.12),transparent_70%)] rounded-full pointer-events-none blur-2xl" />

            <div className="flex items-center justify-between mb-4 relative z-10">
              <h3 className="text-[18px] font-bold text-[#fafafa] tracking-tight">Save New Memory</h3>
              <button onClick={() => setShowSaveMemoryModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-[#63637a] hover:text-[#fafafa] hover:bg-[#141418] transition-colors border border-transparent hover:border-[#1e1e24]">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveMemory} className="flex flex-col gap-4 relative z-10">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#63637a] uppercase tracking-wider">Memory Title</label>
                <input type="text" required placeholder="e.g. Optimize vector index settings" value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-[40px] bg-[#141418] border border-[#2a2a35] focus:border-[#8b5cf6]/50 rounded-xl px-3.5 text-[13px] text-[#fafafa] placeholder:text-[#55556a] focus:outline-none focus:shadow-[0_0_12px_rgba(139,92,246,0.1)] transition-all" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#63637a] uppercase tracking-wider">Memory Description / Details</label>
                <textarea required placeholder="Describe details of the refactor, decision, or logic..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                  className="w-full bg-[#141418] border border-[#2a2a35] focus:border-[#8b5cf6]/50 rounded-xl p-3.5 text-[13px] text-[#fafafa] placeholder:text-[#55556a] focus:outline-none focus:shadow-[0_0_12px_rgba(139,92,246,0.1)] transition-all resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#63637a] uppercase tracking-wider">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-[40px] bg-[#141418] border border-[#2a2a35] focus:border-[#8b5cf6]/50 rounded-xl px-2 text-[12px] text-[#fafafa] focus:outline-none focus:shadow-[0_0_12px_rgba(139,92,246,0.1)] transition-all">
                    {CATEGORIES.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#63637a] uppercase tracking-wider">Source</label>
                  <select value={source} onChange={(e) => setSource(e.target.value as any)}
                    className="w-full h-[40px] bg-[#141418] border border-[#2a2a35] focus:border-[#8b5cf6]/50 rounded-xl px-2 text-[12px] text-[#fafafa] focus:outline-none focus:shadow-[0_0_12px_rgba(139,92,246,0.1)] transition-all">
                    <option value="manual">Manual</option>
                    <option value="git">Git</option>
                    <option value="pr">PR Review</option>
                    <option value="deploy">Deploy</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#63637a] uppercase tracking-wider">Memory Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["simple", "code", "checklist"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setType(t)}
                      className={`h-[36px] rounded-xl text-[12px] font-semibold border transition-all ${
                        type === t
                          ? "bg-[#120e20]/65 border-[#8b5cf6] text-[#fafafa] shadow-[0_2px_8px_rgba(139,92,246,0.2)]"
                          : "bg-[#141418] border-[#2a2a35] text-[#63637a] hover:text-[#fafafa] hover:border-[#2a2a35]"
                      }`}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {type === "code" && (
                <div className="flex flex-col gap-3 p-4 bg-[#141418]/60 border border-[#2a2a35] rounded-2xl">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[#63637a] uppercase">Filename</label>
                      <input type="text" placeholder="e.g. index.ts" value={codeFilename} onChange={(e) => setCodeFilename(e.target.value)}
                        className="w-full h-[36px] bg-[#0c0c0f] border border-[#2a2a35] focus:border-[#8b5cf6]/50 rounded-lg px-3 text-[12px] text-[#fafafa] focus:outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[#63637a] uppercase">Language</label>
                      <input type="text" placeholder="e.g. typescript" value={codeLang} onChange={(e) => setCodeLang(e.target.value)}
                        className="w-full h-[36px] bg-[#0c0c0f] border border-[#2a2a35] focus:border-[#8b5cf6]/50 rounded-lg px-3 text-[12px] text-[#fafafa] focus:outline-none" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-[#63637a] uppercase">Code</label>
                    <textarea required placeholder="Paste code snippet here..." value={codeContent} onChange={(e) => setCodeContent(e.target.value)} rows={3}
                      className="w-full bg-[#0c0c0f] border border-[#2a2a35] focus:border-[#8b5cf6]/50 rounded-lg p-3 text-[12px] text-[#fafafa] font-mono focus:outline-none resize-none" />
                  </div>
                </div>
              )}

              {type === "checklist" && (
                <div className="flex flex-col gap-3 p-4 bg-[#141418]/60 border border-[#2a2a35] rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#63637a] uppercase">Checklist Items</span>
                    <button type="button" onClick={addChecklistItem} className="text-[10px] text-[#8b5cf6] font-semibold flex items-center gap-1 hover:text-white">
                      <Plus size={12} /> Add Item
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto pr-1">
                    {checklistItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input type="text" required placeholder={`Item ${idx + 1}`} value={item.text} onChange={(e) => updateChecklistItemText(idx, e.target.value)}
                          className="flex-1 h-[34px] bg-[#0c0c0f] border border-[#2a2a35] focus:border-[#8b5cf6]/50 rounded-lg px-3 text-[12px] text-[#fafafa] focus:outline-none" />
                        {checklistItems.length > 1 && (
                          <button type="button" onClick={() => removeChecklistItem(idx)} className="text-[#63637a] hover:text-[#ef4444] transition-colors">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#63637a] uppercase tracking-wider">Flags / Highlights</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: "isMilestone", label: "Milestone", icon: Rocket,        active: isMilestone, set: setIsMilestone, colors: "purple" },
                    { key: "isBlocker",   label: "Blocker",   icon: AlertTriangle, active: isBlocker,   set: setIsBlocker,   colors: "red"    },
                    { key: "isImportant", label: "Important", icon: Star,          active: isImportant, set: setIsImportant, colors: "amber"  },
                  ].map(({ key, label, icon: Icon, active, set, colors }) => (
                    <label key={key} className={`h-[38px] rounded-xl border flex items-center justify-center gap-1.5 text-[11px] font-bold cursor-pointer transition-all ${
                      active
                        ? colors === "purple" ? "bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-[0_2px_8px_rgba(168,85,247,0.15)]"
                          : colors === "red"  ? "bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_2px_8px_rgba(239,68,68,0.15)]"
                          : "bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_2px_8px_rgba(245,158,11,0.15)]"
                        : "bg-[#141418]/60 border-[#2a2a35] text-[#63637a] hover:border-[#333342] hover:text-[#fafafa]"
                    }`}>
                      <input type="checkbox" checked={active} onChange={() => set(!active)} className="sr-only" />
                      <Icon size={12} /><span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-2 border-t border-[#1e1e24]/40 pt-4">
                <button type="button" onClick={() => setShowSaveMemoryModal(false)}
                  className="flex-1 h-[40px] rounded-xl border border-[#2a2a35] text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#141418] text-[13px] font-semibold transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={isSaving}
                  className="flex-1 h-[40px] rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#6366f1] text-white text-[13px] font-semibold shadow-[0_4px_12px_rgba(124,58,237,0.2)] hover:shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2">
                  {isSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save Memory"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
