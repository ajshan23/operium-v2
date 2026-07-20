"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Bot, Code2, TerminalSquare, ShieldCheck, User, Calendar,
  Trash2, Loader2, ChevronDown, ChevronRight, GitBranch, GitCommit, GitPullRequest,
  ThumbsUp, ThumbsDown, AlertTriangle, X, Send, Sparkles, MessageSquare,
} from "lucide-react";
import { coworkApi } from "@/api/cowork.api";
import type { CoworkSession, CoworkChunk } from "@/api/cowork.api";
import { repoWebUrl, branchWebUrl, commitWebUrl } from "@operium/core/repoLinks";

const MarkdownViewer = dynamic(() => import("@/components/MarkdownViewer"), { ssr: false });

// ─── Source helpers ───────────────────────────────────────────────────────────

const SOURCE_MAP: Record<string, { icon: React.ReactNode; bgClass: string; borderClass: string; textClass: string; label: string }> = {
  "antigravity": { icon: <Bot className="w-5 h-5" />,          bgClass: "bg-purple-500/10", borderClass: "border-purple-500/20", textClass: "text-[#a855f7]", label: "Antigravity" },
  "claude-code": { icon: <TerminalSquare className="w-5 h-5" />,bgClass: "bg-orange-500/10", borderClass: "border-orange-500/20", textClass: "text-orange-400", label: "Claude Code" },
  "cursor":      { icon: <Code2 className="w-5 h-5" />,         bgClass: "bg-blue-500/10",   borderClass: "border-blue-500/20",   textClass: "text-[#3b82f6]", label: "Cursor" },
};
const defaultSource = { icon: <ShieldCheck className="w-5 h-5" />, bgClass: "bg-slate-500/10", borderClass: "border-slate-500/20", textClass: "text-slate-400", label: "System" };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoworkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [session,         setSession]         = useState<CoworkSession | null>(null);
  const [chunks,          setChunks]          = useState<CoworkChunk[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  const [showChunks,      setShowChunks]      = useState(true);

  const [helpfulVote,     setHelpfulVote]     = useState<"up" | "down" | null>(null);
  const [helpfulCount,    setHelpfulCount]    = useState(0);
  const [notHelpfulCount, setNotHelpfulCount] = useState(0);
  const [votePending,     setVotePending]     = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting,        setDeleting]        = useState(false);

  // ── AI Chat ──────────────────────────────────────────────────────────────────
  const [showChat,    setShowChat]    = useState(false);
  const [chatInput,   setChatInput]   = useState("");
  const [chatMsgs,    setChatMsgs]    = useState<{ role: "user" | "model"; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await coworkApi.get(id);
        const { session: s, chunks: c } = (res as any).data as { session: CoworkSession; chunks: CoworkChunk[] };
        setSession(s);
        setChunks(c);
        setHelpfulCount(s.helpfulCount);
        setNotHelpfulCount(s.notHelpfulCount);
      } catch (err: any) {
        setError(err.message || "Failed to load session");
      }
      setLoading(false);
    })();
  }, [id]);

  // ── Feedback ─────────────────────────────────────────────────────────────────

  const handleVote = async (vote: "up" | "down") => {
    if (helpfulVote === vote || votePending || !session) return;
    setVotePending(true);
    const helpful = vote === "up";
    // Optimistic update
    if (vote === "up") {
      setHelpfulCount(p => p + 1);
      if (helpfulVote === "down") setNotHelpfulCount(p => p - 1);
    } else {
      setNotHelpfulCount(p => p + 1);
      if (helpfulVote === "up") setHelpfulCount(p => p - 1);
    }
    setHelpfulVote(vote);
    try {
      const res = await coworkApi.feedback(id, helpful);
      const counts = (res as any).data as { useCount: number; helpfulCount: number; notHelpfulCount: number };
      setHelpfulCount(counts.helpfulCount);
      setNotHelpfulCount(counts.notHelpfulCount);
    } catch { /* revert would be complex — leave optimistic */ }
    setVotePending(false);
  };

  // ── AI Chat ──────────────────────────────────────────────────────────────────

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: { role: "user" | "model"; content: string } = { role: "user", content: chatInput.trim() };
    const newMsgs = [...chatMsgs, userMsg];
    setChatMsgs(newMsgs);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await coworkApi.chat(newMsgs, id);
      const reply = (res as any).data?.reply ?? "No response";
      setChatMsgs([...newMsgs, { role: "model", content: reply }]);
    } catch (err: any) {
      setChatMsgs([...newMsgs, { role: "model", content: `❌ ${err.message ?? "Failed to get response"}` }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (deleting || !session) return;
    setDeleting(true);
    try {
      await coworkApi.delete(session._id || session.id);
      router.push("/cowork");
    } catch (err: any) {
      setError(err.message || "Failed to delete session");
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#55556a]">
        <Loader2 className="w-5 h-5 animate-spin mr-2.5 text-[#8b5cf6]" />
        <span className="text-[12px] font-mono">Retrieving session…</span>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#55556a] gap-4">
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={() => router.push("/cowork")} className="flex items-center gap-1.5 text-xs text-[#8b5cf6] hover:underline">
          <ArrowLeft size={14} /> Back to Cowork
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#55556a] gap-4">
        <p className="text-red-400 text-sm">Session not found</p>
        <button onClick={() => router.push("/cowork")} className="flex items-center gap-1.5 text-xs text-[#8b5cf6] hover:underline">
          <ArrowLeft size={14} /> Back to Cowork
        </button>
      </div>
    );
  }

  const sourceData = SOURCE_MAP[session.source] ?? { ...defaultSource, label: session.source };
  const date = new Date(session.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const time = new Date(session.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex-1 bg-[#050505] overflow-y-auto relative select-none">
      <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(139,92,246,0.02),transparent_60%)] rounded-full pointer-events-none blur-3xl" />

      <div className="max-w-4xl mx-auto w-full p-6 md:p-8 flex flex-col gap-6 relative z-10">

        {/* Back + actions row */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/cowork")}
            className="flex items-center gap-2 text-[12px] font-semibold text-[#63637a] hover:text-[#fafafa] transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Back to Cowork</span>
          </button>
          {session.isOwn && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-1.5 text-[11px] text-[#63637a] hover:text-red-400 px-3 py-1.5 rounded-xl border border-[#2a2a35] hover:border-red-500/30 hover:bg-red-500/5 transition-all"
            >
              <Trash2 size={12} />
              Delete
            </button>
          )}
        </div>

        {/* Header Block */}
        <div className="bg-[#0c0c0f]/50 border border-[#1e1e24] rounded-2xl p-6 flex items-start gap-4">
          <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${sourceData.bgClass} ${sourceData.borderClass} ${sourceData.textClass}`}>
            {sourceData.icon}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#fafafa] leading-snug">{session.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#55556a] mt-2.5 font-medium">
              <span className="flex items-center gap-1 text-[#a1a1aa]">
                <User size={11} />
                <span>{session.author?.name ?? "Unknown"}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                <span>{date} at {time}</span>
              </span>
              <span>•</span>
              <span className={`capitalize ${sourceData.textClass}`}>{sourceData.label}</span>
              {session.repos?.length ? (
                session.repos.map(r => {
                  const branchHref = r.branch ? branchWebUrl(r.repoKey, r.branch) : repoWebUrl(r.repoKey);
                  const commitHref = r.commitSha ? commitWebUrl(r.repoKey, r.commitSha) : null;
                  const label = r.branch ? `${r.repoName}@${r.branch}` : r.repoName;
                  return (
                    <React.Fragment key={`${r.repoKey}-${r.branch ?? ""}`}>
                      <span>•</span>
                      {branchHref ? (
                        <a href={branchHref} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 font-mono text-[#a855f7] hover:text-[#c4b5fd] hover:underline transition-colors" title={r.repoKey}>
                          <GitBranch size={11} />
                          <span>{label}</span>
                        </a>
                      ) : (
                        <span className="flex items-center gap-1 font-mono text-[#a855f7]" title={r.repoKey}>
                          <GitBranch size={11} />
                          <span>{label}</span>
                        </span>
                      )}
                      {r.commitSha && (
                        commitHref ? (
                          <a href={commitHref} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 font-mono text-slate-400 hover:text-slate-200 hover:underline transition-colors">
                            <GitCommit size={11} />
                            <span>{r.commitSha.substring(0, 7)}</span>
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 font-mono text-slate-400">
                            <GitCommit size={11} />
                            <span>{r.commitSha.substring(0, 7)}</span>
                          </span>
                        )
                      )}
                      {r.prUrl && (
                        <a href={r.prUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 font-mono text-[#22c55e] hover:text-[#4ade80] hover:underline transition-colors">
                          <GitPullRequest size={11} />
                          <span>PR</span>
                        </a>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <>
                  {session.branch && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-[#a855f7]">
                        <GitBranch size={11} />
                        <span>{session.branch}</span>
                      </span>
                    </>
                  )}
                  {session.commitSha && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-slate-400">
                        <GitCommit size={11} />
                        <span>{session.commitSha.substring(0, 7)}</span>
                      </span>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Tags */}
            {session.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {session.tags.map((tag, i) => (
                  <span key={i} className="text-[9px] font-bold px-2 py-0.5 rounded bg-[#1e1e24]/60 border border-[#2a2a35]/40 text-[#63637a] uppercase tracking-wider">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Intent / Outcome */}
            {(session.intent || session.outcome) && (
              <div className="flex gap-2 mt-2.5">
                {session.intent && (
                  <span className="text-[9px] px-2 py-0.5 rounded font-mono bg-[#8b5cf6]/10 text-[#a78bfa] border border-[#8b5cf6]/20">{session.intent}</span>
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
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-[#0c0c0f]/40 border border-[#1e1e24] rounded-2xl p-6 min-w-0 overflow-hidden">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#55556a] mb-4">Summary</h2>
          <div className="select-text">
            <MarkdownViewer content={session.summary} />
          </div>
        </div>

        {/* Helpful Feedback Widget */}
        <div className="bg-[#0c0c0f]/40 border border-[#1e1e24] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-2 text-[12px] text-[#a1a1aa] font-medium">
            <span>Was this session useful?</span>
            {(helpfulCount > 0 || notHelpfulCount > 0) && (
              <span className="text-[10px] text-[#55556a] font-mono">
                👍 {helpfulCount} · 👎 {notHelpfulCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVote("up")}
              disabled={votePending}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-60 ${
                helpfulVote === "up"
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.1)]"
                  : "bg-[#0c0c0f] border-[#1e1e24] text-[#63637a] hover:text-emerald-300 hover:border-emerald-500/35"
              }`}
            >
              <ThumbsUp size={11} />
              <span>Helpful</span>
            </button>
            <button
              onClick={() => handleVote("down")}
              disabled={votePending}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-60 ${
                helpfulVote === "down"
                  ? "bg-red-500/20 border-red-500/40 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.1)]"
                  : "bg-[#0c0c0f] border-[#1e1e24] text-[#63637a] hover:text-red-300 hover:border-red-500/35"
              }`}
            >
              <ThumbsDown size={11} />
              <span>Not really</span>
            </button>
          </div>
        </div>

        {/* AI Chat Panel */}
        <div className="bg-[#0c0c0f]/40 border border-[#1e1e24] rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowChat(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#111115] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-[#8b5cf6]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#55556a]">Ask AI about this session</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#3a3a4a]">Powered by Gemini</span>
              {showChat ? <ChevronDown size={12} className="text-[#55556a]" /> : <ChevronRight size={12} className="text-[#55556a]" />}
            </div>
          </button>

          {showChat && (
            <div className="border-t border-[#1e1e24]">
              {/* Messages */}
              <div className="h-72 overflow-y-auto p-4 space-y-3">
                {chatMsgs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <MessageSquare size={24} className="text-[#2a2a35] mb-2" />
                    <p className="text-[#3a3a4a] text-xs">Ask anything about this session or related past work</p>
                    <div className="flex flex-wrap gap-2 mt-3 justify-center">
                      {["What was fixed here?", "Any related issues?", "Summarize the key decisions"].map(q => (
                        <button
                          key={q}
                          onClick={() => { setChatInput(q); }}
                          className="text-[10px] text-[#8b5cf6] border border-[#8b5cf6]/20 bg-[#8b5cf6]/5 px-2.5 py-1 rounded-lg hover:bg-[#8b5cf6]/15 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMsgs.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#8b5cf6]/20 border border-[#8b5cf6]/25 text-[#e2e0ff]"
                          : "bg-[#111115] border border-[#1a1a22] text-[#c4c4d4]"
                      }`}
                    >
                      {msg.role === "model" ? (
                        <>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Sparkles size={10} className="text-[#8b5cf6]" />
                            <span className="text-[10px] text-[#8b5cf6] font-medium">Operium AI</span>
                          </div>
                          <div className="select-text">
                            <MarkdownViewer content={msg.content} />
                          </div>
                        </>
                      ) : (
                        <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#111115] border border-[#1a1a22] rounded-xl px-4 py-3 flex items-center gap-2">
                      <Loader2 size={12} className="text-[#8b5cf6] animate-spin" />
                      <span className="text-xs text-[#63637a]">Thinking…</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-[#1e1e24] p-4 flex gap-3">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder="Ask about this session, related issues, next steps…"
                  className="flex-1 bg-[#111115] border border-[#1a1a22] rounded-xl px-4 py-2.5 text-xs text-[#fafafa] placeholder-[#3a3a4a] outline-none focus:border-[#8b5cf6]/40 transition-colors"
                />
                <button
                  onClick={sendChat}
                  disabled={!chatInput.trim() || chatLoading}
                  className="w-10 h-10 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <Send size={14} className="text-white" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Chunks Timeline */}
        {chunks.length > 0 && (
          <div className="space-y-4">
            <button
              onClick={() => setShowChunks(v => !v)}
              className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#55556a] hover:text-[#fafafa] font-bold transition-colors cursor-pointer"
            >
              {showChunks ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Knowledge Chunks</span>
              <span className="text-[#55556a] normal-case">({chunks.length})</span>
            </button>

            {showChunks && (
              <div className="relative pl-6 border-l border-[#1e1e24] space-y-6 ml-1.5 mt-2 select-text">
                {chunks.map((chunk, index) => (
                  <div key={chunk._id} className="relative space-y-3">
                    <div className="absolute left-[-31px] top-4 size-2.5 rounded-full bg-[#8b5cf6] border border-[#050505] shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
                    <div className="bg-[#0c0c0f]/40 border border-[#1e1e24] hover:border-[#8b5cf6]/40 transition-colors rounded-xl p-4 min-w-0 overflow-hidden flex flex-col gap-2">
                      <div className="flex items-center justify-between text-[9px] text-[#55556a]">
                        <span className="font-bold text-[#8b5cf6]">Chunk #{index + 1}</span>
                        <span>{new Date(chunk.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="text-[12px] leading-relaxed text-[#a1a1aa] font-medium font-sans">
                        <MarkdownViewer content={chunk.text} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
      {showDeleteModal && (
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
                Delete <span className="font-semibold text-[#fafafa]">&ldquo;{session.title}&rdquo;</span>? All chunks will be permanently removed.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 h-[38px] rounded-xl border border-[#2a2a35] text-[#a1a1aa] hover:text-[#fafafa] text-[13px] font-semibold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 h-[38px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                {deleting ? <><Loader2 size={13} className="animate-spin" />Deleting…</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
