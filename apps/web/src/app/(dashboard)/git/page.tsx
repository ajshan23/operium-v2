"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  GitBranch, GitCommit, GitPullRequest, GitMerge, Search,
  CheckCircle2, XCircle, Clock, ChevronRight, ExternalLink,
  RefreshCw, Loader2, AlertCircle, Settings, GitFork,
} from "lucide-react";
import { gitApi, type GitOverview, type GitProvider } from "@/api/git.api";

const GithubIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.02c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A4.8 4.8 0 0 0 8 18v4"></path>
  </svg>
);

const AzureIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M0 16.6l1.7-4.4 6.3 5.2-6.1 2.4V16.6zm2.2-5.9L9.6 1 13 4.3l-7.9 9.5-2.9-3.1zm5.8 9.5l7.7-2.1V5.3l4.3 1.3v11.2L8.6 24 4.3 20.6l3.7-.4z" />
  </svg>
);

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 30) return `${day} days ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon} month${mon === 1 ? "" : "s"} ago`;
  return `${Math.floor(mon / 12)} year${mon < 24 ? "" : "s"} ago`;
}

const ProviderBadge = ({ provider }: { provider: GitProvider }) => {
  if (provider === "github") {
    return (
      <span className="inline-flex items-center space-x-1 text-xs text-content-muted" title="GitHub">
        <GithubIcon className="w-3 h-3" />
        <span>GitHub</span>
      </span>
    );
  }
  if (provider === "azure") {
    return (
      <span className="inline-flex items-center space-x-1 text-xs text-status-info" title="Azure DevOps">
        <AzureIcon className="w-3 h-3" />
        <span>Azure</span>
      </span>
    );
  }
  return null;
};

