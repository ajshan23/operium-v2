import mongoose from "mongoose";
import { User, WorkHistory } from "@operium/db";
import { workHistoryRepository } from "../repositories/workHistory.repository.js";
import { ApiError } from "../utils/ApiError.js";

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ─── helpers ─────────────────────────────────────────────────────────────────

// Custom-integration URLs are fetched server-side; block private/internal targets (SSRF).
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/, /^127\./, /^0\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
  /^::1$/, /^\[::1\]$/, /^f[cd]/i, /^fe80/i,
];

function assertSafeIntegrationUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, `Invalid integration URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError(400, "Integration URLs must use http or https");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST_PATTERNS.some(p => p.test(host))) {
    throw new ApiError(400, "Integration URL points to a private or internal address");
  }
}

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

// Like azFetch but also surfaces the paging continuation token Azure returns
// in a response header (used by the build-list endpoint).
async function azFetchWithHeaders(url: string, token: string): Promise<{ data: any; continuation: string }> {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch(url, { headers: azureBasicHeaders(token), signal });
    if (!res.ok) throw new ApiError(res.status, `Azure API error: ${url} → ${res.statusText}`);
    const continuation = res.headers.get("x-ms-continuationtoken") || "";
    const data = await res.json();
    return { data, continuation };
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
    const seenIds = new Set<string>();

    for (const ev of events) {
      if (ev.type === "PushEvent") {
        const commits: any[] = ev.payload?.commits || [];
        // Only include commits the user authored (merges pull in others' work)
        const own = commits.filter(
          (c: any) => c.author?.name === login || c.author?.email?.split("@")[0] === login
        );
        const msg  = (own.length ? own : commits.slice(0, 1)).map((c: any) => c.message).join("; ");
        const repo = ev.repo?.name || "";
        const eid  = `github-${ev.id}`;
        seenIds.add(eid);
        await workHistoryRepository.upsertByExternalId(userId, eid, {
          userId:   new mongoose.Types.ObjectId(userId),
          externalId: eid,
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

        // Only sync PRs the user authored — skip PRs the user merely
        // merged or closed for someone else
        if (pr.user?.login && pr.user.login !== login) continue;

        const isMerged  = action === "closed" && pr.merged;
        const prStatus  = isMerged ? "completed" : action === "closed" ? "abandoned" : "active";
        const category  = isMerged ? "PR Review" : "Coding";
        const source    = isMerged ? "pr" : "git";

        const eid = `github-${ev.id}`;
        seenIds.add(eid);
        await workHistoryRepository.upsertByExternalId(userId, eid,
          {
            userId:     new mongoose.Types.ObjectId(userId),
            externalId: eid,
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
              role:         "author", // GitHub sync only ingests the user's own PRs
              sourceBranch: pr.head?.ref,
              targetBranch: pr.base?.ref,
              repo:         ev.repo?.name?.split("/")[1] ?? "",
              project:      ev.repo?.name?.split("/")[0] ?? "",
            },
            createdAt: new Date(ev.created_at),
          },
          {
            isOngoing: prStatus === "active",
            "metadata.prStatus": prStatus,
          }
        );
        upserted++;
      }
    }

    // Reconcile: purge GitHub entries from earlier syncs that are within the
    // synced window but were NOT returned this time (foreign PRs the user
    // merged, or events from a different token).
    const ghCleanup = await WorkHistory.deleteMany({
      userId,
      externalId: { $regex: "^github-", $nin: [...seenIds] },
      createdAt: { $gte: new Date(cutoff) },
    });

    await User.updateOne({ _id: userId }, { githubLastSync: new Date() });
    return { synced: upserted, cleaned: ghCleanup.deletedCount ?? 0, login };
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

    const token      = user.azureDevOpsToken as string;
    const org        = user.azureDevOpsOrg   as string;
    const isFullSync = days >= 90;
    const cutoff     = new Date(Date.now() - days * 86400 * 1000).toISOString();
    const API_VER    = "api-version=7.0";
    const base       = `https://dev.azure.com/${encodeURIComponent(org)}`;

    // Validate token and resolve the authenticated user's identity so we only
    // sync their own activity, not the whole org's.
    const connData = await azFetch(`${base}/_apis/connectiondata`, token);
    const myId: string | undefined = connData?.authenticatedUser?.id;
    if (!myId) throw new ApiError(400, "Could not resolve Azure DevOps user identity");

    // List projects
    const projectsData = await azFetch(`${base}/_apis/projects?$top=20&${API_VER}`, token);
    const projects: any[] = projectsData.value || [];

    let created = 0;
    let updated = 0;

    for (const project of projects) {
      const pName = project.name as string;
      if (!pName) continue;

      // Repos → pushes + PRs
      try {
        const reposData = await azFetch(
          `${base}/${encodeURIComponent(pName)}/_apis/git/repositories?${API_VER}`,
          token
        );
        const repos: any[] = reposData.value || [];

        for (const repo of repos) {
          const rName = repo.name as string;
          const rId   = repo.id   as string;
          if (!rId) continue;

          // Pushes — immutable events, paginated on full sync
          try {
            let skip = 0;
            let more = true;
            while (more) {
              const pushesData = await azFetch(
                `${base}/${encodeURIComponent(pName)}/_apis/git/repositories/${rId}/pushes` +
                  `?searchCriteria.fromDate=${encodeURIComponent(cutoff)}` +
                  `&searchCriteria.pusherId=${encodeURIComponent(myId)}` +
                  `&$top=100&$skip=${skip}&${API_VER}`,
                token
              );
              const pushes: any[] = pushesData.value || [];
              for (const push of pushes) {
                if (!push.date) continue;
                const pushDate = new Date(push.date);
                if (isNaN(pushDate.getTime())) continue;

                const commits: any[] = push.commits || [];
                const description = commits.length
                  ? commits.map((c: any) => `- ${c?.comment || "Committed"}`).join("\n")
                  : undefined;
                const contributors: string[] = commits.map((c: any) => c.author?.name).filter(Boolean);

                const res = await workHistoryRepository.upsertByExternalId(userId, `az-push-${push.pushId}`, {
                  userId:      new mongoose.Types.ObjectId(userId),
                  externalId:  `az-push-${push.pushId}`,
                  title:       `Pushed to ${rName || "Repository"}`,
                  description,
                  category:    "Coding",
                  type:        "simple",
                  source:      "git",
                  isMilestone: false, isBlocker: false, isImportant: false, isOngoing: false,
                  metadata:    {
                    pushLink:     push._links?.web?.href,
                    project:      pName,
                    repo:         rName,
                    repoId:       rId,
                    contributors,
                  },
                  createdAt: pushDate,
                });
                if (res.upsertedCount) created++;
              }
              if (!isFullSync || pushes.length < 100 || skip > 2000) more = false;
              else skip += 100;
            }
          } catch { /* skip repos the token can't access */ }

          // Pull requests — the user's own PRs AND PRs they were asked to
          // review. Mutable: status / reviewers refresh on every sync.
          try {
            let skip = 0;
            let more = true;
            while (more) {
              const prsData = await azFetch(
                `${base}/${encodeURIComponent(pName)}/_apis/git/repositories/${rId}/pullrequests` +
                  `?searchCriteria.status=all&searchCriteria.minTime=${encodeURIComponent(cutoff)}` +
                  `&$top=100&$skip=${skip}&${API_VER}`,
                token
              );
              const prs: any[] = prsData.value || [];
              for (const pr of prs) {
                const isAuthor   = pr.createdBy?.id === myId;
                const myReview   = (pr.reviewers || []).find((r: any) => r?.id === myId);
                if (!isAuthor && !myReview) continue;
                if (!pr.creationDate) continue;
                const prDate = new Date(pr.creationDate);
                if (isNaN(prDate.getTime())) continue;

                const prStatus = pr.status === "completed" ? "completed"
                               : pr.status === "abandoned" ? "abandoned"
                               : "active";
                const isMerged  = pr.status === "completed";
                // The user's relationship to this PR. Author wins when both
                // (you can be a reviewer on your own PR in Azure).
                const role: "author" | "reviewer" = isAuthor ? "author" : "reviewer";
                const myVote: number = isAuthor ? 0 : (myReview?.vote ?? 0);
                const reviewers = (pr.reviewers || []).map((r: any) => ({
                  name:       r.displayName || r.uniqueName || "Unknown",
                  vote:       r.vote || 0,
                  isRequired: !!r.isRequired,
                }));

                const res = await workHistoryRepository.upsertByExternalId(userId, `az-pr-${pr.pullRequestId}`,
                  {
                    userId:      new mongoose.Types.ObjectId(userId),
                    externalId:  `az-pr-${pr.pullRequestId}`,
                    title:       (role === "reviewer" ? "Reviewed: " : "") + (pr.title || `Pull Request #${pr.pullRequestId}`),
                    description: pr.description?.slice(0, 500) || undefined,
                    category:    "PR Review",
                    type:        "simple",
                    source:      "pr",
                    // A merged PR is YOUR milestone only if you authored it
                    isMilestone: isMerged && isAuthor,
                    isBlocker: false, isImportant: false, isOngoing: prStatus === "active",
                    metadata:    {
                      prLink:       pr._links?.web?.href,
                      prStatus,
                      prId:         String(pr.pullRequestId),
                      role,
                      sourceBranch: pr.sourceRefName?.replace("refs/heads/", ""),
                      targetBranch: pr.targetRefName?.replace("refs/heads/", ""),
                      reviewers,
                      project:      pName,
                      repo:         rName,
                      repoId:       rId,
                    },
                    createdAt: prDate,
                  },
                  {
                    isOngoing: prStatus === "active",
                    isMilestone: isMerged && isAuthor,
                    "metadata.prStatus": prStatus,
                    "metadata.reviewers": reviewers,
                    // vote changes as the review progresses — keep it fresh
                    "metadata.myVote": myVote,
                  }
                );
                if (res.upsertedCount) created++;
                else if (res.modifiedCount) updated++;
              }
              if (!isFullSync || prs.length < 100 || skip > 1000) more = false;
              else skip += 100;
            }
          } catch { /* skip */ }
        }
      } catch { /* skip projects whose repos are inaccessible */ }

      // Builds per project — mutable (result changes as pipelines finish),
      // paginated via continuation token on full sync.
      try {
        let continuation = "";
        let more = true;
        while (more) {
          const { data: buildsData, continuation: nextToken } = await azFetchWithHeaders(
            `${base}/${encodeURIComponent(pName)}/_apis/build/builds` +
              `?minTime=${encodeURIComponent(cutoff)}` +
              `&requestedFor=${encodeURIComponent(myId)}` +
              `&$top=100${continuation ? `&continuationToken=${encodeURIComponent(continuation)}` : ""}&${API_VER}`,
            token
          );
          const builds: any[] = buildsData.value || [];
          for (const build of builds) {
            const requester = build.requestedFor || build.requestedBy;
            if (requester?.id && requester.id !== myId) continue;
            const rawDate = build.finishTime || build.startTime || build.queueTime;
            if (!rawDate) continue;
            const buildDate = new Date(rawDate);
            if (isNaN(buildDate.getTime())) continue;

            const result = build.result || build.status;
            const res = await workHistoryRepository.upsertByExternalId(userId, `az-build-${build.id}`,
              {
                userId:      new mongoose.Types.ObjectId(userId),
                externalId:  `az-build-${build.id}`,
                title:       `Build #${build.buildNumber}: ${build.definition?.name || ""}`,
                category:    "Deployment",
                type:        "simple",
                source:      "build",
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
                createdAt: buildDate,
              },
              {
                isOngoing: build.status === "inProgress",
                isMilestone: result === "succeeded",
                isBlocker: result === "failed",
                "metadata.buildStatus": build.status,
                "metadata.result": result,
              }
            );
            if (res.upsertedCount) created++;
            else if (res.modifiedCount) updated++;
          }
          if (!isFullSync || !nextToken) more = false;
          else continuation = nextToken;
        }
      } catch { /* skip */ }
    }

    // Refresh stale active PRs (re-fetch individually to get latest status).
    const staleActive = await WorkHistory.find({
      userId,
      "metadata.prStatus": "active",
      externalId: { $regex: "^az-pr-" },
    }).lean();

    for (const item of staleActive) {
      const prId  = (item as any).externalId?.replace("az-pr-", "");
      const pName = (item as any).metadata?.project;
      const rId   = (item as any).metadata?.repoId;
      if (!prId || !pName || !rId) continue;

      try {
        const pr = await azFetch(
          `${base}/${encodeURIComponent(pName)}/_apis/git/repositories/${rId}/pullrequests/${prId}?${API_VER}`,
          token
        );
        const prStatus = pr.status === "completed" ? "completed"
                       : pr.status === "abandoned" ? "abandoned"
                       : "active";
        if (prStatus !== "active") {
          const isAuthorEntry = (item as any).metadata?.role !== "reviewer";
          await WorkHistory.updateOne(
            { _id: item._id },
            { "metadata.prStatus": prStatus, isOngoing: false, isMilestone: prStatus === "completed" && isAuthorEntry }
          );
          updated++;
        }
      } catch { /* ignore */ }
    }

    await User.updateOne(
      { _id: userId },
      {
        azureLastSync: new Date(),
        ...(isFullSync ? {
          azureFullSyncCompleted: true,
          azureFullSyncDate:      new Date(),
        } : {}),
      }
    );

    return { synced: created + updated, created, updated, org, projects: projects.length };
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

  async saveCustomIntegrations(
    userId: string,
    integrations: Array<{
      name: string;
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      mapping?: { arrayPath?: string; titlePath?: string; descriptionPath?: string; datePath?: string; category?: string };
    }>
  ) {
    for (const i of integrations) assertSafeIntegrationUrl(i.url);
    const docs = integrations.map(i => ({
      name:    i.name,
      url:     i.url,
      method:  i.method || "GET",
      headers: i.headers,
      body:    i.body,
      mapping: i.mapping,
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
        assertSafeIntegrationUrl(integration.url);
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

  // ── Reset GitHub ──────────────────────────────────────────────────────────

  async resetGithub(userId: string) {
    const result = await workHistoryRepository.deleteManyByExternalIdPrefix(userId, "github-");
    await User.updateOne({ _id: userId }, { githubLastSync: null });
    return { deleted: result.deletedCount };
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
