import mongoose from "mongoose";
import { User, WorkHistory } from "@operium/db";
import { workHistoryRepository } from "../repositories/workHistory.repository.js";
import { ApiError } from "../utils/ApiError.js";

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildFilter(userId: string, opts: HistoryQueryOpts) {
  const filter: Record<string, any> = { userId };

  if (opts.q) {
    filter.$text = { $search: opts.q };
  }
  if (opts.category) {
    filter.category = opts.category;
  }
  if (opts.source) {
    filter.source = opts.source;
  }
  if (opts.isMilestone) filter.isMilestone = true;
  if (opts.isBlocker)   filter.isBlocker   = true;
  if (opts.isImportant) filter.isImportant  = true;

  if (opts.startDate || opts.endDate) {
    filter.createdAt = {};
    if (opts.startDate) filter.createdAt.$gte = new Date(opts.startDate);
    if (opts.endDate)   filter.createdAt.$lte = new Date(opts.endDate);
  }

  return filter;
}

const FETCH_TIMEOUT_MS = 30_000;

function withTimeout(signal?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  // If a parent signal is already aborted, propagate
  signal?.addEventListener("abort", () => ctrl.abort());
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

function githubBasicHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Operium-App",
  };
}

async function ghFetch(url: string, token: string): Promise<any> {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch(url, { headers: githubBasicHeaders(token), signal });
    if (!res.ok) throw new ApiError(res.status, `GitHub API error: ${res.statusText}`);
    return res.json() as Promise<any>;
  } finally {
    clear();
  }
}

function azureBasicHeaders(token: string) {
  const b64 = Buffer.from(":" + token).toString("base64");
  return {
    Authorization: `Basic ${b64}`,
    "Content-Type": "application/json",
  };
}

async function azFetch(url: string, token: string): Promise<any> {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch(url, { headers: azureBasicHeaders(token), signal });
    if (!res.ok) throw new ApiError(res.status, `Azure API error: ${url} → ${res.statusText}`);
    return res.json() as Promise<any>;
  } finally {
    clear();
  }
}

// ─── types ───────────────────────────────────────────────────────────────────

interface HistoryQueryOpts {
  page: number;
  limit: number;
  q?: string;
  category?: string;
  source?: string;
  isMilestone?: boolean;
  isBlocker?: boolean;
  isImportant?: boolean;
  startDate?: string;
  endDate?: string;
}

// ─── service ─────────────────────────────────────────────────────────────────

export class HistoryService {
  // ── CRUD ──────────────────────────────────────────────────────────────────

  async getHistory(userId: string, opts: HistoryQueryOpts) {
    const filter = buildFilter(userId, opts);
    const skip   = (opts.page - 1) * opts.limit;

    const [items, total] = await Promise.all([
      workHistoryRepository.find(filter, { skip, limit: opts.limit }),
      workHistoryRepository.count(filter),
    ]);

    return {
      items,
      total,
      page:       opts.page,
      totalPages: Math.ceil(total / opts.limit),
    };
  }

  async createEntry(userId: string, data: any) {
    return workHistoryRepository.create({ ...data, userId, source: data.source || "manual" });
  }

  async updateEntry(id: string, userId: string, data: any) {
    const existing = await workHistoryRepository.findById(id, userId);
    if (!existing) throw new ApiError(404, "Entry not found");

    const user = await User.findById(userId).lean();
    const windowHours = (user as any)?.preferences?.editWindowHours ?? 48;
    const windowMs    = windowHours * 3600 * 1000;
    const created     = new Date((existing as any).createdAt).getTime();

    if (Date.now() - created > windowMs) {
      throw new ApiError(403, `Edit window of ${windowHours}h has expired`);
    }

    delete data.userId;
    delete data.externalId;
    delete data.source;

    const updated = await workHistoryRepository.updateById(id, userId, data);
    if (!updated) throw new ApiError(404, "Entry not found");
    return updated;
  }

  async deleteEntry(id: string, userId: string) {
    const existing = await workHistoryRepository.findById(id, userId);
    if (!existing) throw new ApiError(404, "Entry not found");

    const user = await User.findById(userId).lean();
    const windowHours = (user as any)?.preferences?.editWindowHours ?? 48;
    const windowMs    = windowHours * 3600 * 1000;
    const created     = new Date((existing as any).createdAt).getTime();

    if (Date.now() - created > windowMs) {
      throw new ApiError(403, `Delete window of ${windowHours}h has expired`);
    }

    return workHistoryRepository.deleteById(id, userId);
  }

