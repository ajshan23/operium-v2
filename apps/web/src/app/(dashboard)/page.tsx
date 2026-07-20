"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus, Search, Bell, Terminal, GitBranch,
  BookOpen, Bot, Activity, ArrowRight,
  Cpu, Database, Sparkles, CheckSquare,
  RefreshCw, Loader2, Clock, FileText,
} from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { getUser } from "@/lib/auth";
import { apiClient } from "@/api/client";

function Github(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={props.className} width="16" height="16">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

interface DashboardStats {
  tasks: { todo: number; in_progress: number; done: number; cancelled: number; total: number };
  coworkSessions: number;
  notes: number;
  recentHistory: Array<{ _id: string; category: string; title: string; summary: string; createdAt: string; source?: string; isMilestone?: boolean }>;
  integrations: { github: boolean; azure: boolean; gemini: boolean; mcp: boolean; mcpToolCount?: number; mcpCallsThisWeek?: number; githubLastSync: string | null; azureLastSync: string | null };
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const [greeting, setGreeting] = useState("Welcome back");
  const [userName, setUserName] = useState("there");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const hr = new Date().getHours();
    if (hr < 12) setGreeting("Good morning");
    else if (hr < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
    const u = getUser();
    if (u) setUserName(u.name || u.email?.split("@")[0] || "there");
  }, []);

  useEffect(() => {
    apiClient<{ data: DashboardStats }>("/api/dashboard/stats")
      .then(r => setStats((r as any).data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  const quickLaunch = [
    { title: "AI Coworking", description: "Search past sessions & chat with AI", icon: Bot, color: "from-[#8b5cf6] to-[#6d28d9]", shadow: "shadow-[#8b5cf6]/20", href: "/cowork" },
    { title: "My Tasks", description: "Track work items and progress", icon: CheckSquare, color: "from-[#ec4899] to-[#be185d]", shadow: "shadow-[#ec4899]/20", href: "/tasks" },
    { title: "Notebook", description: "Write, search and share notes", icon: BookOpen, color: "from-[#10b981] to-[#047857]", shadow: "shadow-[#10b981]/20", href: "/spaces" },
    { title: "History", description: "Work timeline, syncs & milestones", icon: Activity, color: "from-[#3b82f6] to-[#1d4ed8]", shadow: "shadow-[#3b82f6]/20", href: "/history" },
    { title: "MCP & Settings", description: "Connect Claude Code & Cursor", icon: Terminal, color: "from-[#f59e0b] to-[#b45309]", shadow: "shadow-[#f59e0b]/20", href: "/settings" },
  ];

  const taskTotal  = stats?.tasks.total ?? 0;
  const taskDone   = stats?.tasks.done  ?? 0;
  const taskActive = (stats?.tasks.todo ?? 0) + (stats?.tasks.in_progress ?? 0);

  const workspaceStats = [
    {
      label: "Tasks",
      value: statsLoading ? "—" : `${taskActive} Active`,
      sub: statsLoading ? "" : `${taskDone} done of ${taskTotal} total`,
      glowColor: "bg-[#22c55e]",
      textColor: "text-[#22c55e]",
      href: "/tasks",
    },
    {
      label: "Cowork Sessions",
      value: statsLoading ? "—" : String(stats?.coworkSessions ?? 0),
      sub: "AI memory sessions",
      glowColor: "bg-[#8b5cf6]",
      textColor: "text-[#8b5cf6]",
      href: "/cowork",
    },
    {
      label: "Notes",
      value: statsLoading ? "—" : String(stats?.notes ?? 0),
      sub: "Across all spaces",
      glowColor: "bg-[#3b82f6]",
      textColor: "text-[#3b82f6]",
      href: "/spaces",
    },
    {
      label: "History Entries",
      value: statsLoading ? "—" : String(stats?.recentHistory?.length ? "Syncing" : "0"),
      sub: "GitHub, Azure & manual",
      glowColor: "bg-[#ec4899]",
      textColor: "text-[#ec4899]",
      href: "/history",
    },
  ];

  const integrationHealth = stats ? [
    {
      name: "MCP Server",
      status: "connected",
      value: `${stats.integrations.mcpToolCount ?? "—"} tools · ${stats.integrations.mcpCallsThisWeek ?? 0} calls this week`,
      icon: Cpu,
      color: "text-[var(--success)]",
      dot: "bg-[var(--success)]",
    },
    {
      name: "Gemini AI",
      status: stats.integrations.gemini ? "connected" : "not configured",
      value: stats.integrations.gemini ? "Embeddings + chat ready" : "Add API key in Settings",
      icon: Sparkles,
      color: stats.integrations.gemini ? "text-[var(--success)]" : "text-[var(--warning)]",
      dot: stats.integrations.gemini ? "bg-[var(--success)]" : "bg-[var(--warning)]",
    },
    {
      name: "GitHub",
      status: stats.integrations.github ? "connected" : "disconnected",
      value: stats.integrations.github
        ? (stats.integrations.githubLastSync ? `Last sync ${timeAgo(stats.integrations.githubLastSync)}` : "Connected")
        : "Link token in Settings",
      icon: Github,
      color: stats.integrations.github ? "text-[var(--success)]" : "text-[var(--error)]",
      dot: stats.integrations.github ? "bg-[var(--success)]" : "bg-[var(--error)]",
    },
    {
      name: "Azure DevOps",
      status: stats.integrations.azure ? "connected" : "disconnected",
      value: stats.integrations.azure
        ? (stats.integrations.azureLastSync ? `Last sync ${timeAgo(stats.integrations.azureLastSync)}` : "Connected")
        : "Link token in Settings",
      icon: Database,
      color: stats.integrations.azure ? "text-[var(--success)]" : "text-[var(--error)]",
      dot: stats.integrations.azure ? "bg-[var(--success)]" : "bg-[var(--error)]",
    },
  ] : [];

  const categoryIcon: Record<string, React.ReactNode> = {
    standup:    <Clock size={14} className="text-[var(--accent)]" />,
    commit:     <GitBranch size={14} className="text-[#a855f7]" />,
    pr:         <GitBranch size={14} className="text-[#ec4899]" />,
    deploy:     <CheckSquare size={14} className="text-[var(--success)]" />,
    meeting:    <Activity size={14} className="text-[#3b82f6]" />,
    incident:   <Bell size={14} className="text-[var(--error)]" />,
    note:       <FileText size={14} className="text-[var(--warning)]" />,
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[var(--s0)] relative select-none">

      {/* ── BACKGROUND GLOWS ── */}
      <div className="dash-glow-purple absolute top-[-10%] left-[10%] w-[700px] h-[700px] rounded-full pointer-events-none blur-3xl" />
      <div className="dash-glow-pink absolute bottom-[5%] right-[5%] w-[600px] h-[600px] rounded-full pointer-events-none blur-3xl" />

      {/* ── HEADER ── */}
      <header className="h-[76px] border-b border-[var(--border-subtle)] flex items-center justify-between px-8 bg-[var(--s0)] backdrop-blur-md shrink-0 z-20 sticky top-0">
        <div className="flex-1 max-w-[420px]">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors" size={15} />
            <input
              type="text"
              placeholder="Search across all memory... ⌘K"
              className="w-full h-[38px] bg-[var(--s1)] border border-[var(--border-subtle)] focus:border-[rgba(var(--accent-rgb),0.5)] rounded-xl pl-10 pr-10 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:shadow-[0_0_15px_rgba(139,92,246,0.15)] transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <Link href="/notification" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] relative p-1.5 rounded-lg hover:bg-[var(--s2)] transition-colors">
            <Bell size={18} />
          </Link>
          <UserMenu />
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-8 py-8 flex flex-col gap-10 relative z-10">

        {/* ── HERO ── */}
        <section className="dash-hero relative rounded-3xl border p-8 overflow-hidden">
          <div className="dash-hero-grid absolute inset-0 bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="dash-hero-badge text-[11px] font-bold uppercase tracking-widest bg-[rgba(var(--accent-rgb),0.1)] px-2.5 py-1 rounded-full border border-[rgba(var(--accent-rgb),0.2)] text-[var(--accent)]">MEMORY HUB</span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--success)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                  Operium Active
                </span>
              </div>
              <h1 className="text-[28px] md:text-[34px] font-extrabold text-[var(--text-primary)] tracking-tight leading-tight">
                {greeting}, {userName}.
              </h1>
              <p className="text-[14px] text-[var(--text-secondary)] mt-2 max-w-[600px] leading-relaxed">
                Your persistent AI memory layer. Every decision, fix, and pattern your AI assistants learn — stored, searchable, and always ready.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 shrink-0">
              <Link
                href="/cowork"
                className="h-[42px] px-5 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#6366f1] text-white text-[13px] font-semibold shadow-[0_4px_16px_rgba(124,58,237,0.25)] hover:shadow-[0_4px_22px_rgba(124,58,237,0.45)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2"
              >
                <Bot size={16} />
                <span>Open Cowork</span>
              </Link>
              <Link
                href="/settings"
                className="dash-mcp-btn h-[42px] px-5 rounded-xl border border-[var(--border-default)] bg-[var(--s1)] hover:bg-[var(--s2)] text-[13px] font-semibold text-[var(--text-primary)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2"
              >
                <Cpu size={15} className="text-[var(--accent)]" />
                <span>MCP Setup</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ── QUICK ACTIONS ── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[14px] font-bold text-[var(--text-muted)] tracking-wider uppercase">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {quickLaunch.map((item, idx) => {
              const Icon = item.icon;
              return (
                <Link
                  key={idx}
                  href={item.href}
                  className="group bg-[var(--s1)] hover:bg-[var(--s2)] border border-[var(--border-subtle)] hover:border-[rgba(var(--accent-rgb),0.4)] rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(139,92,246,0.06)]"
                >
                  <div className="w-full h-full p-5 flex flex-col items-start justify-between min-h-[120px]">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${item.color} shadow-lg ${item.shadow} text-white transition-transform duration-300 group-hover:scale-110`}>
                      <Icon size={18} />
                    </div>
                    <div className="mt-4 w-full">
                      <h3 className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5 group-hover:text-[var(--accent)] transition-colors">
                        {item.title}
                        <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300 text-[var(--accent)]" />
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-1 leading-snug">{item.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── WORKSPACE METRICS ── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {workspaceStats.map((stat, idx) => (
            <Link key={idx} href={stat.href} className="block bg-[var(--s1)] border border-[var(--border-subtle)] rounded-2xl p-5 flex items-start gap-4 shadow-sm hover:border-[var(--border-default)] transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex flex-col flex-1">
                <span className="text-[11px] font-bold text-[var(--text-muted)] tracking-wider uppercase">{stat.label}</span>
                <div className="flex items-baseline gap-2 mt-2">
                  {statsLoading ? (
                    <Loader2 size={16} className="animate-spin text-[var(--text-muted)] mt-1" />
                  ) : (
                    <span className="text-[20px] font-extrabold text-[var(--text-primary)] tracking-tight">{stat.value}</span>
                  )}
                  <span className={`w-2 h-2 rounded-full ${stat.glowColor} animate-pulse`} />
                </div>
                <span className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{stat.sub}</span>
              </div>
            </Link>
          ))}
        </section>

        {/* ── RECENT ACTIVITY + INTEGRATIONS ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Recent Activity */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-[var(--text-muted)] tracking-wider uppercase">Recent Activity</h2>
              <Link href="/history" className="text-[12px] font-semibold text-[var(--accent)] hover:text-[var(--text-primary)] flex items-center gap-1.5 group transition-colors">
                <span>View all history</span>
                <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <div className="bg-[var(--s1)] border border-[var(--border-subtle)] rounded-2xl p-6 relative">
              {statsLoading ? (
                <div className="flex items-center justify-center gap-2 text-[var(--text-muted)] py-10">
                  <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                  <span className="text-[12px] font-mono">Loading activity…</span>
                </div>
              ) : stats?.recentHistory && stats.recentHistory.length > 0 ? (
                <>
                  <div className="absolute left-[37px] top-8 bottom-8 w-[1.5px] bg-[var(--border-subtle)]" />
                  <div className="flex flex-col gap-6 relative">
                    {stats.recentHistory.map((entry) => (
                      <div key={entry._id} className="flex items-start gap-4 relative z-10 group">
                        <div className="w-8 h-8 rounded-full bg-[var(--s1)] border border-[rgba(var(--accent-rgb),0.4)] text-[var(--accent)] flex items-center justify-center shrink-0">
                          {categoryIcon[entry.category] ?? <Activity size={13} className="text-[var(--accent)]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-4">
                            <h4 className="text-[13px] font-bold text-[var(--text-primary)] truncate">{entry.title}</h4>
                            <span className="text-[10px] text-[var(--text-muted)] shrink-0 font-medium">{timeAgo(entry.createdAt)}</span>
                          </div>
                          {entry.summary && (
                            <p className="text-[12px] text-[var(--text-secondary)] mt-1 line-clamp-1">{entry.summary}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--s2)] text-[var(--text-muted)] font-mono capitalize">
                              {entry.category}
                            </span>
                            {entry.isMilestone && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded border border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.1)] text-[#a78bfa] font-mono">
                                milestone
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Activity className="w-10 h-10 text-[var(--border-default)] mb-3" />
                  <p className="text-[13px] font-bold text-[var(--text-primary)] mb-1">No activity yet</p>
                  <p className="text-[11px] text-[var(--text-muted)] max-w-xs">
                    Sync GitHub or Azure DevOps in{" "}
                    <Link href="/history" className="text-[var(--accent)] hover:underline">History</Link>{" "}
                    to see your work timeline here.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Integration Health */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-[var(--text-muted)] tracking-wider uppercase">Integrations</h2>
              <Link href="/settings" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 hover:bg-[var(--s2)] rounded-lg">
                <RefreshCw size={14} />
              </Link>
            </div>

            <div className="bg-[var(--s1)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col gap-5">
              {statsLoading ? (
                <div className="flex items-center justify-center gap-2 text-[var(--text-muted)] py-4">
                  <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
                </div>
              ) : integrationHealth.map((api, idx) => {
                const Icon = api.icon;
                return (
                  <div key={idx} className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] last:border-0 pb-3.5 last:pb-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-[var(--s2)] border border-[var(--border-default)] flex items-center justify-center text-[var(--text-secondary)] shrink-0">
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{api.name}</h4>
                        <span className="text-[11px] text-[var(--text-muted)] truncate block">{api.value}</span>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${api.color} shrink-0`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${api.dot} animate-pulse`} />
                      <span className="capitalize">{api.status}</span>
                    </div>
                  </div>
                );
              })}

              <Link
                href="/settings"
                className="mt-1 w-full h-[34px] rounded-xl border border-[var(--border-default)] hover:border-[rgba(var(--accent-rgb),0.4)] bg-[var(--s2)] hover:bg-[var(--s2)] text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition-all"
              >
                <Cpu size={12} className="text-[var(--accent)]" />
                Manage Integrations
              </Link>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
