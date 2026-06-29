"use client";

import React, { useState } from "react";
import {
  GitBranch, GitCommit, GitPullRequest, GitMerge, Search, Filter,
  CheckCircle2, XCircle, Clock, ChevronRight, ExternalLink
} from "lucide-react";

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

export default function GitPage() {
  const [activeTab, setActiveTab] = useState<"commits" | "prs" | "branches">("commits");

  const branches = [
    { name: "main", status: "Active", commitsAhead: 0, commitsBehind: 0, lastCommit: "2 hours ago", author: "Nikita" },
    { name: "feature/auth-refactor", status: "In Progress", commitsAhead: 12, commitsBehind: 2, lastCommit: "45 mins ago", author: "Alex" },
    { name: "fix/sidebar-bug", status: "Stale", commitsAhead: 1, commitsBehind: 24, lastCommit: "3 days ago", author: "Sam" },
    { name: "chore/update-deps", status: "Active", commitsAhead: 3, commitsBehind: 1, lastCommit: "5 hours ago", author: "Dependabot" },
  ];

  const commits = [
    { sha: "a1b2c3d", message: "feat: implement git activity dashboard", author: "Nikita", time: "10 mins ago", type: "feat", files: 3 },
    { sha: "e4f5g6h", message: "fix: sidebar notification badge alignment", author: "Alex", time: "1 hour ago", type: "fix", files: 1 },
    { sha: "i7j8k9l", message: "refactor: extract TerminalComponent", author: "Sam", time: "3 hours ago", type: "refactor", files: 4 },
    { sha: "m1n2o3p", message: "docs: update README with new setup steps", author: "Nikita", time: "Yesterday", type: "docs", files: 1 },
    { sha: "q4r5s6t", message: "chore: bump Next.js to 14.2", author: "Dependabot", time: "2 days ago", type: "chore", files: 2 },
  ];

  const prs = [
    { id: 42, title: "Feature: Auth Refactor", branch: "feature/auth-refactor", status: "Open", checks: "passed", reviewer: "Sam", time: "2 hours ago" },
    { id: 41, title: "Fix: Sidebar Navigation Bug", branch: "fix/sidebar-bug", status: "Review Required", checks: "pending", reviewer: "Nikita", time: "1 day ago" },
    { id: 40, title: "Chore: Update Dependencies", branch: "chore/update-deps", status: "Merged", checks: "passed", reviewer: "Alex", time: "3 days ago" },
  ];

  const getBadgeColor = (type: string) => {
    switch (type) {
      case "feat": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "fix": return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      case "refactor": return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
      case "docs": return "bg-sky-500/10 text-sky-400 border-sky-500/20";
      case "chore": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      default: return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  };

  const heatmapData = Array.from({ length: 52 }, () =>
    Array.from({ length: 7 }, () => Math.floor(Math.random() * 5))
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#030303] text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.02]">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg">
            <GithubIcon className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">experia / operium</h1>
            <p className="text-sm text-gray-400">Git Activity & Insights</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search commits, branches..."
              className="bg-black border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500/50 w-64"
            />
          </div>
          <button className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors">
            <Filter className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Heatmap Section */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium flex items-center space-x-2">
              <GitCommit className="w-4 h-4 text-gray-400" />
              <span>Workspace Activity (Last 12 Months)</span>
            </h2>
            <span className="text-xs text-gray-500">432 commits</span>
          </div>
          <div className="flex space-x-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10">
            {heatmapData.map((week, i) => (
              <div key={i} className="flex flex-col space-y-1 shrink-0">
                {week.map((day, j) => (
                  <div
                    key={j}
                    className={`w-3 h-3 rounded-sm ${
                      day === 0 ? "bg-white/5" :
                      day === 1 ? "bg-indigo-500/20" :
                      day === 2 ? "bg-indigo-500/40" :
                      day === 3 ? "bg-indigo-500/60" :
                      "bg-indigo-500/80"
                    }`}
                    title={`${day} commits`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Multi-pane Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column: Commits Feed */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl flex overflow-hidden">
              <button
                onClick={() => setActiveTab("commits")}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "commits" ? "border-indigo-500 text-white bg-indigo-500/5" : "border-transparent text-gray-400 hover:text-gray-200"}`}
              >
                Recent Commits
              </button>
              <button
                onClick={() => setActiveTab("prs")}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "prs" ? "border-indigo-500 text-white bg-indigo-500/5" : "border-transparent text-gray-400 hover:text-gray-200"}`}
              >
                Pull Requests
              </button>
            </div>

            <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
              {activeTab === "commits" ? (
                <div className="divide-y divide-white/5">
                  {commits.map((commit, i) => (
                    <div key={i} className="p-4 hover:bg-white/[0.02] transition-colors group">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className="mt-1">
                            <GitCommit className="w-4 h-4 text-gray-500" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-gray-200">{commit.message}</span>
                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getBadgeColor(commit.type)}`}>
                                {commit.type}
                              </span>
                            </div>
                            <div className="flex items-center space-x-3 mt-1.5 text-xs text-gray-500">
                              <span className="flex items-center space-x-1">
                                <div className="w-4 h-4 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                                  {commit.author.charAt(0)}
                                </div>
                                <span>{commit.author}</span>
                              </span>
                              <span>•</span>
                              <span>committed {commit.time}</span>
                              <span>•</span>
                              <span className="text-gray-400">{commit.files} files changed</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="px-2 py-1 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded font-mono text-gray-400">
                            {commit.sha}
                          </button>
                          <button className="p-1 hover:text-indigo-400 transition-colors">
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {prs.map((pr, i) => (
                    <div key={i} className="p-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className="mt-1">
                            {pr.status === "Merged" ? (
                              <GitMerge className="w-5 h-5 text-purple-400" />
                            ) : (
                              <GitPullRequest className={`w-5 h-5 ${pr.status === "Open" ? "text-emerald-400" : "text-amber-400"}`} />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-gray-200">{pr.title}</span>
                              <span className="text-xs text-gray-500 font-mono">#{pr.id}</span>
                            </div>
                            <div className="flex items-center space-x-3 mt-1.5 text-xs text-gray-500">
                              <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded text-gray-400">{pr.branch}</span>
                              <span>•</span>
                              <span>opened {pr.time}</span>
                              <span>•</span>
                              <span>Reviewer: {pr.reviewer}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                          <span className={`text-xs px-2 py-1 rounded-full border ${
                            pr.status === "Merged" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                            pr.status === "Open" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}>
                            {pr.status}
                          </span>
                          {pr.checks === "passed" ? (
                            <div className="flex items-center space-x-1 text-xs text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Checks passed</span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1 text-xs text-amber-400">
                              <Clock className="w-3 h-3" />
                              <span>Checks pending</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Branches */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-300 px-1">Active Branches</h3>
            <div className="space-y-3">
              {branches.map((branch, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors group cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <GitBranch className="w-4 h-4 text-indigo-400" />
                      <span className="font-mono text-sm text-gray-200">{branch.name}</span>
                    </div>
                    {branch.name === "main" && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-white/10 text-white rounded">Default</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs mb-3">
                    <div className="flex space-x-3">
                      <span className="text-emerald-400 flex items-center" title="Commits ahead of main">
                        ↑ {branch.commitsAhead}
                      </span>
                      <span className="text-rose-400 flex items-center" title="Commits behind main">
                        ↓ {branch.commitsBehind}
                      </span>
                    </div>
                    <span className="text-gray-500">{branch.lastCommit}</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1">
                    <div className="flex items-center space-x-1.5">
                      <div className="w-5 h-5 bg-gradient-to-br from-gray-700 to-gray-600 rounded-full flex items-center justify-center text-[10px] text-white font-bold">
                        {branch.author.charAt(0)}
                      </div>
                      <span className="text-xs text-gray-400">{branch.author}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
