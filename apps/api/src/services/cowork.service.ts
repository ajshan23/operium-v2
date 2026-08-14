import mongoose from "mongoose";
import { CoworkSession, CoworkChunk, User } from "@operium/db";
import type { CoworkSource, CoworkIntent, CoworkOutcome } from "@operium/db";
import { normalizeRepoRefs, resolveCoworkShared, type RepoRef } from "@operium/core";
import { ApiError } from "../utils/ApiError.js";
import { aiService } from "./ai.service.js";
import { embeddingService, cosineSimilarity } from "./embedding.service.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListParams {
  scope?:  "team" | "personal";
  source?: string;
  tag?:    string;
  limit?:  number;
  page?:   number;
}

export interface CreateData {
  source:       CoworkSource;
  title:        string;
  summary:      string;
  tags?:        string[];
  isShared?:    boolean;
  intent?:      CoworkIntent;
  outcome?:     CoworkOutcome;
  filesTouched?:string[];
  languages?:   string[];
  repos?:       RepoRef[]; // every git repo the session touched
  branch?:      string;    // legacy single-repo fields — folded into repos
  commitSha?:   string;
  repoUrl?:     string;
  prUrl?:       string;
  chunks?:      string[];   // plain text segments
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// "Shared" visibility is bounded to the caller's active org — never global.
// Guard against a falsy orgId: mongoose silently DROPS undefined values from
// filters, so { isShared: true, orgId: undefined } would match every org's
// shared docs. A route missing requireTenantAccess must fail loudly here,
// not leak globally.
function buildScopeFilter(userId: string, orgId: string, scope?: string) {
  if (scope === "personal") return { userId };
  if (!orgId) throw new ApiError(400, "Organisation context required for shared scope");
  if (scope === "team")     return { isShared: true, orgId };
  // default: everything the user can see (own + shared within the org)
  return { $or: [{ userId }, { isShared: true, orgId }] };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class CoworkService {

  /** Small review payload for developers returning to work. No content is
   * generated here; it only surfaces sessions already saved by MCP. */
  async getResume(userId: string, _orgId: string) {
    const since = new Date(Date.now() - 21 * 86_400_000);
    const sessions = await CoworkSession.find({
      userId,
      updatedAt: { $gte: since },
      $or: [{ outcome: { $in: ["blocked", "partial"] } }, { outcome: { $exists: false } }],
    })
      .sort({ updatedAt: -1 }).limit(8).lean() as any[];

    const resume = sessions.map(s => ({
      ...this._normalize(s, userId),
      nextStep: this._nextStep(s.summary),
      private: !s.isShared,
    }));
    const stale = sessions.filter(s => Date.now() - new Date(s.updatedAt).getTime() > 3 * 86_400_000).length;
    const missingNextStep = sessions.filter(s => !this._nextStep(s.summary)).length;
    const missingRepo = sessions.filter(s => !(s.repos?.length || s.repoUrl)).length;
    return {
      sessions: resume,
      health: {
        active: sessions.length,
        stale,
        missingNextStep,
        missingRepo,
        private: sessions.filter(s => !s.isShared).length,
      },
    };
  }

  async list(userId: string, orgId: string, params: ListParams) {
    const limit  = Math.min(params.limit  ?? 20, 100);
    const page   = Math.max(params.page   ?? 1,  1);
    const skip   = (page - 1) * limit;

    const filter: any = buildScopeFilter(userId, orgId, params.scope);
    if (params.source) filter.source = params.source;
    if (params.tag)    filter.tags   = { $in: [params.tag] };

    const [sessions, total] = await Promise.all([
      CoworkSession.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name avatar")
        .lean(),
      CoworkSession.countDocuments(filter),
    ]);

    const normalized = sessions.map(s => this._normalize(s, userId));
    return { sessions: normalized, pagination: { total, page, pages: Math.ceil(total / limit) } };
  }

  private _nextStep(summary?: string): string | null {
    if (!summary) return null;
    const heading = summary.match(/^#{1,4}\s*(?:next(?:\s+steps?)?|todo|remaining)\b[^\n]*\n([\s\S]*?)(?=\n#{1,4}\s|$)/im);
    if (heading?.[1]?.trim()) return heading[1].trim().replace(/^[-*]\s*/m, "").slice(0, 180);
    const inline = summary.match(/\*\*Next[^*]*\*\*:?[\s]*([^\n]+)/i);
    return inline?.[1]?.trim().slice(0, 180) ?? null;
  }

  async search(userId: string, orgId: string, q: string, scope?: string, limit = 10) {
    if (!q?.trim()) throw new ApiError(400, "q is required");

    const scopeFilter = buildScopeFilter(userId, orgId, scope);
    const filter: any = { ...scopeFilter, $text: { $search: q } };

    const sessions = await CoworkSession.find(filter, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" } })
      .limit(Math.min(limit, 20))
      .populate("userId", "name avatar")
      .lean();

    return sessions.map(s => this._normalize(s, userId));
  }

  async getById(id: string, userId: string, orgId: string) {
    const session = await CoworkSession.findOne({
      _id: id,
      $or: [{ userId }, { isShared: true, orgId }],
    })
      .populate("userId", "name avatar")
      .lean();

    if (!session) throw new ApiError(404, "Session not found");

    // Return every chunk (checkpoints + summary), like v1. The summary overlaps
    // session.summary, but the web keeps the "Knowledge Chunks" list collapsed by
    // default so it doesn't read as a duplicate.
    const chunks = await CoworkChunk.find({ sessionId: id })
      .sort({ order: 1 })
      .lean();

    return { session: this._normalize(session, userId), chunks };
  }

  // ─── Per-repo sharing ─────────────────────────────────────────────────────
  // List the distinct git repos this user has cowork sessions in, each with its
  // current sharing state (explicit pref, else the global default).
  async listRepos(userId: string) {
    const user = await User.findById(userId).select("preferences coworkRepoPrefs").lean() as any;
    const defaultShared = user?.preferences?.shareCoworkByDefault !== false;
    const prefMap = new Map<string, boolean>((user?.coworkRepoPrefs ?? []).map((p: any) => [p.repoKey, p.shared]));

    const rows = await CoworkSession.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), "repos.0": { $exists: true } } },
      { $unwind: "$repos" },
      { $group: { _id: "$repos.repoKey", repoName: { $first: "$repos.repoName" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return rows.map((r: any) => ({
      repoKey:      r._id as string,
      repoName:     (r.repoName as string) ?? r._id,
      sessionCount: r.count as number,
      shared:       prefMap.has(r._id) ? prefMap.get(r._id)! : defaultShared,
    }));
  }

  // Set a repo's sharing preference AND re-apply it to every existing session
  // (and its chunks) that touches the repo. Multi-repo aware: a session is
  // shared only if all its repos are shared.
  async setRepoVisibility(userId: string, repoKey: string, shared: boolean) {
    if (!repoKey?.trim()) throw new ApiError(400, "repoKey is required");
    const user = await User.findById(userId).select("preferences coworkRepoPrefs") as any;
    if (!user) throw new ApiError(404, "User not found");
    const defaultShared = user.preferences?.shareCoworkByDefault !== false;

    const prefs: { repoKey: string; shared: boolean }[] = user.coworkRepoPrefs ?? [];
    const existing = prefs.find(p => p.repoKey === repoKey);
    if (existing) existing.shared = shared;
    else prefs.push({ repoKey, shared });
    user.coworkRepoPrefs = prefs;
    await user.save();

    const prefMap = new Map<string, boolean>(prefs.map(p => [p.repoKey, p.shared]));

    const sessions = await CoworkSession
      .find({ userId, "repos.repoKey": repoKey })
      .select("_id repos isShared").lean() as any[];

    const toShared: any[] = [], toPrivate: any[] = [];
    for (const s of sessions) {
      const keys = [...new Set((s.repos ?? []).map((r: any) => r.repoKey))] as string[];
      const newShared = keys.length ? keys.every(k => prefMap.get(k) ?? defaultShared) : defaultShared;
      if (newShared !== s.isShared) (newShared ? toShared : toPrivate).push(s._id);
    }

    const ops: Promise<any>[] = [];
    if (toShared.length) {
      ops.push(CoworkSession.updateMany({ _id: { $in: toShared } }, { $set: { isShared: true } }));
      ops.push(CoworkChunk.updateMany({ sessionId: { $in: toShared } }, { $set: { isShared: true } }));
    }
    if (toPrivate.length) {
      ops.push(CoworkSession.updateMany({ _id: { $in: toPrivate } }, { $set: { isShared: false } }));
      ops.push(CoworkChunk.updateMany({ sessionId: { $in: toPrivate } }, { $set: { isShared: false } }));
    }
    await Promise.all(ops);

    return { repoKey, shared, sessionsUpdated: toShared.length + toPrivate.length };
  }

  async getRelated(id: string, userId: string, orgId: string, limit = 5) {
    const source = await CoworkSession.findOne({
      _id: id,
      $or: [{ userId }, { isShared: true, orgId }],
    }).lean();

    if (!source) throw new ApiError(404, "Session not found");

    const conditions: any[] = [];
    if (source.tags?.length)        conditions.push({ tags:         { $in: source.tags } });
    if (source.filesTouched?.length) conditions.push({ filesTouched: { $in: source.filesTouched } });

    if (conditions.length === 0) return { related: [] };

    const candidates = await CoworkSession.find({
      _id: { $ne: id },
      $and: [
        { $or: [{ userId }, { isShared: true, orgId }] },
        { $or: conditions },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit * 3)
      .populate("userId", "name avatar")
      .lean();

    // Annotate with reason
    const related = candidates.slice(0, limit).map(s => {
      const reasons: string[] = [];
      const sharedTags = s.tags?.filter((t: string) => source.tags?.includes(t)) ?? [];
      const sharedFiles = s.filesTouched?.filter((f: string) => source.filesTouched?.includes(f)) ?? [];
      if (sharedTags.length)  reasons.push(`${sharedTags.length} shared tag${sharedTags.length > 1 ? "s" : ""}`);
      if (sharedFiles.length) reasons.push(`${sharedFiles.length} shared file${sharedFiles.length > 1 ? "s" : ""}`);
      return { ...this._normalize(s, userId), reasons };
    });

    return { related };
  }

  async create(userId: string, orgId: string, data: CreateData) {
    if (!data.source) throw new ApiError(400, "source is required");
    if (!data.title?.trim()) throw new ApiError(400, "title is required");
    if (!data.summary?.trim()) throw new ApiError(400, "summary is required");

    // Fold repos[] + legacy scalar fields into one normalized list; mirror
    // repos[0] back onto the legacy fields for old readers.
    const repoRefs: RepoRef[] = [...(data.repos ?? [])];
    if (data.repoUrl) {
      repoRefs.push({ repoUrl: data.repoUrl, branch: data.branch, commitSha: data.commitSha, prUrl: data.prUrl });
    }
    const repos = normalizeRepoRefs(repoRefs);
    const first = repos[0];

    // Sharing: explicit request wins; otherwise derive from per-repo prefs,
    // falling back to the user's global Settings preference for unlisted repos.
    let isShared = data.isShared;
    if (isShared === undefined) {
      const u = await User.findById(userId).select("preferences coworkRepoPrefs").lean() as any;
      const defaultShared = u?.preferences?.shareCoworkByDefault !== false;
      const keys = repos.length ? [...new Set(repos.map(r => r.repoKey))] : [];
      isShared = resolveCoworkShared(keys, u?.coworkRepoPrefs, defaultShared);
    }

    const session = await CoworkSession.create({
      userId,
      orgId,
      source:       data.source,
      title:        data.title,
      summary:      data.summary,
      tags:         data.tags         ?? [],
      isShared,
      intent:       data.intent,
      outcome:      data.outcome,
      filesTouched: data.filesTouched ?? [],
      languages:    data.languages    ?? [],
      repos,
      branch:       first?.branch    ?? data.branch,
      commitSha:    first?.commitSha ?? data.commitSha,
      repoUrl:      first?.repoUrl   ?? data.repoUrl,
      prUrl:        first?.prUrl     ?? data.prUrl,
    });

    // Create chunks if provided
    let chunks: any[] = [];
    if (data.chunks?.length) {
      chunks = await CoworkChunk.insertMany(
        data.chunks.map((text, i) => ({
          sessionId:     session._id,
          userId,
          orgId,
          isShared,
          order:         i,
          text,
          sessionTitle:  session.title,
          sessionSource: session.source,
          sessionIntent: session.intent,
          sessionOutcome:session.outcome,
          repoKeys:      repos.length ? [...new Set(repos.map(r => r.repoKey))] : undefined,
        }))
      );
    }

    return { session: session.toObject(), chunks };
  }

  async feedback(id: string, userId: string, orgId: string, helpful?: boolean) {
    const session = await CoworkSession.findOne({
      _id: id,
      $or: [{ userId }, { isShared: true, orgId }],
    });
    if (!session) throw new ApiError(404, "Session not found");

    session.useCount    += 1;
    session.lastUsedAt   = new Date();
    if (helpful === true)  session.helpfulCount    += 1;
    if (helpful === false) session.notHelpfulCount += 1;
    await session.save();

    return {
      useCount:        session.useCount,
      helpfulCount:    session.helpfulCount,
      notHelpfulCount: session.notHelpfulCount,
    };
  }

  async chat(userId: string, orgId: string, messages: { role: "user" | "model"; content: string }[], sessionId?: string) {
    // Fetch user's Gemini key
    const user = await User.findById(userId).select("geminiApiKey").lean() as any;
    if (!user?.geminiApiKey) {
      throw new ApiError(400, "No Gemini API key configured. Add one in Settings → Integrations.");
    }

    const query = messages[messages.length - 1]?.content ?? "";

    let context = "";
    if (sessionId) {
      // Session-scoped chat ("Ask AI about this session"): the session IS the
      // context — inline its summary and checkpoints verbatim. Never gate this
      // on embedding similarity: "summarize this" matches nothing semantically
      // and would leave the model blind to the very session it's asked about.
      const session = await CoworkSession.findOne({
        _id: sessionId,
        $or: [{ userId }, { isShared: true, orgId }],
      }).lean();
      if (!session) throw new ApiError(404, "Session not found");

      // Summary chunks duplicate session.summary — include checkpoints only
      const chunks = await CoworkChunk.find({ sessionId, kind: { $ne: "summary" } })
        .sort({ order: 1 }).select("text").lean();

      const CONTEXT_CAP = 24_000; // chars — comfortably within flash context
      let body =
        `# Session: ${session.title}\n` +
        [session.intent && `Intent: ${session.intent}`,
         session.outcome && `Outcome: ${session.outcome}`,
         session.repos?.length && `Repos: ${session.repos.map(r => `${r.repoName}${r.branch ? `@${r.branch}` : ""}`).join(", ")}`,
        ].filter(Boolean).join(" · ") + "\n" +
        (session.summary ? `\n## Summary\n${session.summary}\n` : "") +
        (session.filesTouched?.length ? `\n**Files touched:** ${session.filesTouched.join(", ")}\n` : "");
      for (const c of chunks) {
        if (body.length > CONTEXT_CAP) break;
        body += `\n## Checkpoint\n${c.text}\n`;
      }
      context = body.slice(0, CONTEXT_CAP);
    } else {
      // Global chat: semantic search across all visible memory
      try {
        const queryEmb = await embeddingService.embed(query, user.geminiApiKey).catch(() => null);
        const chunkFilter: any = { $or: [{ userId }, { isShared: true, orgId }] };

        const chunks = await CoworkChunk.find(chunkFilter)
          .sort({ createdAt: -1 }).limit(150)
          .select("text embedding sessionTitle sessionSource sessionIntent").lean();

        let topChunks: any[];
        if (queryEmb) {
          topChunks = chunks
            .filter(c => Array.isArray(c.embedding) && c.embedding.length > 0)
            .map(c => ({ ...c, _score: cosineSimilarity(queryEmb, c.embedding!) }))
            .filter(c => c._score > 0.55)
            .sort((a, b) => b._score - a._score)
            .slice(0, 8);
        } else {
          topChunks = chunks.slice(0, 8);
        }

        if (topChunks.length > 0) {
          context = topChunks.map((c, i) =>
            `[Memory ${i + 1} — ${c.sessionTitle}]\n${c.text.slice(0, 800)}`
          ).join("\n\n---\n\n");
        }
      } catch {
        // Continue without context if embedding fails
      }
    }

    const systemPrompt = sessionId
      ? "You are Operium AI, an expert coding assistant. The user is viewing the cowork session below and is asking about it. " +
        "Answer from the session content; be specific — cite files, decisions, and code from it. " +
        "If something isn't covered by the session, say so.\n\n" +
        `## Session Content\n\n${context}`
      : "You are Operium AI, an expert coding assistant with access to this team's persistent memory. " +
        "Answer questions based on the memory context below. Be specific and cite sessions when relevant. " +
        "If the memory context doesn't contain enough information, say so and answer from general knowledge.\n\n" +
        (context ? `## Memory Context\n\n${context}` : "## Memory Context\n\nNo relevant sessions found.");

    const reply = await aiService.chat(messages, systemPrompt, user.geminiApiKey);
    return { reply };
  }

  async delete(id: string, userId: string) {
    const session = await CoworkSession.findOneAndDelete({ _id: id, userId });
    if (!session) throw new ApiError(404, "Session not found or not yours to delete");
    await CoworkChunk.deleteMany({ sessionId: id });
    return { deleted: true };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _normalize(session: any, requestingUserId: string) {
    const { userId: userDoc, _id, ...rest } = session;
    return {
      ...rest,
      id:     _id.toString(),
      _id:    _id.toString(),
      isOwn:  (userDoc?._id ?? userDoc)?.toString() === requestingUserId,
      author: userDoc ? { name: userDoc.name ?? "Unknown", avatar: userDoc.avatar } : null,
      scope:  rest.isShared ? "team" : "personal",
    };
  }
}

export const coworkService = new CoworkService();