  // ── Stats / live ──────────────────────────────────────────────────────────

  async getStats(userId: string, tzOffsetMinutes: number) {
    const now   = new Date();
    const since = new Date(now.getTime() - 182 * 24 * 3600 * 1000); // ~6 months ≈ 26 weeks
    const tzMs  = tzOffsetMinutes * 60 * 1000;

    const rows = await workHistoryRepository.aggregateStats(userId, since, tzMs);

    const map: Record<string, number> = {};
    for (const r of rows) map[r._id] = r.count;

    // Build a Sunday-aligned 112-cell grid (16 weeks × 7 days)
    const cells: { date: string; count: number; level: number }[] = [];
    const endDate  = new Date(now.getTime() - tzMs);
    // Roll back to the most recent Saturday so the grid ends on a full week
    const dayOfWeek = endDate.getDay();
    endDate.setDate(endDate.getDate() - dayOfWeek);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 111);

    for (let i = 0; i < 112; i++) {
      const d     = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key   = d.toISOString().slice(0, 10);
      const count = map[key] || 0;
      const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4;
      cells.push({ date: key, count, level });
    }

    const totalEntries = await workHistoryRepository.count({ userId });

    return { cells, totalEntries };
  }

  async getLiveItems(userId: string) {
    return workHistoryRepository.findActiveItems(userId);
  }

  // ── GitHub sync ───────────────────────────────────────────────────────────

  async syncGithub(userId: string, days: number) {
    const user = await User.findById(userId).select("+githubToken").lean() as any;
    if (!user?.githubToken) throw new ApiError(400, "GitHub token not configured");

    if (user.githubLastSync) {
      const elapsed = Date.now() - new Date(user.githubLastSync).getTime();
      if (elapsed < COOLDOWN_MS) {
        const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        throw new ApiError(429, `Please wait ${waitSec}s before syncing again`);
      }
    }

    const token  = user.githubToken as string;
    const cutoff = Date.now() - days * 86400 * 1000;

    // Resolve login
    const ghUser = await ghFetch("https://api.github.com/user", token);
    const login  = ghUser.login as string;

    // Fetch up to 3 pages of events
    const events: any[] = [];
    for (let page = 1; page <= 3; page++) {
      const batch: any[] = await ghFetch(
        `https://api.github.com/users/${login}/events?per_page=100&page=${page}`,
        token
      );
      if (!batch.length) break;
      const relevant = batch.filter((e: any) => new Date(e.created_at).getTime() >= cutoff);
      events.push(...relevant);
      if (relevant.length < batch.length) break; // hit the date cutoff
    }

    let upserted = 0;
    for (const ev of events) {
      if (ev.type === "PushEvent") {
        const commits: any[] = ev.payload?.commits || [];
        const msg    = commits.map((c: any) => c.message).join("; ");
        const repo   = ev.repo?.name || "";
        await workHistoryRepository.upsertByExternalId(userId, `github-${ev.id}`, {
          userId:   new mongoose.Types.ObjectId(userId),
          externalId: `github-${ev.id}`,
          title:    `Pushed to ${repo}`,
          description: msg || undefined,
          category: "Coding",
          type:     "simple",
          source:   "git",
          isMilestone: false, isBlocker: false, isImportant: false, isOngoing: false,
          metadata: {
            repo:  repo.split("/")[1] ?? repo,
            project: repo.split("/")[0] ?? "",
          },
          createdAt: new Date(ev.created_at),
        });
        upserted++;
      } else if (ev.type === "PullRequestEvent") {
        const pr     = ev.payload?.pull_request;
        const action = ev.payload?.action;
        if (!pr || !["opened", "closed", "reopened"].includes(action)) continue;

        const isMerged  = action === "closed" && pr.merged;
        const prStatus  = isMerged ? "completed" : action === "closed" ? "abandoned" : "active";
        const category  = isMerged ? "PR Review" : "Coding";
        const source    = isMerged ? "pr" : "git";

        await workHistoryRepository.upsertByExternalId(userId, `github-${ev.id}`,
          {
            userId:     new mongoose.Types.ObjectId(userId),
            externalId: `github-${ev.id}`,
            title:      pr.title || `Pull Request #${pr.number}`,
            description: pr.body?.slice(0, 500) || undefined,
            category,
            type:     "simple",
            source,
            isMilestone: isMerged, isBlocker: false, isImportant: false, isOngoing: prStatus === "active",
            metadata: {
              prLink:       pr.html_url,
              prStatus,
              prId:         String(pr.number),
              sourceBranch: pr.head?.ref,
              targetBranch: pr.base?.ref,
              repo:         ev.repo?.name?.split("/")[1] ?? "",
              project:      ev.repo?.name?.split("/")[0] ?? "",
            },
            createdAt: new Date(ev.created_at),
          },
          // On re-encountering an existing PR event, refresh its status
          {
            isOngoing: prStatus === "active",
            "metadata.prStatus": prStatus,
          }
        );
        upserted++;
      }
    }

    await User.updateOne({ _id: userId }, { githubLastSync: new Date() });
    return { synced: upserted, login };
  }

  // ── Azure DevOps sync ─────────────────────────────────────────────────────

  async syncAzure(userId: string, days: number) {
    const user = await User.findById(userId).select("+azureDevOpsToken").lean() as any;
    if (!user?.azureDevOpsToken) throw new ApiError(400, "Azure DevOps token not configured");
    if (!user?.azureDevOpsOrg)   throw new ApiError(400, "Azure DevOps organisation not configured");

    if (user.azureLastSync) {
      const elapsed = Date.now() - new Date(user.azureLastSync).getTime();
      if (elapsed < COOLDOWN_MS) {
        const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        throw new ApiError(429, `Please wait ${waitSec}s before syncing again`);
      }
    }

    const token   = user.azureDevOpsToken as string;
    const org     = user.azureDevOpsOrg   as string;
    const cutoff  = new Date(Date.now() - days * 86400 * 1000).toISOString();
    const API_VER = "api-version=7.1-preview.1";

    // Validate token
    await azFetch(`https://dev.azure.com/${org}/_apis/connectiondata`, token);

    // List projects
    const projectsData = await azFetch(
      `https://dev.azure.com/${org}/_apis/projects?$top=20&${API_VER}`,
      token
    );
    const projects: any[] = projectsData.value || [];

    let upserted = 0;

    for (const project of projects) {
      const pName = project.name as string;

      // Repos → pushes + PRs
      const reposData = await azFetch(
        `https://dev.azure.com/${org}/${pName}/_apis/git/repositories?${API_VER}`,
        token
      );
      const repos: any[] = reposData.value || [];

      for (const repo of repos) {
        const rName = repo.name as string;
        const rId   = repo.id   as string;

        // Pushes
        try {
          const pushesData = await azFetch(
            `https://dev.azure.com/${org}/${pName}/_apis/git/repositories/${rId}/pushes?searchCriteria.fromDate=${cutoff}&$top=50&${API_VER}`,
            token
          );
          for (const push of (pushesData.value || [])) {
            const contributors: string[] = (push.commits || []).map((c: any) => c.author?.name).filter(Boolean);
            const msgs                   = (push.commits || []).map((c: any) => c.comment).filter(Boolean).join("; ");
            await workHistoryRepository.upsertByExternalId(userId, `az-push-${push.pushId}`, {
              userId:     new mongoose.Types.ObjectId(userId),
              externalId: `az-push-${push.pushId}`,
              title:      `Pushed to ${rName}`,
              description: msgs || undefined,
              category:   "Coding",
              type:       "simple",
              source:     "git",
              isMilestone: false, isBlocker: false, isImportant: false, isOngoing: false,
              metadata:   {
                pushLink:    push._links?.web?.href,
                project:     pName,
                repo:        rName,
                repoId:      rId,
                contributors,
              },
              createdAt: new Date(push.date),
            });
            upserted++;
          }
        } catch { /* skip repos the token can't access */ }

        // Pull Requests
        try {
          const prsData = await azFetch(
            `https://dev.azure.com/${org}/${pName}/_apis/git/repositories/${rId}/pullrequests?searchCriteria.status=all&$top=50&${API_VER}`,
            token
          );
          for (const pr of (prsData.value || [])) {
            if (new Date(pr.creationDate).getTime() < new Date(cutoff).getTime()) continue;

            const prStatus = pr.status === "completed" ? "completed"
                           : pr.status === "abandoned" ? "abandoned"
                           : "active";
            const isMerged = pr.status === "completed";
            const reviewers = (pr.reviewers || []).map((r: any) => ({
              name:       r.displayName,
              vote:       r.vote,
              isRequired: !!r.isRequired,
            }));

            await workHistoryRepository.upsertByExternalId(userId, `az-pr-${pr.pullRequestId}`,
              {
                userId:     new mongoose.Types.ObjectId(userId),
                externalId: `az-pr-${pr.pullRequestId}`,
                title:      pr.title,
                description: pr.description?.slice(0, 500) || undefined,
                category:   "PR Review",
                type:       "simple",
                source:     "pr",
                isMilestone: isMerged, isBlocker: false, isImportant: false, isOngoing: prStatus === "active",
                metadata:   {
                  prLink:       pr._links?.web?.href,
                  prStatus,
                  prId:         String(pr.pullRequestId),
                  sourceBranch: pr.sourceRefName?.replace("refs/heads/", ""),
                  targetBranch: pr.targetRefName?.replace("refs/heads/", ""),
                  reviewers,
                  project:  pName,
                  repo:     rName,
                  repoId:   rId,
                },
                createdAt: new Date(pr.creationDate),
              },
              { isOngoing: prStatus === "active", "metadata.prStatus": prStatus, "metadata.reviewers": reviewers }
            );
            upserted++;
          }
        } catch { /* skip */ }
      }

      // Builds per project
      try {
        const buildsData = await azFetch(
          `https://dev.azure.com/${org}/${pName}/_apis/build/builds?minTime=${cutoff}&$top=50&${API_VER}`,
          token
        );
        for (const build of (buildsData.value || [])) {
          const result = build.result || build.status;
          await workHistoryRepository.upsertByExternalId(userId, `az-build-${build.id}`,
            {
              userId:     new mongoose.Types.ObjectId(userId),
              externalId: `az-build-${build.id}`,
              title:      `Build #${build.buildNumber}: ${build.definition?.name || ""}`,
              category:   "Deployment",
              type:       "simple",
              source:     "build",
              isMilestone: result === "succeeded", isBlocker: result === "failed",
              isImportant: false, isOngoing: build.status === "inProgress",
              metadata: {
                isBuild:     true,
                buildLink:   build._links?.web?.href,
                result,
                buildStatus: build.status,
                project:     pName,
                repo:        build.repository?.name,
              },
              createdAt: new Date(build.startTime || build.queueTime),
            },
            { isOngoing: build.status === "inProgress", "metadata.buildStatus": build.status, "metadata.result": result }
          );
          upserted++;
        }
      } catch { /* skip */ }
    }

    // Refresh stale active PRs (re-fetch individually to get latest status)
    const staleActive = await WorkHistory.find({
      userId,
      "metadata.prStatus": "active",
      externalId: { $regex: "^az-pr-" },
    }).lean();

    for (const item of staleActive) {
      const prId   = (item as any).externalId?.replace("az-pr-", "");
      const pName  = (item as any).metadata?.project;
      const rId    = (item as any).metadata?.repoId;
      if (!prId || !pName || !rId) continue;

      try {
        const pr = await azFetch(
          `https://dev.azure.com/${org}/${pName}/_apis/git/repositories/${rId}/pullrequests/${prId}?${API_VER}`,
          token
        );
        const prStatus = pr.status === "completed" ? "completed"
                       : pr.status === "abandoned" ? "abandoned"
                       : "active";
        if (prStatus !== "active") {
          await WorkHistory.updateOne(
            { _id: item._id },
            { "metadata.prStatus": prStatus, isOngoing: false, isMilestone: prStatus === "completed" }
          );
        }
      } catch { /* ignore */ }
    }

    const isFullSync = days >= 90;
    await User.updateOne(
      { _id: userId },
      {
        azureLastSync:          new Date(),
        ...(isFullSync ? {
          azureFullSyncCompleted: true,
          azureFullSyncDate:      new Date(),
        } : {}),
      }
    );

    return { synced: upserted, org, projects: projects.length };
  }

  // ── Custom integrations ───────────────────────────────────────────────────

  async getCustomIntegrations(userId: string) {
    const user = await User.findById(userId).lean() as any;
    if (!user) throw new ApiError(404, "User not found");
    return (user.customIntegrations || []).map((ci: any, i: number) => ({
      id:      ci._id?.toString() ?? String(i),
      name:    ci.name,
      url:     ci.url,
      method:  ci.method || "GET",
      isActive: true,
    }));
  }

  async saveCustomIntegrations(userId: string, integrations: Array<{ name: string; url: string; method?: string }>) {
    const docs = integrations.map(i => ({
      name:   i.name,
      url:    i.url,
      method: i.method || "GET",
    }));
    await User.updateOne({ _id: userId }, { customIntegrations: docs });
  }

  async syncCustom(userId: string) {
    const user = await User.findById(userId).lean() as any;
    if (!user) throw new ApiError(404, "User not found");
    const integrations: any[] = user.customIntegrations || [];
    if (!integrations.length) return { synced: 0, integrations: 0 };

    let upserted = 0;
    for (const integration of integrations) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        const fetchOpts: RequestInit = {
          method:  integration.method || "GET",
          signal:  controller.signal,
          headers: { "Content-Type": "application/json", ...(integration.headers ? Object.fromEntries(integration.headers) : {}) },
        };
        if (integration.body && integration.method !== "GET") {
          fetchOpts.body = integration.body;
        }
        const res = await fetch(integration.url, fetchOpts);
        clearTimeout(timer);
        if (!res.ok) continue;

        const data: any = await res.json();
        const mapping = integration.mapping || {};

        let items: any[] = [];
        if (mapping.arrayPath) {
          let cursor: any = data;
          for (const part of (mapping.arrayPath as string).split(".")) cursor = cursor?.[part];
          items = Array.isArray(cursor) ? cursor : [];
        } else if (Array.isArray(data)) {
          items = data;
        }

        const get = (obj: any, path?: string) => {
          if (!path) return undefined;
          let cur: any = obj;
          for (const p of path.split(".")) cur = cur?.[p];
          return cur;
        };

        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const rawTitle = get(item, mapping.titlePath);
          const title    = rawTitle ? String(rawTitle) : `${integration.name} #${idx + 1}`;
          const desc     = get(item, mapping.descriptionPath);
          const rawDate  = get(item, mapping.datePath);
          const createdAt = rawDate ? new Date(rawDate) : new Date();
          const category  = mapping.category || "Custom";

          const externalId = `custom-${integration.name}-${createdAt.getTime()}-${idx}`;
          await workHistoryRepository.upsertByExternalId(userId, externalId, {
            userId:     new mongoose.Types.ObjectId(userId),
            externalId,
            title,
            description: desc ? String(desc).slice(0, 500) : undefined,
            category,
            type:       "simple",
            source:     "custom",
            isMilestone: false, isBlocker: false, isImportant: false, isOngoing: false,
            metadata:   { integrationName: integration.name },
            createdAt,
          });
          upserted++;
        }
      } catch { /* skip failing integrations */ }
    }

    return { synced: upserted, integrations: integrations.length };
  }

  // ── Reset Azure ───────────────────────────────────────────────────────────

  async resetAzure(userId: string) {
    const result = await workHistoryRepository.deleteManyByExternalIdPrefix(userId, "az-");
    await User.updateOne(
      { _id: userId },
      {
        azureLastSync:          null,
        azureFullSyncCompleted: false,
        azureFullSyncDate:      null,
      }
    );
    return { deleted: result.deletedCount };
  }

  // ── Integrations ──────────────────────────────────────────────────────────

  async getIntegrations(userId: string) {
    const user = await User.findById(userId).select("+githubToken +azureDevOpsToken").lean() as any;
    if (!user) throw new ApiError(404, "User not found");
    return {
      githubConnected:   !!user.githubToken,
      azureConnected:    !!(user.azureDevOpsToken && user.azureDevOpsOrg),
      azureOrg:          user.azureDevOpsOrg || null,
      githubLastSync:    user.githubLastSync || null,
      azureLastSync:     user.azureLastSync  || null,
      githubFullSync:    user.githubFullSyncCompleted || false,
      azureFullSync:     user.azureFullSyncCompleted  || false,
      azureFullSyncDate: user.azureFullSyncDate || null,
      editWindowHours:   user.preferences?.editWindowHours ?? 48,
    };
  }

  async updateIntegrations(userId: string, data: {
    githubToken?:      string;
    azureDevOpsToken?: string;
    azureDevOpsOrg?:   string;
    editWindowHours?:  number;
  }) {
    const $set:   Record<string, any> = {};
    const $unset: Record<string, any> = {};

    if (data.githubToken !== undefined) {
      data.githubToken ? ($set.githubToken = data.githubToken) : ($unset.githubToken = "");
    }
    if (data.azureDevOpsToken !== undefined) {
      data.azureDevOpsToken ? ($set.azureDevOpsToken = data.azureDevOpsToken) : ($unset.azureDevOpsToken = "");
    }
    if (data.azureDevOpsOrg !== undefined) {
      $set.azureDevOpsOrg = data.azureDevOpsOrg;
    }
    if (data.editWindowHours !== undefined) {
      $set["preferences.editWindowHours"] = Number(data.editWindowHours);
    }

    const ops: Record<string, any> = {};
    if (Object.keys($set).length)   ops.$set   = $set;
    if (Object.keys($unset).length) ops.$unset = $unset;
    if (Object.keys(ops).length) await User.updateOne({ _id: userId }, ops);
  }
}

export const historyService = new HistoryService();
