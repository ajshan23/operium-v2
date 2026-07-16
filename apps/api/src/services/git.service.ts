import { WorkHistory } from "@operium/db";
import { historyService } from "./history.service.js";

// ─── types ───────────────────────────────────────────────────────────────────

export type GitProvider = "github" | "azure" | "other";

export interface GitOverviewOpts {
  provider?: "github" | "azure";
  repo?: string;
  q?: string;
  tzOffsetMinutes?: number;
}

interface CommitDTO {
  id:        string;
  message:   string;
  type:      string;          // conventional-commit type (feat/fix/…) or "commit"
  commits:   number;          // number of commits in the push
  repo:      string;
  project:   string;
  provider:  GitProvider;
  author:    string;
  url:       string;
  createdAt: string;
}

interface PullRequestDTO {
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
  approved:     number;        // reviewers who approved (vote >= 10, Azure scale)
  createdAt:    string;
}

interface BranchDTO {
  name:         string;
  repo:         string;
  project:      string;
  provider:     GitProvider;
  targetBranch: string;
  status:       "Open" | "Merged" | "Abandoned";
  openPrs:      number;
  totalPrs:     number;
  lastActivity: string;
}

interface RepoDTO {
  name:     string;
  project:  string;
  provider: GitProvider;
  commits:  number;
  prs:      number;
}

// ─── helpers ───────────────────────────────────────────────────────────────────

function providerOf(externalId?: string): GitProvider {
  if (!externalId) return "other";
  if (externalId.startsWith("github-")) return "github";
  if (externalId.startsWith("az-"))     return "azure";
  return "other";
}

const CONVENTIONAL = /^\s*(feat|fix|refactor|docs|chore|test|style|perf|build|ci|revert)\b/i;

