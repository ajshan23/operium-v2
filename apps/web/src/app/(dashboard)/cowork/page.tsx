"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Bot, User, Users, Code2, Trash2, ShieldCheck, TerminalSquare,
  Loader2, ExternalLink, Send, GitBranch, Search, ChevronDown,
  AlertTriangle, X,
} from "lucide-react";
import { coworkApi } from "@/api/cowork.api";
import type { CoworkSession } from "@/api/cowork.api";

const MarkdownViewer = dynamic(() => import("@/components/MarkdownViewer"), { ssr: false });

// ─── Chat types ──────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "model" | "assistant";
  content: string;
  sources?: { id: string; title: string; score: number }[];
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoworkPage() {
  // ── Data state ──
  const [sessions,     setSessions]     = useState<CoworkSession[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [pagination,   setPagination]   = useState({ total: 0, page: 1, pages: 1 });

  // ── Filter state ──
  const [searchQuery,  setSearchQuery]  = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [scopeFilter,  setScopeFilter]  = useState<"team" | "personal">("team");

  // ── Delete confirm ──
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);

  // ── Chat state ──
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const [chatLoading,  setChatLoading]  = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  // ── Load sessions ────────────────────────────────────────────────────────────

  const loadSessions = useCallback(async (q: string, scope: "team" | "personal", source: string) => {
    setLoading(true);
    setError(null);
    try {
      if (q.trim()) {
        const res = await coworkApi.search({ q: q.trim(), scope });
        const list = (res as any).data as CoworkSession[];
        setSessions(list);
        setPagination({ total: list.length, page: 1, pages: 1 });
      } else {
        const res = await coworkApi.list({ scope, source: source || undefined });
        const { sessions: list, pagination: pg } = (res as any).data;
        setSessions(list);
        setPagination(pg);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load sessions");
    }
    setLoading(false);
  }, []);

  // Reload when filters change (debounce search input)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadSessions(searchQuery, scopeFilter, sourceFilter);
    }, searchQuery ? 400 : 0);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, scopeFilter, sourceFilter, loadSessions]);

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDeleteClick = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteConfirm({ id, title });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm || deletingId) return;
    setDeletingId(deleteConfirm.id);
    try {
      await coworkApi.delete(deleteConfirm.id);
      setSessions(prev => prev.filter(s => s._id !== deleteConfirm.id && s.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (err: any) {
      setError(err.message || "Failed to delete session");
    }
    setDeletingId(null);
  };

  // ── Chat ─────────────────────────────────────────────────────────────────────

  const handleSendChat = async () => {
    const input = chatInput.trim();
    if (!input || chatLoading) return;
    const newMsg: ChatMessage = { role: "user", content: input };
    const updated = [...chatMessages, newMsg];
    setChatMessages(updated);
    setChatInput("");
    setChatLoading(true);
    try {
      const apiMsgs = updated
        .filter(m => m.role === "user" || m.role === "model")
        .map(m => ({ role: m.role as "user" | "model", content: m.content }));
      const res = await coworkApi.chat(apiMsgs);
      const reply = (res as any).data?.reply ?? "No response";
      setChatMessages(prev => [...prev, { role: "model", content: reply, sources: [] }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, {
        role: "assistant" as const,
        content: `⚠️ ${err.message ?? "Failed to get response. Make sure your Gemini key is configured in Settings."}`,
        sources: [],
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden relative">
      <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(139,92,246,0.02),transparent_60%)] rounded-full pointer-events-none blur-3xl" />

      {/* ── LEFT SECTION: SESSION INDEX ── */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-[#1a1a22] bg-[#050505] overflow-hidden">

        {/* Header */}
        <div className="p-6 border-b border-[#1a1a22] shrink-0 bg-[#050505]">
          <h1 className="text-xl font-bold text-[#fafafa] tracking-tight flex items-center gap-2">
            <Bot className="text-[#8b5cf6]" size={22} />
            <span>Cowork Knowledge Base</span>
          </h1>
          <p className="text-[12px] text-[#63637a] mt-1.5 leading-relaxed">
            Team-wide AI session history. Search for past solutions and captured decisions.
          </p>
        </div>

        {/* Filters Row */}
        <div className="p-4 border-b border-[#1a1a22]/50 shrink-0 bg-[#050505]/40 flex flex-wrap items-center justify-between gap-3">

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative group w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#55556a] group-focus-within:text-[#8b5cf6] transition-colors" size={13} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search summaries..."
                className="w-full h-[34px] bg-[#0c0c0f] border border-[#1e1e24] focus:border-[#8b5cf6]/40 rounded-xl pl-8 pr-3 text-[12px] text-[#fafafa] placeholder:text-[#55556a] focus:outline-none transition-all"
              />
            </div>

            {/* Source select */}
            <div className="relative group">
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}
                className="h-[34px] px-3.5 bg-[#0c0c0f] border border-[#1e1e24] focus:border-[#8b5cf6]/40 rounded-xl text-[12px] text-[#fafafa] focus:outline-none cursor-pointer transition-all hover:bg-[#141418] appearance-none pr-8"
              >
                <option value="">All Sources</option>
                <option value="antigravity">Antigravity</option>
                <option value="claude-code">Claude Code</option>
                <option value="cursor">Cursor</option>
                <option value="system">System</option>
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#55556a]">
                <ChevronDown size={12} />
              </div>
            </div>
          </div>

          {/* Scope selection */}
          <div className="flex bg-[#0c0c0f] border border-[#1e1e24] rounded-xl p-0.5 select-none shrink-0">
            <button
              onClick={() => setScopeFilter("team")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                scopeFilter === "team"
                  ? "bg-[#120e20] border border-[#8b5cf6]/35 text-[#fafafa]"
                  : "text-[#63637a] hover:text-[#fafafa]"
              }`}
            >
              <Users size={12} />
              <span>Team</span>
            </button>
            <button
              onClick={() => setScopeFilter("personal")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                scopeFilter === "personal"
                  ? "bg-[#120e20] border border-[#8b5cf6]/35 text-[#fafafa]"
                  : "text-[#63637a] hover:text-[#fafafa]"
              }`}
            >
              <User size={12} />
              <span>Personal</span>
            </button>
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-[#55556a] py-20">
              <Loader2 size={16} className="animate-spin text-[#8b5cf6]" />
              <span className="text-[12px] font-mono">Loading sessions…</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-20 text-center border border-dashed border-[#1a1a22] rounded-3xl bg-[#0c0c0f]/20 flex flex-col items-center justify-center">
              <Bot className="w-12 h-12 text-[#333342] mb-4" />
              <h3 className="text-[14px] font-bold text-[#fafafa] mb-1">No sessions found</h3>
              <p className="text-[12px] text-[#63637a] max-w-sm">
                {searchQuery
                  ? "No sessions match your search. Try a different keyword."
                  : "No cowork sessions yet. Sessions created via MCP or API will appear here."}
              </p>
            </div>
          ) : (
            sessions.map(session => (
              <SessionCard
                key={session._id || session.id}
                session={session}
                onDelete={handleDeleteClick}
                deletingId={deletingId}
              />
            ))
          )}

          {/* Pagination indicator */}
          {!loading && pagination.total > 0 && (
            <p className="text-center text-[10px] text-[#55556a] font-mono pt-2">
              {sessions.length} of {pagination.total} session{pagination.total !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* ── RIGHT SECTION: AI CHAT SIDEBAR ── */}
      <div className="w-[380px] shrink-0 bg-[#070709] flex flex-col overflow-hidden relative">
        <div className="absolute top-[-30%] left-[20%] w-[300px] h-[300px] bg-[radial-gradient(circle,rgba(139,92,246,0.015),transparent_75%)] rounded-full pointer-events-none blur-3xl" />

        {/* Chat Header */}
        <div className="h-[64px] border-b border-[#1a1a22] px-6 flex items-center justify-between shrink-0 bg-[#070709]">
          <div>
            <span className="text-[12px] font-mono text-[#55556a] uppercase">Cowork Assistant</span>
            <span className="ml-2 text-[9px] font-mono text-[#3f3f52] bg-[#1a1a22] px-1.5 py-0.5 rounded">beta</span>
          </div>
          <button
            onClick={() => setChatMessages([])}
            className="h-[24px] px-2.5 rounded-md border border-[#2a2a35] hover:border-[#8b5cf6]/50 bg-[#120e20]/20 hover:bg-[#120e20]/40 text-[10px] font-semibold text-[#fafafa] flex items-center justify-center transition-all duration-300"
          >
            Clear Chat
          </button>
        </div>

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6 min-h-0">
          {chatMessages.length === 0 && (
            <div className="flex flex-col items-start justify-center h-full space-y-4">
              <div className="space-y-1">
                <h3 className="text-[13px] font-bold text-slate-200">System Assistant Ready</h3>
                <p className="text-[11px] text-[#63637a] leading-relaxed">
                  Query cowork memories, active code fixes, or past agent decisions.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full pt-2">
                {["What auth bugs did the team fix?", "How was the TipTap editor configured?", "Any vector index research?"].map(q => (
                  <button
                    key={q}
                    onClick={() => setChatInput(q)}
                    className="text-[11px] text-left px-3.5 py-2.5 rounded-xl bg-[#0c0c0f] border border-[#1e1e24] hover:border-[#8b5cf6]/40 text-[#a1a1aa] hover:text-[#fafafa] transition-all hover:bg-[#120e20]/20"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} w-full`}>
              <div className={`relative max-w-[95%] w-full flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <span className="text-[9px] text-[#55556a] font-mono uppercase tracking-wider">
                  {msg.role === "user" ? "You" : "Operium AI"}
                </span>
                <div className={`px-4 py-3 text-[12px] leading-relaxed w-full rounded-2xl border ${
                  msg.role === "user"
                    ? "bg-[#120e20]/40 border-[#8b5cf6]/25 text-[#fafafa]"
                    : "bg-[#0c0c0f]/60 border-[#1e1e24] text-[#a1a1aa]"
                }`}>
                  {msg.role === "user"
                    ? <div className="whitespace-pre-wrap font-medium">{msg.content}</div>
                    : <div className="select-text"><MarkdownViewer content={msg.content} /></div>
                  }
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-col gap-1.5 w-full mt-2">
                    <span className="text-[9px] text-[#55556a] font-mono uppercase tracking-wider">Sources</span>
                    {msg.sources.map(src => (
                      <Link
                        key={src.id}
                        href={`/cowork/${src.id}`}
                        className="flex items-center gap-2 text-[10px] font-medium text-[#8b5cf6] hover:text-[#fafafa] bg-[#120e20]/30 border border-[#8b5cf6]/15 rounded-xl px-3 py-2 transition-all"
                      >
                        <ExternalLink size={10} className="shrink-0" />
                        <span className="truncate flex-1">{src.title}</span>
                        <span className="text-[9px] text-[#55556a] shrink-0 font-mono">{(src.score * 100).toFixed(0)}%</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {chatLoading && (
            <div className="flex flex-col items-start w-full gap-1.5">
              <span className="text-[9px] text-[#55556a] font-mono uppercase tracking-wider">System Bot</span>
              <div className="bg-[#0c0c0f]/60 border border-[#1e1e24] rounded-2xl px-4 py-3 w-[80%]">
                <div className="flex items-center gap-2 text-[#55556a]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8b5cf6]" />
                  <span className="text-[11px] font-mono">Querying Operium memory…</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 shrink-0 bg-[#070709] border-t border-[#1a1a22]">
          <div className="relative flex items-center bg-[#0c0c0f] pl-4 pr-2 py-1.5 rounded-xl border border-[#1e1e24] focus-within:border-[#8b5cf6]/40 transition-colors">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSendChat(); }}
              placeholder="Query cowork timeline..."
              className="w-full bg-transparent border-none text-[12px] text-[#fafafa] placeholder:text-[#55556a] focus:outline-none focus:ring-0 h-8"
            />
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim() || chatLoading}
              className="shrink-0 w-8 h-8 flex items-center justify-center text-slate-500 hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 rounded-lg transition-all disabled:opacity-30 ml-2"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Error toast ── */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-500/10 border border-red-500/30 text-red-400 text-[12px] px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg">
          <AlertTriangle size={13} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:text-red-300"><X size={13} /></button>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-[#000000]/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0c0f] border border-[#2a2a35] w-full max-w-[400px] rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-[#fafafa]">Delete Session</h3>
                <p className="text-[11px] text-[#63637a]">This cannot be undone</p>
              </div>
            </div>
            <div className="bg-[#141418] border border-[#1e1e24] rounded-xl p-3.5 mb-4">
              <p className="text-[13px] text-[#a1a1aa]">
                Delete <span className="font-semibold text-[#fafafa]">&ldquo;{deleteConfirm.title}&rdquo;</span>?
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={!!deletingId}
                className="flex-1 h-[38px] rounded-xl border border-[#2a2a35] text-[#a1a1aa] hover:text-[#fafafa] text-[13px] font-semibold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={!!deletingId}
                className="flex-1 h-[38px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                {deletingId ? <><Loader2 size={13} className="animate-spin" />Deleting…</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────

interface SessionCardProps {
  session:   CoworkSession;
  onDelete:  (id: string, title: string, e: React.MouseEvent) => void;
  deletingId:string | null;
}

function getSourceClass(source: string) {
  switch (source) {
    case "antigravity": return "bg-purple-500/10 border-purple-500/20 text-[#a855f7]";
    case "claude-code": return "bg-orange-500/10 border-orange-500/20 text-orange-400";
    case "cursor":      return "bg-blue-500/10 border-blue-500/20 text-[#3b82f6]";
    default:            return "bg-slate-800/40 border-[#2a2a35] text-slate-400";
  }
}

function SourceIcon({ source }: { source: string }) {
  if (source === "antigravity") return <Bot size={16} />;
  if (source === "claude-code") return <TerminalSquare size={16} />;
  if (source === "cursor")      return <Code2 size={16} />;
  return <ShieldCheck size={16} />;
}

const SessionCard = ({ session, onDelete, deletingId }: SessionCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const sid = session._id || session.id;

  return (
    <div className="p-5 rounded-2xl bg-[#0c0c0f]/40 border border-[#1e1e24] hover:border-[#8b5cf6]/40 transition-all overflow-hidden relative group shadow-sm flex flex-col gap-3">

      {/* Top Details */}
      <div className="flex justify-between items-start gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          {/* Source Icon Badge */}
          <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${getSourceClass(session.source)}`}>
            <SourceIcon source={session.source} />
          </div>

          <div className="min-w-0">
            <Link
              href={`/cowork/${sid}`}
              className="text-[#fafafa] font-bold text-[14px] hover:text-[#8b5cf6] transition-colors leading-snug cursor-pointer line-clamp-1"
            >
              {session.title}
            </Link>
            <div className="flex flex-wrap items-center gap-2.5 text-[10px] text-[#55556a] mt-1 font-medium">
              <span className="flex items-center gap-1 text-[#a1a1aa]">
                <User size={10} />
                <span>{session.author?.name ?? "Unknown"}</span>
              </span>
              <span>•</span>
              <span>{new Date(session.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span className="capitalize">{session.source}</span>
              {session.branch && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-mono text-[#a855f7]">
                    <GitBranch size={10} />
                    <span>{session.branch}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Link
            href={`/cowork/${sid}`}
            className="p-1.5 bg-[#141418] hover:bg-[#8b5cf6]/20 text-[#63637a] hover:text-[#8b5cf6] rounded-lg border border-[#2a2a35] hover:border-[#8b5cf6]/25 transition-colors"
          >
            <ExternalLink size={12} />
          </Link>
          {session.isOwn && (
            <button
              onClick={e => onDelete(sid, session.title, e)}
              disabled={deletingId === sid}
              className="p-1.5 bg-[#141418] hover:bg-red-500/20 text-[#63637a] hover:text-red-400 rounded-lg border border-[#2a2a35] hover:border-red-500/25 transition-colors"
            >
              {deletingId === sid
                ? <Loader2 size={12} className="animate-spin" />
                : <Trash2 size={12} />
              }
            </button>
          )}
        </div>
      </div>

      {/* Tags */}
      {session.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 ml-12">
          {session.tags.map((tag, i) => (
            <span key={i} className="text-[9px] font-bold px-2 py-0.5 rounded bg-[#1e1e24]/60 border border-[#2a2a35]/40 text-[#63637a] uppercase tracking-wider">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Intent / Outcome badges */}
      {(session.intent || session.outcome) && (
        <div className="flex gap-2 ml-12">
          {session.intent && (
            <span className="text-[9px] px-2 py-0.5 rounded font-mono bg-[#8b5cf6]/10 text-[#a78bfa] border border-[#8b5cf6]/20">
              {session.intent}
            </span>
          )}
          {session.outcome && (
            <span className={`text-[9px] px-2 py-0.5 rounded font-mono border ${
              session.outcome === "fixed" || session.outcome === "implemented"
                ? "bg-green-500/10 text-green-400 border-green-500/20"
                : session.outcome === "blocked" || session.outcome === "abandoned"
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
            }`}>
              {session.outcome}
            </span>
          )}
        </div>
      )}

      {/* Summary */}
      <div className={`ml-12 text-[12px] leading-relaxed text-[#a1a1aa] ${expanded ? "" : "line-clamp-3"}`}>
        <MarkdownViewer content={session.summary} />
      </div>

      {!expanded && session.summary.length > 180 && (
        <button onClick={() => setExpanded(true)} className="ml-12 text-[11px] font-bold text-[#8b5cf6] hover:text-[#fafafa] transition-colors text-left">
          Read more
        </button>
      )}
      {expanded && (
        <button onClick={() => setExpanded(false)} className="ml-12 text-[11px] font-bold text-[#8b5cf6] hover:text-[#fafafa] transition-colors text-left mt-1">
          Show less
        </button>
      )}
    </div>
  );
};
