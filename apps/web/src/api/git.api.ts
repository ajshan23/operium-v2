import { apiClient } from "./client";

export type GitProvider = "github" | "azure" | "other";

export interface GitCommit {
  id:        string;
  message:   string;
  type:      string;
  commits:   number;
  repo:      string;
  project:   string;
  provider:  GitProvider;
  author:    string;
  url:       string;
  createdAt: string;
}

export interface GitPullRequest {
  id:           string;
  prId:         string;
  title:        string;
  branch:       string;
  targetBranch: string;
  status:       "Open" | "Merged" | "Abandoned";
  repo:         string;
  project:      string;
  provider:     GitProvider;
  url:          string;
  reviewers:    Array<{ name: string; vote: number; isRequired: boolean }>;
  approved:     number;
  createdAt:    string;
}

export interface GitBranch {
  name:         string;
  repoKey:      string;
  repo:         string;
  project:      string;
  provider:     GitProvider;
  latestSessionId: string;
  latestTitle:  string;
  outcome?:     string;
  sessions:     number;
  lastActivity: string;
}

export interface GitRepo {
  repoKey:  string;
  name:     string;
  project:  string;
  provider: GitProvider;
  commits:  number;
  prs:      number;
}

export interface GitHeatmapCell {
  date:  string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface GitOverview {
  connections: {
    githubConnected: boolean;
    azureConnected:  boolean;
    azureOrg:        string | null;
    githubLastSync:  string | null;
    azureLastSync:   string | null;
  };
  repos:    GitRepo[];
  commits:  GitCommit[];
  prs:      GitPullRequest[];
  branches: GitBranch[];
  heatmap:  { cells: GitHeatmapCell[]; total: number };
  totals: {
    commits:   number;
    prs:       number;
    openPrs:   number;
    mergedPrs: number;
    repos:     number;
    branches:  number;
  };
}

export interface GitSyncResult {
  github?: { synced?: number; login?: string; error?: string };
  azure?:  { synced?: number; org?: string; projects?: number; error?: string };
}

export interface GitOverviewParams {
  provider?: "github" | "azure";
  repo?:     string;
  q?:        string;
  tz?:       number;
}

function buildQuery(params: Record<string, any>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const gitApi = {
  getOverview(params: GitOverviewParams = {}): Promise<{ data: GitOverview }> {
    return apiClient(`/api/git/overview${buildQuery(params)}`);
  },

  sync(full = false): Promise<{ data: GitSyncResult }> {
    return apiClient(`/api/git/sync${full ? "?full=true" : ""}`, { method: "POST" });
  },
};