export default function GitPage() {
  const [activeTab, setActiveTab] = useState<"commits" | "prs">("commits");
  const [providerFilter, setProviderFilter] = useState<"all" | "github" | "azure">("all");
  const [repoFilter, setRepoFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [data, setData] = useState<GitOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tz = -new Date().getTimezoneOffset();
      const res = await gitApi.getOverview({
        provider: providerFilter === "all" ? undefined : providerFilter,
        repo: repoFilter || undefined,
        q: debouncedSearch || undefined,
        tz,
      });
      setData(res.data);
    } catch (err: any) {
      setError(err.message || "Failed to load Git activity");
    } finally {
      setLoading(false);
    }
  }, [providerFilter, repoFilter, debouncedSearch]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await gitApi.sync(false);
      const parts: string[] = [];
      if (res.data.github && !res.data.github.error) parts.push(`GitHub: ${res.data.github.synced ?? 0}`);
      if (res.data.azure && !res.data.azure.error) parts.push(`Azure: ${res.data.azure.synced ?? 0}`);
      setSyncMessage(parts.length ? `Synced — ${parts.join(", ")}` : "Sync finished");
      await fetchOverview();
    } catch (err: any) {
      setSyncMessage(err.message || "Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 6000);
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case "feat": return "bg-status-success/10 text-status-success border-status-success/20";
      case "fix": return "bg-status-error/10 text-status-error border-status-error/20";
      case "refactor": return "bg-accent/10 text-accent-text border-accent/20";
      case "docs": return "bg-status-info/10 text-status-info border-status-info/20";
      case "chore": return "bg-status-warning/10 text-status-warning border-status-warning/20";
      case "test": return "bg-accent/10 text-accent-text border-accent/20";
      case "perf": return "bg-teal-500/10 text-teal-400 border-teal-500/20";
      default: return "bg-surface-raised text-content-muted border-line-subtle";
    }
  };

  const notConnected =
    !!data && !data.connections.githubConnected && !data.connections.azureConnected;

  // Build the heatmap as columns of 7 (one column per week)
  const heatmapWeeks = useMemo(() => {
    const cells = data?.heatmap.cells ?? [];
    const weeks: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [data?.heatmap.cells]);

  const lastSync = useMemo(() => {
    const dates = [data?.connections.githubLastSync, data?.connections.azureLastSync]
      .filter(Boolean)
      .map((d) => new Date(d as string).getTime());
    return dates.length ? new Date(Math.max(...dates)).toISOString() : null;
  }, [data?.connections.githubLastSync, data?.connections.azureLastSync]);

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-page text-content-primary overflow-hidden">
      {/* Header */}
      <header className="px-6 py-5 border-b border-line-subtle/70 flex items-center justify-between shrink-0 bg-surface-panel/60 gap-4 flex-wrap">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="p-2 bg-accent/10 rounded-lg shrink-0">
            <GitFork className="w-5 h-5 text-accent-text" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight truncate">
              {repoFilter || "Git Activity"}
            </h1>
            <p className="text-sm text-content-muted">
              {lastSync ? `Last synced ${relativeTime(lastSync)}` : "Commits, pull requests & branches"}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search commits, PRs..."
              className="bg-surface-panel border border-line-subtle rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-accent/50 w-56"
            />
          </div>

          {/* Provider filter */}
          <div className="flex items-center bg-surface-raised border border-line-subtle rounded-lg overflow-hidden text-xs">
            {(["all", "github", "azure"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setProviderFilter(p)}
                className={`px-3 py-2 capitalize transition-colors ${
                  providerFilter === p ? "bg-accent/20 text-content-primary" : "text-content-muted hover:text-content-secondary"
                }`}
              >
                {p === "all" ? "All" : p === "github" ? "GitHub" : "Azure"}
              </button>
            ))}
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center space-x-2 px-3 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/20 rounded-lg text-sm text-accent-text transition-colors disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>{syncing ? "Syncing..." : "Sync"}</span>
          </button>
        </div>
      </header>

      {syncMessage && (
        <div className="px-6 py-2 text-xs text-accent-text bg-accent/5 border-b border-line-subtle/70 shrink-0">
          {syncMessage}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {loading && !data ? (
          <div className="flex items-center justify-center h-64 text-content-muted">
            <Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading Git activity...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <AlertCircle className="w-8 h-8 text-status-error mb-3" />
            <p className="text-content-secondary">{error}</p>
            <button
              onClick={fetchOverview}
              className="mt-4 px-4 py-2 bg-surface-raised border border-line-subtle rounded-lg text-sm hover:bg-surface-hover"
            >
              Retry
            </button>
          </div>
        ) : notConnected ? (
          <div className="flex flex-col items-center justify-center h-64 text-center max-w-md mx-auto">
            <div className="p-3 bg-accent/10 rounded-xl mb-4">
              <GitFork className="w-7 h-7 text-accent-text" />
            </div>
            <h2 className="text-lg font-semibold mb-1">No Git provider connected</h2>
            <p className="text-sm text-content-muted mb-5">
              Connect a GitHub personal access token or Azure DevOps organisation to pull your
              commits, pull requests and branches into Operium.
            </p>
            <Link
              href="/settings"
              className="flex items-center space-x-2 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/20 rounded-lg text-sm text-accent-text"
            >
              <Settings className="w-4 h-4" />
              <span>Connect in Settings</span>
            </Link>
          </div>
        ) : data ? (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Commits", value: data.totals.commits, icon: GitCommit },
                { label: "Open PRs", value: data.totals.openPrs, icon: GitPullRequest },
                { label: "Merged PRs", value: data.totals.mergedPrs, icon: GitMerge },
                { label: "Repositories", value: data.totals.repos, icon: GitFork },
              ].map((s) => (
                <div key={s.label} className="bg-surface-raised border border-line-subtle rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-semibold">{s.value}</span>
                    <s.icon className="w-5 h-5 text-content-muted" />
                  </div>
                  <p className="text-xs text-content-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Heatmap Section */}
            <div className="bg-surface-raised border border-line-subtle rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium flex items-center space-x-2">
                  <GitCommit className="w-4 h-4 text-content-muted" />
                  <span>Activity (Last 12 Months)</span>
                </h2>
                <span className="text-xs text-content-muted">{data.heatmap.total} events</span>
              </div>
              <div className="flex space-x-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10">
                {heatmapWeeks.map((week, i) => (
                  <div key={i} className="flex flex-col space-y-1 shrink-0">
                    {week.map((day, j) => (
                      <div
                        key={j}
                        className={`w-3 h-3 rounded-sm ${
                          day.level === 0 ? "bg-surface-raised" :
                          day.level === 1 ? "bg-accent/20" :
                          day.level === 2 ? "bg-accent/40" :
                          day.level === 3 ? "bg-accent/60" :
                          "bg-accent/80"
                        }`}
                        title={`${day.count} event${day.count === 1 ? "" : "s"} on ${day.date}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-pane Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left Column: Commits / PRs Feed */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-surface-raised border border-line-subtle rounded-xl flex overflow-hidden">
                  <button
                    onClick={() => setActiveTab("commits")}
                    className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "commits" ? "border-accent text-content-primary bg-accent/5" : "border-transparent text-content-muted hover:text-content-secondary"}`}
                  >
                    Recent Commits ({data.totals.commits})
                  </button>
                  <button
                    onClick={() => setActiveTab("prs")}
                    className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "prs" ? "border-accent text-content-primary bg-accent/5" : "border-transparent text-content-muted hover:text-content-secondary"}`}
                  >
                    Pull Requests ({data.totals.prs})
                  </button>
                </div>

                <div className="bg-surface-panel border border-line-subtle rounded-xl overflow-hidden">
                  {activeTab === "commits" ? (
                    data.commits.length === 0 ? (
                      <div className="p-8 text-center text-sm text-content-muted">No commits found.</div>
                    ) : (
                      <div className="divide-y divide-line-subtle">
                        {data.commits.map((commit) => (
                          <div key={commit.id} className="p-4 hover:bg-surface-panel/60 transition-colors group">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start space-x-3 min-w-0">
                                <div className="mt-1 shrink-0">
                                  <GitCommit className="w-4 h-4 text-content-muted" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center space-x-2 flex-wrap">
                                    <span className="font-medium text-content-secondary break-words">{commit.message}</span>
                                    <span className={`text-xs uppercase font-bold px-2 py-0.5 rounded border ${getBadgeColor(commit.type)}`}>
                                      {commit.type}
                                    </span>
                                  </div>
                                  <div className="flex items-center space-x-3 mt-1.5 text-xs text-content-muted flex-wrap gap-y-1">
                                    <ProviderBadge provider={commit.provider} />
                                    {commit.repo && (
                                      <span className="font-mono bg-surface-raised px-1.5 py-0.5 rounded text-content-muted">{commit.repo}</span>
                                    )}
                                    {commit.author && (
                                      <>
                                        <span>•</span>
                                        <span>{commit.author}</span>
                                      </>
                                    )}
                                    <span>•</span>
                                    <span>{relativeTime(commit.createdAt)}</span>
                                    {commit.commits > 1 && (
                                      <>
                                        <span>•</span>
                                        <span className="text-content-muted">{commit.commits} commits</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {commit.url && (
                                <a
                                  href={commit.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 hover:text-accent-text transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    data.prs.length === 0 ? (
                      <div className="p-8 text-center text-sm text-content-muted">No pull requests found.</div>
                    ) : (
                      <div className="divide-y divide-line-subtle">
                        {data.prs.map((pr) => (
                          <div key={pr.id} className="p-4 hover:bg-surface-panel/60 transition-colors group">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start space-x-3 min-w-0">
                                <div className="mt-1 shrink-0">
                                  {pr.status === "Merged" ? (
                                    <GitMerge className="w-5 h-5 text-accent-text" />
                                  ) : pr.status === "Abandoned" ? (
                                    <XCircle className="w-5 h-5 text-status-error" />
                                  ) : (
                                    <GitPullRequest className="w-5 h-5 text-status-success" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center space-x-2 flex-wrap">
                                    <span className="font-medium text-content-secondary break-words">{pr.title}</span>
                                    {pr.prId && <span className="text-xs text-content-muted font-mono">#{pr.prId}</span>}
                                  </div>
                                  <div className="flex items-center space-x-3 mt-1.5 text-xs text-content-muted flex-wrap gap-y-1">
                                    <ProviderBadge provider={pr.provider} />
                                    {pr.repo && (
                                      <span className="font-mono bg-surface-raised px-1.5 py-0.5 rounded text-content-muted">{pr.repo}</span>
                                    )}
                                    {pr.branch && (
                                      <>
                                        <span>•</span>
                                        <span className="font-mono">{pr.branch} → {pr.targetBranch || "?"}</span>
                                      </>
                                    )}
                                    <span>•</span>
                                    <span>{relativeTime(pr.createdAt)}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col items-end space-y-2 shrink-0">
                                <span className={`text-xs px-2 py-1 rounded-full border ${
                                  pr.status === "Merged" ? "bg-accent/10 text-accent-text border-accent/20" :
                                  pr.status === "Abandoned" ? "bg-status-error/10 text-status-error border-status-error/20" :
                                  "bg-status-success/10 text-status-success border-status-success/20"
                                }`}>
                                  {pr.status}
                                </span>
                                {pr.reviewers.length > 0 ? (
                                  <div className="flex items-center space-x-1 text-xs text-content-muted" title={pr.reviewers.map(r => r.name).join(", ")}>
                                    {pr.approved > 0 ? (
                                      <CheckCircle2 className="w-3 h-3 text-status-success" />
                                    ) : (
                                      <Clock className="w-3 h-3 text-status-warning" />
                                    )}
                                    <span>{pr.approved}/{pr.reviewers.length} approved</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-content-muted">No reviewers</span>
                                )}
                                {pr.url && (
                                  <a
                                    href={pr.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-content-muted hover:text-accent-text flex items-center space-x-1"
                                  >
                                    <span>Open</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Right Column: Branches + Repos */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-content-secondary px-1">Saved Session Branches</h3>
                  {data.branches.length === 0 ? (
                    <p className="text-xs text-content-muted px-1">No branches have been registered by MCP sessions yet.</p>
                  ) : (
                    data.branches.slice(0, 12).map((branch, i) => (
                      <div key={`${branch.repo}-${branch.name}-${i}`} className="bg-surface-raised border border-line-subtle rounded-xl p-4 hover:border-line-strong transition-colors group">
                        <div className="flex items-center justify-between mb-3 gap-2">
                          <div className="flex items-center space-x-2 min-w-0">
                            <GitBranch className="w-4 h-4 text-accent-text shrink-0" />
                            <span className="font-mono text-sm text-content-secondary truncate" title={branch.name}>{branch.name}</span>
                          </div>
                          <span className="text-xs uppercase font-bold px-1.5 py-0.5 rounded shrink-0 bg-accent/10 text-accent-text">
                            {branch.outcome || "in progress"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs mb-3">
                          <div className="flex space-x-3">
                            <span className="text-status-success" title="Saved sessions">{branch.sessions} session{branch.sessions === 1 ? "" : "s"}</span>
                          </div>
                          <span className="text-content-muted">{relativeTime(branch.lastActivity)}</span>
                        </div>

                        <div className="flex items-center justify-between border-t border-line-subtle/70 pt-3 mt-1">
                          <div className="flex items-center space-x-2 min-w-0">
                            <ProviderBadge provider={branch.provider} />
                            {branch.repo && (
                              <span className="text-xs text-content-muted font-mono truncate" title={branch.latestTitle}>{branch.repo} · {branch.latestTitle}</span>
                            )}
                          </div>
                          <Link
                            href={`/cowork/${branch.latestSessionId}`}
                            aria-label={`Open latest saved session for ${branch.name}`}
                            className="text-content-muted hover:text-accent-text transition-colors shrink-0"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {data.repos.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-content-secondary px-1">Repositories</h3>
                    <div className="bg-surface-raised border border-line-subtle rounded-xl divide-y divide-line-subtle overflow-hidden">
                      <button
                        onClick={() => setRepoFilter("")}
                        className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between hover:bg-surface-hover/60 ${repoFilter === "" ? "text-accent-text" : "text-content-muted"}`}
                      >
                        <span>All repositories</span>
                      </button>
                      {data.repos.slice(0, 15).map((repo, i) => (
                        <button
                        key={repo.repoKey}
                          onClick={() => setRepoFilter(repo.repoKey === repoFilter ? "" : repo.repoKey)}
                          className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between hover:bg-surface-hover/60 ${repoFilter === repo.repoKey ? "bg-accent/10 text-accent-text" : "text-content-secondary"}`}
                        >
                          <span className="flex items-center space-x-2 min-w-0">
                            <ProviderBadge provider={repo.provider} />
                            <span className="font-mono truncate">{repo.name}</span>
                          </span>
                          <span className="text-content-muted shrink-0">{repo.commits + repo.prs}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
