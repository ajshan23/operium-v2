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
import type { CoworkSession } from "@/api/cowork.api";
import { repoWebUrl, branchWebUrl, commitWebUrl } from "@operium/core/repoLinks";

const MarkdownViewer = dynamic(() => import("@/components/MarkdownViewer"), { ssr: false });

// ─── Source helpers ───────────────────────────────────────────────────────────

const SOURCE_MAP: Record<string, { icon: React.ReactNode; bgClass: string; borderClass: string; textClass: string; label: string }> = {
  "antigravity": { icon: <Bot className="w-5 h-5" />,          bgClass: "bg-accent/10", borderClass: "border-accent/20", textClass: "text-accent-text", label: "Antigravity" },
  "claude-code": { icon: <TerminalSquare className="w-5 h-5" />,bgClass: "bg-status-warning/10", borderClass: "border-status-warning/20", textClass: "text-status-warning", label: "Claude Code" },
  "codex":       { icon: <TerminalSquare className="w-5 h-5" />,bgClass: "bg-status-success/10", borderClass: "border-status-success/20", textClass: "text-status-success", label: "Codex" },
  "cursor":      { icon: <Code2 className="w-5 h-5" />,         bgClass: "bg-status-info/10",   borderClass: "border-status-info/20",   textClass: "text-status-info", label: "Cursor" },
};
const defaultSource = { icon: <ShieldCheck className="w-5 h-5" />, bgClass: "bg-surface-raised", borderClass: "border-line-subtle", textClass: "text-content-muted", label: "System" };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoworkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [session,         setSession]         = useState<CoworkSession | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState<string | null>(null);

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
        const { session: s } = (res as any).data as { session: CoworkSession };
        setSession(s);
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
      <div className="flex-1 flex items-center justify-center text-content-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2.5 text-accent-text" />
        <span className="text-[12px] font-mono">Retrieving session…</span>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-content-muted gap-4">
        <p className="text-status-error text-sm">{error}</p>
        <button onClick={() => router.push("/cowork")} className="flex items-center gap-1.5 text-xs text-accent-text hover:underline">
          <ArrowLeft size={14} /> Back to Cowork
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-content-muted gap-4">
        <p className="text-status-error text-sm">Session not found</p>
        <button onClick={() => router.push("/cowork")} className="flex items-center gap-1.5 text-xs text-accent-text hover:underline">
          <ArrowLeft size={14} /> Back to Cowork
        </button>
      </div>
    );
  }

  const sourceData = SOURCE_MAP[session.source] ?? { ...defaultSource, label: session.source };
  const date = new Date(session.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const time = new Date(session.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex-1 bg-surface-page overflow-y-auto relative select-none">
      <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(139,92,246,0.02),transparent_60%)] rounded-full pointer-events-none blur-3xl" />

      <div className="max-w-4xl mx-auto w-full p-6 md:p-8 flex flex-col gap-6 relative z-10">

        {/* Back + actions row */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/cowork")}
            className="flex items-center gap-2 text-[12px] font-semibold text-content-muted hover:text-content-primary transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Back to Cowork</span>
          </button>
          {session.isOwn && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-1.5 text-xs text-content-muted hover:text-status-error px-3 py-1.5 rounded-xl border border-line hover:border-status-error/30 hover:bg-status-error/5 transition-all"
            >
              <Trash2 size={12} />
              Delete
            </button>
          )}
        </div>

        {/* Header Block */}
        <div className="bg-surface-panel/50 border border-line-subtle rounded-2xl p-6 flex items-start gap-4">
          <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${sourceData.bgClass} ${sourceData.borderClass} ${sourceData.textClass}`}>
            {sourceData.icon}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-content-primary leading-snug">{session.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-content-muted mt-2.5 font-medium">
              <span className="flex items-center gap-1 text-content-secondary">
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
                          className="flex items-center gap-1 font-mono text-accent-text hover:text-accent-text hover:underline transition-colors" title={r.repoKey}>
                          <GitBranch size={11} />
                          <span>{label}</span>
                        </a>
                      ) : (
                        <span className="flex items-center gap-1 font-mono text-accent-text" title={r.repoKey}>
                          <GitBranch size={11} />
                          <span>{label}</span>
                        </span>
                      )}
                      {r.commitSha && (
                        commitHref ? (
                          <a href={commitHref} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 font-mono text-content-muted hover:text-content-secondary hover:underline transition-colors">
                            <GitCommit size={11} />
                            <span>{r.commitSha.substring(0, 7)}</span>
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 font-mono text-content-muted">
                            <GitCommit size={11} />
                            <span>{r.commitSha.substring(0, 7)}</span>
                          </span>
                        )
                      )}
                      {r.prUrl && (
                        <a href={r.prUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 font-mono text-status-success hover:text-status-success hover:underline transition-colors">
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
                      <span className="flex items-center gap-1 font-mono text-accent-text">
                        <GitBranch size={11} />
                        <span>{session.branch}</span>
                      </span>
                    </>
                  )}
                  {session.commitSha && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-content-muted">
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
                  <span key={i} className="text-xs font-bold px-2 py-0.5 rounded bg-surface-hover/60 border border-line/40 text-content-muted uppercase tracking-wider">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Intent / Outcome */}
            {(session.intent || session.outcome) && (
              <div className="flex gap-2 mt-2.5">
                {session.intent && (
                  <span className="text-xs px-2 py-0.5 rounded font-mono bg-accent/10 text-accent-text border border-accent/20">{session.intent}</span>
                )}
                {session.outcome && (
                  <span className={`text-xs px-2 py-0.5 rounded font-mono border ${
                    session.outcome === "fixed" || session.outcome === "implemented"
                      ? "bg-status-success/10 text-status-success border-status-success/20"
                      : session.outcome === "blocked" || session.outcome === "abandoned"
                      ? "bg-status-error/10 text-status-error border-status-error/20"
                      : "bg-status-warning/10 text-status-warning border-status-warning/20"
                  }`}>
                    {session.outcome}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-surface-panel/40 border border-line-subtle rounded-2xl p-6 min-w-0 overflow-hidden">
          <h2 className="text-xs font-bold uppercase tracking-widest text-content-muted mb-4">Summary</h2>
          <div className="select-text">
            <MarkdownViewer content={session.summary} />
          </div>
        </div>

        {/* Helpful Feedback Widget */}
        <div className="bg-surface-panel/40 border border-line-subtle rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-2 text-[12px] text-content-secondary font-medium">
            <span>Was this session useful?</span>
            {(helpfulCount > 0 || notHelpfulCount > 0) && (
              <span className="text-xs text-content-muted font-mono">
                👍 {helpfulCount} · 👎 {notHelpfulCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVote("up")}
              disabled={votePending}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer disabled:opacity-60 ${
                helpfulVote === "up"
                  ? "bg-status-success/20 border-status-success/40 text-status-success shadow-[0_0_12px_rgba(16,185,129,0.1)]"
                  : "bg-surface-panel border-line-subtle text-content-muted hover:text-status-success hover:border-status-success/40"
              }`}
            >
              <ThumbsUp size={11} />
              <span>Helpful</span>
            </button>
            <button
              onClick={() => handleVote("down")}
              disabled={votePending}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer disabled:opacity-60 ${
                helpfulVote === "down"
                  ? "bg-status-error/20 border-status-error/40 text-status-error shadow-[0_0_12px_rgba(239,68,68,0.1)]"
                  : "bg-surface-panel border-line-subtle text-content-muted hover:text-status-error hover:border-status-error/40"
              }`}
            >
              <ThumbsDown size={11} />
              <span>Not really</span>
            </button>
          </div>
        </div>

        {/* AI Chat Panel */}
        <div className="bg-surface-panel/40 border border-line-subtle rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowChat(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-surface-raised transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-accent-text" />
              <span className="text-xs font-bold uppercase tracking-widest text-content-muted">Ask AI about this session</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-content-muted">Powered by Gemini</span>
              {showChat ? <ChevronDown size={12} className="text-content-muted" /> : <ChevronRight size={12} className="text-content-muted" />}
            </div>
          </button>

          {showChat && (
            <div className="border-t border-line-subtle">
              {/* Messages */}
              <div className="h-72 overflow-y-auto p-4 space-y-3">
                {chatMsgs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <MessageSquare size={24} className="text-content-muted mb-2" />
                    <p className="text-content-muted text-xs">Ask anything about this session or related past work</p>
                    <div className="flex flex-wrap gap-2 mt-3 justify-center">
                      {["What was fixed here?", "Any related issues?", "Summarize the key decisions"].map(q => (
                        <button
                          key={q}
                          onClick={() => { setChatInput(q); }}
                          className="text-xs text-accent-text border border-accent/20 bg-accent/5 px-2.5 py-1 rounded-lg hover:bg-accent/20 transition-colors"
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
                          ? "bg-accent/20 border border-accent/25 text-content-primary"
                          : "bg-surface-raised border border-line-subtle text-content-secondary"
                      }`}
                    >
                      {msg.role === "model" ? (
                        <>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Sparkles size={10} className="text-accent-text" />
                            <span className="text-xs text-accent-text font-medium">Operium AI</span>
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
                    <div className="bg-surface-raised border border-line-subtle rounded-xl px-4 py-3 flex items-center gap-2">
                      <Loader2 size={12} className="text-accent-text animate-spin" />
                      <span className="text-xs text-content-muted">Thinking…</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-line-subtle p-4 flex gap-3">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder="Ask about this session, related issues, next steps…"
                  className="flex-1 bg-surface-raised border border-line-control rounded-xl px-4 py-2.5 text-xs text-content-primary placeholder:text-content-muted focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)] transition-colors"
                />
                <button
                  onClick={sendChat}
                  disabled={!chatInput.trim() || chatLoading}
                  className="w-10 h-10 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <Send size={14} className="text-content-primary" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Knowledge Chunks intentionally not shown — they're the summary split
            for search/embeddings; the summary above is the human-facing record. */}

      </div>

      {/* ── Error toast ── */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-status-error/10 border border-status-error/30 text-status-error text-[12px] px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg">
          <AlertTriangle size={13} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:text-status-error"><X size={13} /></button>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-overlay/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-line w-full max-w-[400px] rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-status-error/10 border border-status-error/20 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-status-error" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-content-primary">Delete Session</h3>
                <p className="text-xs text-content-muted">This cannot be undone</p>
              </div>
            </div>
            <div className="bg-surface-raised border border-line-subtle rounded-xl p-3.5 mb-4">
              <p className="text-[13px] text-content-secondary">
                Delete <span className="font-semibold text-content-primary">&ldquo;{session.title}&rdquo;</span>? All chunks will be permanently removed.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 h-[38px] rounded-xl border border-line text-content-secondary hover:text-content-primary text-[13px] font-semibold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 h-[38px] rounded-xl bg-red-600 hover:bg-red-700 text-content-inverse text-[13px] font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
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
