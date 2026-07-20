import { CoworkSession, CoworkChunk, User } from "@operium/db";
import type { CoworkSource, CoworkIntent, CoworkOutcome } from "@operium/db";
import { normalizeRepoRefs, type RepoRef } from "@operium/core";
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
function buildScopeFilter(userId: string, orgId: string, scope?: string) {
  if (scope === "personal") return { userId };
  if (scope === "team")     return { isShared: true, orgId };
  // default: everything the user can see (own + shared within the org)
  return { $or: [{ userId }, { isShared: true, orgId }] };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class CoworkService {

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

    const chunks = await CoworkChunk.find({ sessionId: id })
      .sort({ order: 1 })
      .lean();

    return { session: this._normalize(session, userId), chunks };
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

    const session = await CoworkSession.create({
      userId,
      orgId,
      source:       data.source,
      title:        data.title,
      summary:      data.summary,
      tags:         data.tags         ?? [],
      isShared:     data.isShared     ?? true,
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
          isShared:      data.isShared ?? true,
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