function commitType(message: string): string {
  const m = message.match(CONVENTIONAL);
  return m && m[1] ? m[1].toLowerCase() : "commit";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapPrStatus(raw?: string): "Open" | "Merged" | "Abandoned" {
  if (raw === "completed") return "Merged";
  if (raw === "abandoned") return "Abandoned";
  return "Open";
}

// ─── service ─────────────────────────────────────────────────────────────────

export class GitService {
  /**
   * Aggregate the user's real Git activity (commits, pull requests, branches and
   * a contribution heatmap) from the synced WorkHistory, across GitHub and Azure
   * DevOps. Optionally filtered by provider, repository or a free-text query.
   */
  async getOverview(userId: string, opts: GitOverviewOpts) {
    // Use the string userId directly — Mongoose auto-casts it in .find() filters,
    // which avoids constructing an ObjectId (and the cross-package bson edge cases
    // that come with it).
    const match: Record<string, any> = {
      userId,
      source: { $in: ["git", "pr", "build"] },
    };

    if (opts.provider === "github") match.externalId = { $regex: "^github-" };
    if (opts.provider === "azure")  match.externalId = { $regex: "^az-" };
    if (opts.repo) match["metadata.repo"] = opts.repo;
    if (opts.q) {
      const rx = new RegExp(escapeRegex(opts.q), "i");
      match.$or = [{ title: rx }, { description: rx }];
    }

    // Pull a generous slice of recent git activity; per-user volume is modest.
    const docs = await WorkHistory.find(match).sort({ createdAt: -1 }).limit(500).lean();

    const commits: CommitDTO[] = [];
    const prs:     PullRequestDTO[] = [];
    const repoMap = new Map<string, RepoDTO>();
    const branchMap = new Map<string, BranchDTO & { _ts: number }>();

    for (const d of docs as any[]) {
      const provider = providerOf(d.externalId);
      const meta = d.metadata || {};
      const repo = meta.repo || meta.repoName || "";
      const project = meta.project || "";

      // repo rollup
      if (repo) {
        const key = `${provider}::${project}::${repo}`;
        const r = repoMap.get(key) || { name: repo, project, provider, commits: 0, prs: 0 };
        if (d.source === "git") r.commits++;
        if (d.source === "pr")  r.prs++;
        repoMap.set(key, r);
      }

      if (d.source === "git") {
        const rawMsg = (d.description || "").trim();
        const message = rawMsg || d.title || "Commit";
        const parts = rawMsg ? rawMsg.split(/;\s*/).filter(Boolean) : [];
        commits.push({
          id:        String(d._id),
          message:   parts[0] || message,
          type:      commitType(parts[0] || message),
          commits:   parts.length || 1,
          repo,
          project,
          provider,
          author:    (meta.contributors && meta.contributors[0]) || "",
          url:       meta.pushLink || "",
          createdAt: new Date(d.createdAt).toISOString(),
        });
      } else if (d.source === "pr") {
        const status = mapPrStatus(meta.prStatus);
        const reviewers = Array.isArray(meta.reviewers) ? meta.reviewers : [];
        const branch = meta.sourceBranch || "";
        prs.push({
          id:           String(d._id),
          prId:         meta.prId || "",
          title:        d.title,
          branch,
          targetBranch: meta.targetBranch || "",
          status,
          repo,
          project,
          provider,
          url:          meta.prLink || "",
          reviewers,
          approved:     reviewers.filter((r: any) => (r.vote ?? 0) >= 10).length,
          createdAt:    new Date(d.createdAt).toISOString(),
        });

        // branch rollup (feature branches that have PRs)
        if (branch) {
          const ts = new Date(d.createdAt).getTime();
          const key = `${provider}::${repo}::${branch}`;
          const existing = branchMap.get(key);
          if (!existing) {
            branchMap.set(key, {
              name: branch, repo, project, provider,
              targetBranch: meta.targetBranch || "",
              status,
              openPrs:  status === "Open" ? 1 : 0,
              totalPrs: 1,
              lastActivity: new Date(d.createdAt).toISOString(),
              _ts: ts,
            });
          } else {
            existing.totalPrs++;
            if (status === "Open") existing.openPrs++;
            if (ts > existing._ts) {
              existing._ts = ts;
              existing.lastActivity = new Date(d.createdAt).toISOString();
              existing.targetBranch = meta.targetBranch || existing.targetBranch;
              // Most-recent PR drives the displayed branch status.
              existing.status = status;
            }
          }
        }
      }
    }

    const branches = Array.from(branchMap.values())
      .sort((a, b) => b._ts - a._ts)
      .map(({ _ts, ...rest }) => rest);

    const repos = Array.from(repoMap.values()).sort(
      (a, b) => b.commits + b.prs - (a.commits + a.prs)
    );

    const heatmap = await this.getHeatmap(match, opts.tzOffsetMinutes ?? 0);

    const totals = {
      commits:   commits.length,
      prs:       prs.length,
      openPrs:   prs.filter((p) => p.status === "Open").length,
      mergedPrs: prs.filter((p) => p.status === "Merged").length,
      repos:     repos.length,
      branches:  branches.length,
    };

    const connections = await historyService.getIntegrations(userId);

    return {
      connections: {
        githubConnected: connections.githubConnected,
        azureConnected:  connections.azureConnected,
        azureOrg:        connections.azureOrg,
        githubLastSync:  connections.githubLastSync,
        azureLastSync:   connections.azureLastSync,
      },
      repos,
      commits: commits.slice(0, 60),
      prs:     prs.slice(0, 60),
      branches,
      heatmap,
      totals,
    };
  }

  /** Build a 52-week (Sunday-aligned) contribution grid from git activity. */
  private async getHeatmap(baseMatch: Record<string, any>, tzOffsetMinutes: number) {
    const now = new Date();
    const since = new Date(now.getTime() - 371 * 24 * 3600 * 1000); // 53 weeks
    const tzMs = tzOffsetMinutes * 60 * 1000;

    // Pull just the timestamps and bucket them in JS — keeps this off the
    // aggregation pipeline (which would require a manually-cast ObjectId).
    const rows = await WorkHistory.find({ ...baseMatch, createdAt: { $gte: since } })
      .select("createdAt")
      .lean();

    const map: Record<string, number> = {};
    for (const r of rows as any[]) {
      const key = new Date(new Date(r.createdAt).getTime() - tzMs).toISOString().slice(0, 10);
      map[key] = (map[key] || 0) + 1;
    }

    const endDate = new Date(now.getTime() - tzMs);
    endDate.setDate(endDate.getDate() - endDate.getDay()); // roll back to Sunday
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7 * 51); // 52 weeks total

    const cells: { date: string; count: number; level: number }[] = [];
    let total = 0;
    for (let i = 0; i < 52 * 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const count = map[key] || 0;
      total += count;
      const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4;
      cells.push({ date: key, count, level });
    }

    return { cells, total };
  }

  /**
   * Pull fresh activity from every connected provider. Per-provider failures
   * (missing token, cooldown, API error) are captured rather than thrown so a
   * single misconfigured provider never blocks the other.
   */
  async sync(userId: string, full: boolean) {
    const days = full ? 90 : 7;
    const results: Record<string, any> = {};

    try {
      results.github = await historyService.syncGithub(userId, days);
    } catch (err: any) {
      results.github = { error: err?.message || "GitHub sync failed" };
    }

    try {
      results.azure = await historyService.syncAzure(userId, full ? 90 : 3);
    } catch (err: any) {
      results.azure = { error: err?.message || "Azure DevOps sync failed" };
    }

    return results;
  }
}

export const gitService = new GitService();
