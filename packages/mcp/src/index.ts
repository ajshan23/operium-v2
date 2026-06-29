import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { compositeScore } from "@operium/core";

/** Per-request context injected by the HTTP or stdio transport. */
export interface McpContext {
  userId: string;
  orgId: string | null;
  geminiKey?: string;
  /** Optional embedding function injected by the transport layer */
  embedFn?: (text: string) => Promise<number[]>;
}

// ── Query intelligence ────────────────────────────────────────────────────────

function parseQueryHints(
  query: string,
  explicit: { intent?: string; outcome?: string; days?: number; tags?: string[] },
): { intent?: string; outcome?: string; days?: number; tags: string[] } {
  const q = query.toLowerCase();
  const hints: { intent?: string; outcome?: string; days?: number; tags: string[] } = { tags: [] };

  if (!explicit.intent) {
    if (/\b(fix|fixed|bug|broke|crash|error|issue|debug)\b/.test(q)) hints.intent = "bug-fix";
    else if (/\b(feature|implement|add|built|build|create|ship)\b/.test(q)) hints.intent = "feature";
    else if (/\b(refactor|restructur|clean|reorganiz|migrat)\b/.test(q)) hints.intent = "refactor";
    else if (/\b(investigat|research|explor|look into|dig into)\b/.test(q)) hints.intent = "investigation";
    else if (/\b(plan|design|architect|proposal)\b/.test(q)) hints.intent = "planning";
    else if (/\b(review|pr review|code review)\b/.test(q)) hints.intent = "review";
    else if (/\b(doc|docs|document|readme|wiki)\b/.test(q)) hints.intent = "docs";
  }

  if (!explicit.outcome) {
    if (/\b(fix|fixed|solved|resolved)\b/.test(q)) hints.outcome = "fixed";
    else if (/\b(implement|implemented|shipped|built|done)\b/.test(q)) hints.outcome = "implemented";
    else if (/\b(block|blocked|stuck)\b/.test(q)) hints.outcome = "blocked";
  }

  if (!explicit.days) {
    if (/\b(today|this morning)\b/.test(q)) hints.days = 1;
    else if (/\byesterday\b/.test(q)) hints.days = 2;
    else if (/\b(recent|recently|last few days)\b/.test(q)) hints.days = 7;
    else if (/\b(this week|past week|last week)\b/.test(q)) hints.days = 7;
    else if (/\b(this month|past month|last month)\b/.test(q)) hints.days = 30;
    else { const m = q.match(/last (\d+) days?/); if (m) hints.days = parseInt(m[1]!, 10); }
  }

  const existingTags = new Set((explicit.tags || []).map(t => t.toLowerCase()));
  const patterns: [RegExp, string][] = [
    [/\b(auth|authentication|login|oauth|jwt|token|session)\b/, "auth"],
    [/\b(database|db|mongo|mongodb|postgres|sql|migration|schema)\b/, "database"],
    [/\b(api|endpoint|route|rest|graphql)\b/, "api"],
    [/\b(frontend|ui|ux|react|next|css|component)\b/, "frontend"],
    [/\b(backend|server|express|node|middleware)\b/, "backend"],
    [/\b(deploy|ci|cd|docker|k8s|pipeline)\b/, "deployment"],
    [/\b(test|testing|jest|vitest|e2e|unit)\b/, "testing"],
    [/\b(perf|performance|speed|latency|cache|optimization)\b/, "performance"],
    [/\b(security|xss|csrf|cors|injection|vulnerability)\b/, "security"],
    [/\b(websocket|realtime|sse|streaming)\b/, "realtime"],
    [/\b(search|vector|embedding|rag|ai|llm|gemini|openai)\b/, "ai"],
    [/\b(payment|stripe|billing|subscription)\b/, "payments"],
    [/\b(upload|file|s3|storage|image|media)\b/, "storage"],
    [/\b(mcp|cowork|tool|plugin)\b/, "mcp"],
  ];

  for (const [pattern, tag] of patterns) {
    if (pattern.test(q) && !existingTags.has(tag)) hints.tags.push(tag);
  }

  return hints;
}

// ── Text chunking ─────────────────────────────────────────────────────────────

function splitIntoChunks(text: string, maxLen = 1200, overlap = 150): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxLen, text.length);
    chunks.push(text.slice(start, end));
    start += maxLen - overlap;
  }
  return chunks;
}

// ── Cosine similarity (in-memory fallback for search without Atlas) ───────────

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na  += a[i]! * a[i]!;
    nb  += b[i]! * b[i]!;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

// ── Server factory ────────────────────────────────────────────────────────────

export function buildMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer({
    name: "operium",
    version: "1.0.0",
    description:
      "Operium — persistent secondary memory for AI coding assistants. " +
      "ALWAYS call get_startup_context at the START of every session to load your memory. " +
      "Use checkpoint_cowork/save_chat to save discoveries, save_rule for conventions, " +
      "recall_context/search for past work, and create_history for standup logs.",
  });

  // Lazy-load heavy deps at tool-call time so the module stays importable without DB.
  async function db() {
    const mod = await import("@operium/db");
    return mod;
  }

  async function embedText(text: string): Promise<number[] | null> {
    try {
      if (ctx.embedFn) return await ctx.embedFn(text.slice(0, 8000));
      return null;
    } catch {
      return null;
    }
  }

  // ── Utility: format dates ─────────────────────────────────────────────────

  function timeAgo(d: Date): string {
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // get_startup_context
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "get_startup_context",
    "CALL THIS FIRST at the start of every session. Returns your active rules/conventions, recent work history, and pending tasks so you start with full context.",
    {
      days: z.number().int().min(1).max(90).default(7).describe("How many days of history to include"),
    },
    async ({ days }) => {
      await db();
      const { WorkHistory, ContextRule, Task, CoworkSession } = await db();
      const uid = ctx.userId;
      const since = new Date(Date.now() - days * 86_400_000);

      const [rules, history, tasks, recentCowork] = await Promise.all([
        ContextRule.find({ userId: uid, isActive: true }).sort({ timesApplied: -1 }).limit(20).lean(),
        WorkHistory.find({ userId: uid, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(15).lean(),
        Task.find({ userId: uid, status: { $in: ["todo", "in_progress"] } }).sort({ priority: -1, createdAt: -1 }).limit(10).lean(),
        CoworkSession.find({ $or: [{ userId: uid }, { isShared: true }] })
          .sort({ createdAt: -1 }).limit(5).lean(),
      ]);

      const sections: string[] = [];

      if (rules.length > 0) {
        const ruleText = rules.map(r => `• [${r.category}] **${r.title}**: ${r.rule}`).join("\n");
        sections.push(`## Your Active Rules & Conventions (${rules.length})\n\n${ruleText}`);
      } else {
        sections.push("## Rules & Conventions\n\nNo rules saved yet. Use save_rule to capture coding conventions.");
      }

      if (tasks.length > 0) {
        const taskText = tasks.map(t => {
          const due = t.dueDate ? ` · due ${timeAgo(t.dueDate)}` : "";
          return `• [${t.status}] ${t.title} (${t.priority}${due})`;
        }).join("\n");
        sections.push(`## Pending Tasks (${tasks.length})\n\n${taskText}`);
      }

      if (history.length > 0) {
        const histText = history.map(h =>
          `• [${timeAgo(h.createdAt)}] **${h.title}** [${h.category}]${h.isMilestone ? " 🏆" : ""}${h.isBlocker ? " 🚫" : ""}`
        ).join("\n");
        sections.push(`## Recent Work History (last ${days}d)\n\n${histText}`);
      } else {
        sections.push(`## Recent Work History\n\nNo entries in the last ${days} days.`);
      }

      if (recentCowork.length > 0) {
        const cwText = recentCowork.map(s =>
          `• [${timeAgo(s.createdAt)}] **${s.title}** — ${s.summary?.slice(0, 100) ?? ""}${s.isShared ? " 🌐" : ""}`
        ).join("\n");
        sections.push(`## Recent Cowork Sessions\n\n${cwText}\n\nUse search or list_cowork to explore further.`);
      }

      sections.push("---\n**Tip**: Use recall_context(query) for semantic search across all your memory.");

      return { content: [{ type: "text" as const, text: sections.join("\n\n") }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // recall_context
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "recall_context",
    "Fast semantic search across cowork sessions, notes, and work history. Use when the user asks about past work, previous decisions, or wants context about a topic.",
    {
      query: z.string().min(1).describe("Natural language query — e.g. 'how did we fix the auth bug last week'"),
      days:  z.number().int().optional().describe("Limit to memories from the last N days"),
      limit: z.number().int().min(1).max(20).default(8).describe("Max results"),
    },
    async ({ query, days, limit }) => {
      const hints = parseQueryHints(query, { days });
      const effectiveDays = hints.days ?? days;
      const since = effectiveDays ? new Date(Date.now() - effectiveDays * 86_400_000) : undefined;

      const { CoworkChunk, CoworkSession, WorkHistory } = await db();
      const uid = ctx.userId;

      const queryEmbedding = await embedText(query);
      const sections: string[] = [];

      // ── Cowork search ─────────────────────────────────────
      const chunkFilter: any = { $or: [{ userId: uid }, { isShared: true }] };
      if (hints.intent) chunkFilter.sessionIntent = hints.intent;

      const chunks = await CoworkChunk.find(chunkFilter)
        .sort({ createdAt: -1 })
        .limit(200)
        .select("sessionId text sessionTitle sessionSource sessionIntent sessionOutcome embedding userId createdAt")
        .lean();

      let scoredChunks: any[];
      if (queryEmbedding) {
        scoredChunks = chunks
          .filter(c => Array.isArray(c.embedding) && c.embedding.length > 0)
          .map(c => ({ ...c, _sim: cosine(queryEmbedding, c.embedding!) }))
          .filter(c => c._sim > 0.6)
          .sort((a, b) => b._sim - a._sim)
          .slice(0, limit * 2);
      } else {
        // Fallback: text search
        const textResults = await CoworkChunk.find({
          ...chunkFilter,
          $text: { $search: query },
        }, { score: { $meta: "textScore" } })
          .sort({ score: { $meta: "textScore" } })
          .limit(limit * 2)
          .lean();
        scoredChunks = textResults;
      }

      if (scoredChunks.length > 0) {
        // Group by session
        const sessionMap = new Map<string, { sim: number; text: string; chunk: any }>();
        for (const c of scoredChunks) {
          const sid = c.sessionId.toString();
          if (!sessionMap.has(sid) || (c._sim ?? 0) > (sessionMap.get(sid)!.sim)) {
            sessionMap.set(sid, { sim: c._sim ?? 0, text: c.text, chunk: c });
          }
        }

        const sessionIds = [...sessionMap.keys()];
        const sessionFilter: any = { _id: { $in: sessionIds } };
        if (since) sessionFilter.createdAt = { $gte: since };

        const sessions = await CoworkSession.find(sessionFilter).lean();
        if (sessions.length > 0) {
          const scored = sessions.map(s => {
            const meta = sessionMap.get(s._id.toString())!;
            const score = compositeScore({
              relevance: meta.sim || 0.5,
              createdAt: s.createdAt,
              helpfulCount: s.helpfulCount,
              notHelpfulCount: s.notHelpfulCount,
              useCount: s.useCount,
            });
            return { s, score, meta };
          }).sort((a, b) => b.score - a.score).slice(0, limit);

          const text = scored.map(({ s, meta }, i) =>
            `### ${i + 1}. ${s.title}\n` +
            `🛠️ ${s.source} · 📅 ${timeAgo(s.createdAt)}` +
            (s.intent ? ` · 🎯 ${s.intent}` : "") +
            (s.outcome ? ` · ✅ ${s.outcome}` : "") + "\n" +
            `🏷️ ${s.tags?.length ? s.tags.join(", ") : "no tags"}\n` +
            `💬 ${meta.text.slice(0, 200)}...\n` +
            `→ get_cowork("${s._id}")`
          ).join("\n\n---\n\n");

          sections.push(`## Cowork Sessions (${scored.length})\n\n${text}`);
        }
      }

      // ── Work history search ───────────────────────────────
      const histFilter: any = { userId: uid };
      if (since) histFilter.createdAt = { $gte: since };
      if (hints.intent === "bug-fix") histFilter.category = "Debugging";
      if (hints.tags.includes("deployment")) histFilter.category = "Deployment";

      const histResults = await WorkHistory.find({ ...histFilter, $text: { $search: query } }, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .limit(5)
        .lean()
        .catch(() => []);

      if (histResults.length > 0) {
        const histText = histResults.map(h =>
          `• [${timeAgo(h.createdAt)}] **${h.title}** [${h.category}]${h.description ? `\n  ${h.description.slice(0, 150)}` : ""}`
        ).join("\n\n");
        sections.push(`## Work History (${histResults.length})\n\n${histText}`);
      }

      const hintNote = [hints.intent, hints.outcome, hints.days ? `last ${hints.days}d` : null, ...hints.tags]
        .filter(Boolean).join(" · ");

      if (sections.length === 0) {
        return { content: [{ type: "text" as const, text: `No results found for "${query}".${hintNote ? `\n\n🧠 Auto-detected: ${hintNote}` : ""}\n\nTry broader terms or use search() for full semantic search.` }] };
      }

      const footer = hintNote ? `\n\n---\n🧠 Auto-detected: ${hintNote}` : "";
      return { content: [{ type: "text" as const, text: sections.join("\n\n") + footer }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // search (full semantic search)
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "search",
    "Full semantic search across cowork sessions and notes. Generates embeddings and ranks by relevance + recency + helpfulness. Best for open-ended questions.",
    {
      query:        z.string().min(1),
      scope:        z.enum(["all", "cowork", "notes", "history"]).default("all"),
      intent:       z.string().optional().describe("Filter cowork by intent: bug-fix, feature, refactor, etc."),
      outcome:      z.string().optional().describe("Filter cowork by outcome: fixed, implemented, blocked, etc."),
      days:         z.number().int().optional().describe("Limit to last N days"),
      tags:         z.array(z.string()).optional(),
      limit:        z.number().int().min(1).max(20).default(8),
      includeSummary: z.boolean().default(false),
    },
    async ({ query, scope, intent, outcome, days, tags, limit, includeSummary }) => {
      const hints     = parseQueryHints(query, { intent, outcome, days, tags });
      const effIntent = intent ?? hints.intent;
      const effDays   = days ?? hints.days;
      const effTags   = [...(tags ?? []), ...hints.tags.filter(t => !(tags ?? []).includes(t))];
      const since     = effDays ? new Date(Date.now() - effDays * 86_400_000) : undefined;

      const { CoworkChunk, CoworkSession, NoteBlock, Note, WorkHistory } = await db();
      const uid = ctx.userId;
      const queryEmbedding = await embedText(query);
      const sections: string[] = [];

      // ── Cowork ───────────────────────────────────────────
      if (scope === "all" || scope === "cowork") {
        const chunkFilter: any = { $or: [{ userId: uid }, { isShared: true }] };
        if (effIntent) chunkFilter.sessionIntent = effIntent;
        if (outcome ?? hints.outcome) chunkFilter.sessionOutcome = outcome ?? hints.outcome;

        const chunks = await CoworkChunk.find(chunkFilter)
          .sort({ createdAt: -1 }).limit(300)
          .select("sessionId text sessionTitle embedding userId createdAt sessionIntent sessionOutcome")
          .lean();

        let ranked: any[];
        if (queryEmbedding) {
          ranked = chunks
            .filter(c => Array.isArray(c.embedding) && c.embedding.length > 0)
            .map(c => ({ ...c, _sim: cosine(queryEmbedding, c.embedding!) }))
            .filter(c => c._sim > 0.55)
            .sort((a, b) => b._sim - a._sim);
        } else {
          ranked = await CoworkChunk.find({ ...chunkFilter, $text: { $search: query } }, { score: { $meta: "textScore" } })
            .sort({ score: { $meta: "textScore" } }).limit(limit * 3).lean().catch(() => []);
        }

        const sessionMap = new Map<string, { sim: number; text: string }>();
        for (const c of ranked) {
          const sid = c.sessionId.toString();
          if (!sessionMap.has(sid) || (c._sim ?? 0) > sessionMap.get(sid)!.sim) {
            sessionMap.set(sid, { sim: c._sim ?? 0, text: c.text });
          }
        }

        const sessionFilter: any = { _id: { $in: [...sessionMap.keys()] } };
        if (since) sessionFilter.createdAt = { $gte: since };
        if (effTags.length) sessionFilter.tags = { $in: effTags };

        const sessions = await CoworkSession.find(sessionFilter).lean();
        if (sessions.length > 0) {
          const scored = sessions.map(s => {
            const meta = sessionMap.get(s._id.toString()) ?? { sim: 0.5, text: "" };
            return {
              s, meta,
              score: compositeScore({
                relevance: meta.sim,
                createdAt: s.createdAt,
                helpfulCount:    s.helpfulCount,
                notHelpfulCount: s.notHelpfulCount,
                useCount:        s.useCount,
              }),
            };
          }).sort((a, b) => b.score - a.score).slice(0, limit);

          const text = scored.map(({ s, meta }, i) =>
            `### ${i + 1}. ${s.title} (${(meta.sim * 100).toFixed(0)}% match)\n` +
            `🛠️ ${s.source} · 📅 ${timeAgo(s.createdAt)}` +
            (s.intent ? ` · 🎯 ${s.intent}` : "") +
            (s.outcome ? ` · ✅ ${s.outcome}` : "") + "\n" +
            (s.tags?.length ? `🏷️ ${s.tags.join(", ")}\n` : "") +
            `💬 ${meta.text.slice(0, 250)}...\n` +
            (includeSummary && s.summary ? `\n**Summary**: ${s.summary.slice(0, 500)}\n` : "") +
            `→ get_cowork("${s._id}")`
          ).join("\n\n---\n\n");

          sections.push(`## Cowork Sessions (${scored.length})\n\n${text}`);
        }
      }

      // ── Notes ─────────────────────────────────────────────
      if (scope === "all" || scope === "notes") {
        const blocks = await NoteBlock.find({ userId: uid })
          .sort({ createdAt: -1 }).limit(200)
          .select("noteId content").lean();

        let topBlocks: any[];
        if (queryEmbedding) {
          topBlocks = blocks
            .filter(b => b.content?.trim())
            .map(b => ({
              ...b,
              _sim: cosine(queryEmbedding, []),
            }))
            .slice(0, 5);
        } else {
          topBlocks = await NoteBlock.find({ userId: uid, $text: { $search: query } }, { score: { $meta: "textScore" } })
            .sort({ score: { $meta: "textScore" } }).limit(10)
            .select("noteId content").lean().catch(() => []);
        }

        if (topBlocks.length > 0) {
          const noteIds = [...new Set(topBlocks.map(b => b.noteId.toString()))];
          const notes   = await Note.find({ _id: { $in: noteIds }, userId: uid }).lean();
          const noteMap = new Map(notes.map(n => [n._id.toString(), n.title]));

          const text = noteIds.slice(0, 5).map(nid => {
            const title  = noteMap.get(nid) || "Untitled";
            const bBlocks = topBlocks.filter(b => b.noteId.toString() === nid).map(b => b.content);
            return `### 📝 "${title}"\n${bBlocks.join("\n\n").slice(0, 400)}\n→ get_note("${nid}")`;
          }).join("\n\n---\n\n");

          sections.push(`## Notes\n\n${text}`);
        }
      }

      // ── Work history ──────────────────────────────────────
      if (scope === "all" || scope === "history") {
        const histFilter: any = { userId: uid };
        if (since) histFilter.createdAt = { $gte: since };

        const hist = await WorkHistory.find({ ...histFilter, $text: { $search: query } }, { score: { $meta: "textScore" } })
          .sort({ score: { $meta: "textScore" } }).limit(5)
          .lean().catch(() => []);

        if (hist.length > 0) {
          const histText = hist.map(h =>
            `• [${timeAgo(h.createdAt)}] **${h.title}** [${h.category}]` +
            (h.description ? `\n  ${h.description.slice(0, 150)}` : "")
          ).join("\n\n");
          sections.push(`## Work History\n\n${histText}`);
        }
      }

      const footer = `\n\n---\n🧠 Query hints: ${[effIntent, hints.outcome, effDays ? `last ${effDays}d` : null, ...effTags].filter(Boolean).join(" · ") || "none"}`;

      if (sections.length === 0) {
        return { content: [{ type: "text" as const, text: `No results found for "${query}".${footer}` }] };
      }
      return { content: [{ type: "text" as const, text: sections.join("\n\n") + footer }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // create_history
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "create_history",
    "Log a new work history entry — meetings, PRs, deployments, debugging sessions, etc. Essential for standup summaries.",
    {
      title:       z.string().min(1).max(200),
      description: z.string().max(5000).default(""),
      category:    z.enum(["General","Meeting","PR Review","Daily Standup","Sales Meeting","Coding","Debugging","Design","Planning","Deployment","Wiki"]).default("General"),
      isMilestone: z.boolean().default(false),
      isBlocker:   z.boolean().default(false),
      isImportant: z.boolean().default(false),
    },
    async ({ title, description, category, isMilestone, isBlocker, isImportant }) => {
      const { WorkHistory } = await db();
      const entry = await WorkHistory.create({
        userId: ctx.userId,
        title, description, category,
        isMilestone, isBlocker, isImportant,
        source: "manual",
        type:   "simple",
      });
      return {
        content: [{
          type: "text" as const,
          text: `✅ History entry created.\n\nID: ${entry._id}\nTitle: ${title}\nCategory: ${category}${isMilestone ? "\n🏆 Marked as milestone" : ""}${isBlocker ? "\n🚫 Marked as blocker" : ""}`,
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // list_history
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "list_history",
    "List recent work history entries. Useful for standup summaries or reviewing what was done.",
    {
      days:        z.number().int().min(1).max(90).default(7),
      category:    z.string().optional(),
      isMilestone: z.boolean().optional(),
      isBlocker:   z.boolean().optional(),
      limit:       z.number().int().min(1).max(50).default(20),
    },
    async ({ days, category, isMilestone, isBlocker, limit }) => {
      const { WorkHistory } = await db();
      const since  = new Date(Date.now() - days * 86_400_000);
      const filter: any = { userId: ctx.userId, createdAt: { $gte: since } };
      if (category)    filter.category    = category;
      if (isMilestone) filter.isMilestone = true;
      if (isBlocker)   filter.isBlocker   = true;

      const entries = await WorkHistory.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
      if (entries.length === 0) {
        return { content: [{ type: "text" as const, text: `No history entries in the last ${days} days.` }] };
      }

      const text = entries.map(h =>
        `• [${timeAgo(h.createdAt)}] **${h.title}** [${h.category}]${h.isMilestone ? " 🏆" : ""}${h.isBlocker ? " 🚫" : ""}${h.description ? `\n  ${h.description.slice(0, 150)}` : ""}  [ID: ${h._id}]`
      ).join("\n\n");

      return { content: [{ type: "text" as const, text: `## Work History (last ${days}d — ${entries.length} entries)\n\n${text}` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // checkpoint_cowork  (incremental save during a session)
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "checkpoint_cowork",
    "Save an incremental finding, fix, or decision mid-session. Call this every 10–15 messages to preserve progress. At the end, call save_chat(sessionId) to finalize.",
    {
      source:       z.string().default("claude-code").describe("Tool or source: claude-code, cursor, system"),
      title:        z.string().min(1).max(200),
      finding:      z.string().min(1).describe("The finding, fix, or insight to save"),
      intent:       z.enum(["bug-fix","feature","refactor","investigation","planning","review","docs"]).optional(),
      outcome:      z.enum(["fixed","implemented","explored","blocked","abandoned","partial"]).optional(),
      tags:         z.array(z.string()).default([]),
      sessionId:    z.string().optional().describe("Pass previous sessionId to append chunks to that session"),
      filesTouched: z.array(z.string()).default([]),
      branch:       z.string().optional(),
      commitSha:    z.string().optional(),
      repoUrl:      z.string().optional(),
    },
    async ({ source, title, finding, intent, outcome, tags, sessionId, filesTouched, branch, commitSha, repoUrl }) => {
      const { CoworkSession, CoworkChunk } = await db();
      const uid = ctx.userId;

      let session: any;
      if (sessionId) {
        session = await CoworkSession.findOne({ _id: sessionId, userId: uid });
      }

      if (!session) {
        session = await CoworkSession.create({
          userId: uid,
          source: source as any,
          title,
          summary: finding.slice(0, 500),
          tags,
          isShared: true,
          intent, outcome,
          filesTouched, branch, commitSha, repoUrl,
        });
      } else {
        // Update metadata if new info
        const upd: any = { updatedAt: new Date() };
        if (intent && !session.intent)    upd.intent    = intent;
        if (outcome && !session.outcome)  upd.outcome   = outcome;
        if (filesTouched.length) upd.$addToSet = { filesTouched: { $each: filesTouched }, tags: { $each: tags } };
        await CoworkSession.updateOne({ _id: session._id }, upd);
      }

      // Chunk the finding
      const chunks = splitIntoChunks(finding);
      const existingCount = await CoworkChunk.countDocuments({ sessionId: session._id });
      const chunkDocs = chunks.map((text, i) => ({
        sessionId:     session._id,
        userId:        uid,
        isShared:      true,
        order:         existingCount + i,
        text,
        sessionTitle:  title,
        sessionSource: source,
        sessionIntent:  intent ?? session.intent,
        sessionOutcome: outcome ?? session.outcome,
        embeddingDirty: true,
      }));

      await CoworkChunk.insertMany(chunkDocs);

      // Async embedding — don't block response
      embedText(finding).then(async (emb) => {
        if (!emb) return;
        const ids = await CoworkChunk.find({ sessionId: session._id, embeddingDirty: true }).select("_id").limit(10).lean();
        for (const { _id } of ids) {
          await CoworkChunk.updateOne({ _id }, { embedding: emb, embeddingDirty: false });
        }
      }).catch(() => {});

      return {
        content: [{
          type: "text" as const,
          text: `✅ Checkpoint saved (${chunks.length} chunk${chunks.length > 1 ? "s" : ""}).\n\nSession ID: ${session._id}\nTitle: ${title}\n\n📦 Call save_chat(sessionId="${session._id}") at end of session to finalize with a polished summary.`,
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // save_chat  (finalize a session or save a whole conversation at once)
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "save_chat",
    "Save a complete conversation or finalize a checkpoint_cowork session with a polished summary. Call at the end of every session to persist what was accomplished.",
    {
      title:        z.string().min(1).max(200),
      summary:      z.string().min(1).describe("Comprehensive summary: what was asked, investigated, fixed, and any next steps"),
      source:       z.string().default("claude-code"),
      intent:       z.enum(["bug-fix","feature","refactor","investigation","planning","review","docs"]).optional(),
      outcome:      z.enum(["fixed","implemented","explored","blocked","abandoned","partial"]).optional(),
      tags:         z.array(z.string()).default([]),
      sessionId:    z.string().optional().describe("Pass sessionId from checkpoint_cowork to finalize that session"),
      filesTouched: z.array(z.string()).default([]),
      branch:       z.string().optional(),
      repoUrl:      z.string().optional(),
    },
    async ({ title, summary, source, intent, outcome, tags, sessionId, filesTouched, branch, repoUrl }) => {
      const { CoworkSession, CoworkChunk } = await db();
      const uid = ctx.userId;

      let session: any;
      if (sessionId) {
        session = await CoworkSession.findOneAndUpdate(
          { _id: sessionId, userId: uid },
          { title, summary, intent, outcome, $addToSet: { tags: { $each: tags }, filesTouched: { $each: filesTouched } }, branch, repoUrl },
          { new: true },
        );
      }

      if (!session) {
        session = await CoworkSession.create({
          userId: uid,
          source: source as any,
          title, summary, tags, isShared: true,
          intent, outcome, filesTouched, branch, repoUrl,
        });
        // Chunk the summary
        const chunks = splitIntoChunks(summary);
        await CoworkChunk.insertMany(chunks.map((text, i) => ({
          sessionId: session._id, userId: uid, isShared: true,
          order: i, text,
          sessionTitle: title, sessionSource: source,
          sessionIntent: intent, sessionOutcome: outcome,
          embeddingDirty: true,
        })));
      }

      // Async embed summary
      embedText(summary).then(async (emb) => {
        if (!emb) return;
        await CoworkChunk.updateMany(
          { sessionId: session._id, embeddingDirty: true },
          { embedding: emb, embeddingDirty: false },
        );
      }).catch(() => {});

      return {
        content: [{
          type: "text" as const,
          text: `✅ Session saved.\n\nID: ${session._id}\nTitle: ${title}${intent ? `\n🎯 Intent: ${intent}` : ""}${outcome ? `\n✅ Outcome: ${outcome}` : ""}${tags.length ? `\n🏷️ Tags: ${tags.join(", ")}` : ""}`,
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // list_cowork
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "list_cowork",
    "List recent cowork sessions with optional filters.",
    {
      scope:   z.enum(["all","personal","team"]).default("all"),
      intent:  z.string().optional(),
      tag:     z.string().optional(),
      days:    z.number().int().optional(),
      limit:   z.number().int().min(1).max(50).default(15),
    },
    async ({ scope, intent, tag, days, limit }) => {
      const { CoworkSession } = await db();
      const uid = ctx.userId;

      let filter: any;
      if (scope === "personal") filter = { userId: uid, isShared: false };
      else if (scope === "team") filter = { isShared: true };
      else filter = { $or: [{ userId: uid }, { isShared: true }] };

      if (intent) filter.intent = intent;
      if (tag)    filter.tags   = { $in: [tag] };
      if (days)   filter.createdAt = { $gte: new Date(Date.now() - days * 86_400_000) };

      const sessions = await CoworkSession.find(filter)
        .sort({ createdAt: -1 }).limit(limit)
        .select("title summary tags intent outcome source isShared createdAt helpfulCount useCount")
        .lean();

      if (sessions.length === 0) {
        return { content: [{ type: "text" as const, text: "No cowork sessions found." }] };
      }

      const text = sessions.map((s, i) =>
        `${i + 1}. **${s.title}** [${s.source}] · ${timeAgo(s.createdAt)}` +
        (s.intent ? ` · 🎯 ${s.intent}` : "") +
        (s.outcome ? ` · ✅ ${s.outcome}` : "") + "\n" +
        (s.tags?.length ? `   🏷️ ${s.tags.join(", ")}\n` : "") +
        `   ${s.summary?.slice(0, 120) ?? ""}...\n   ID: ${s._id}`
      ).join("\n\n");

      return { content: [{ type: "text" as const, text: `## Cowork Sessions (${sessions.length})\n\n${text}` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // get_cowork
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "get_cowork",
    "Get full details of a cowork session including all chunks.",
    {
      sessionId: z.string().min(1),
    },
    async ({ sessionId }) => {
      const { CoworkSession, CoworkChunk } = await db();
      const uid = ctx.userId;

      const session = await CoworkSession.findOne({
        _id: sessionId,
        $or: [{ userId: uid }, { isShared: true }],
      }).lean();

      if (!session) {
        return { content: [{ type: "text" as const, text: `Session not found: ${sessionId}` }] };
      }

      await CoworkSession.updateOne({ _id: sessionId }, { $inc: { useCount: 1 }, lastUsedAt: new Date() });

      const chunks = await CoworkChunk.find({ sessionId }).sort({ order: 1 }).select("text order").lean();

      const text =
        `# ${session.title}\n\n` +
        `🛠️ ${session.source} · 📅 ${timeAgo(session.createdAt)}` +
        (session.intent ? ` · 🎯 ${session.intent}` : "") +
        (session.outcome ? ` · ✅ ${session.outcome}` : "") + "\n" +
        (session.tags?.length ? `🏷️ ${session.tags.join(", ")}\n\n` : "\n") +
        `## Summary\n\n${session.summary}\n\n` +
        (session.filesTouched?.length ? `## Files Touched\n\n${session.filesTouched.map(f => `- ${f}`).join("\n")}\n\n` : "") +
        (chunks.length > 0 ? `## Full Content\n\n${chunks.map(c => c.text).join("\n\n")}` : "");

      return { content: [{ type: "text" as const, text }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // cowork_digest
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "cowork_digest",
    "Get a digest of recent cowork sessions — useful for standup prep or catching up on team activity.",
    {
      days:  z.number().int().min(1).max(30).default(7),
      scope: z.enum(["all","personal","team"]).default("all"),
    },
    async ({ days, scope }) => {
      const { CoworkSession } = await db();
      const uid = ctx.userId;
      const since = new Date(Date.now() - days * 86_400_000);

      let filter: any = { createdAt: { $gte: since } };
      if (scope === "personal")   filter.userId = uid;
      else if (scope === "team")  filter.isShared = true;
      else filter.$or = [{ userId: uid }, { isShared: true }];

      const sessions = await CoworkSession.find(filter).sort({ createdAt: -1 }).limit(30).lean();

      if (sessions.length === 0) {
        return { content: [{ type: "text" as const, text: `No cowork sessions in the last ${days} days.` }] };
      }

      // Group by intent/outcome
      const byIntent = new Map<string, any[]>();
      for (const s of sessions) {
        const key = s.intent ?? "general";
        if (!byIntent.has(key)) byIntent.set(key, []);
        byIntent.get(key)!.push(s);
      }

      const text =
        `# Cowork Digest (last ${days}d — ${sessions.length} sessions)\n\n` +
        [...byIntent.entries()].map(([intent, list]) =>
          `## ${intent.charAt(0).toUpperCase() + intent.slice(1)} (${list.length})\n` +
          list.map(s =>
            `• **${s.title}**${s.outcome ? ` → ${s.outcome}` : ""} · ${timeAgo(s.createdAt)}\n  ${s.summary?.slice(0, 120) ?? ""}...`
          ).join("\n")
        ).join("\n\n");

      return { content: [{ type: "text" as const, text }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // related_cowork
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "related_cowork",
    "Find cowork sessions related to a given session by tags and intent.",
    {
      sessionId: z.string().min(1),
      limit:     z.number().int().min(1).max(10).default(5),
    },
    async ({ sessionId, limit }) => {
      const { CoworkSession } = await db();
      const uid = ctx.userId;

      const base = await CoworkSession.findOne({
        _id: sessionId,
        $or: [{ userId: uid }, { isShared: true }],
      }).lean();

      if (!base) {
        return { content: [{ type: "text" as const, text: "Session not found." }] };
      }

      const filter: any = {
        _id: { $ne: base._id },
        $or: [{ userId: uid }, { isShared: true }],
      };
      if (base.tags?.length) filter.tags = { $in: base.tags };

      const related = await CoworkSession.find(filter)
        .sort({ createdAt: -1 }).limit(limit)
        .select("title summary tags intent outcome createdAt")
        .lean();

      if (related.length === 0) {
        return { content: [{ type: "text" as const, text: "No related sessions found." }] };
      }

      const text = related.map((s, i) =>
        `${i + 1}. **${s.title}** · ${timeAgo(s.createdAt)}` +
        (s.intent ? ` · 🎯 ${s.intent}` : "") +
        (s.tags?.length ? `\n   🏷️ ${s.tags.join(", ")}` : "") +
        `\n   ${s.summary?.slice(0, 120) ?? ""}...` +
        `\n   → get_cowork("${s._id}")`
      ).join("\n\n");

      return { content: [{ type: "text" as const, text: `## Related to "${base.title}"\n\n${text}` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // mark_cowork_used
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "mark_cowork_used",
    "Mark a cowork session as used and optionally record feedback. Called automatically by get_cowork — only needed for explicit feedback.",
    {
      sessionId: z.string().min(1),
      helpful:   z.boolean().optional(),
    },
    async ({ sessionId, helpful }) => {
      const { CoworkSession } = await db();
      const upd: any = { $inc: { useCount: 1 }, lastUsedAt: new Date() };
      if (helpful === true)  upd.$inc.helpfulCount    = 1;
      if (helpful === false) upd.$inc.notHelpfulCount = 1;
      await CoworkSession.updateOne({ _id: sessionId }, upd);
      return { content: [{ type: "text" as const, text: "Recorded." }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // list_spaces
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "list_spaces",
    "List your spaces (notebooks). Returns names, IDs, and whether context sharing is enabled.",
    {},
    async () => {
      const { Space } = await db();
      const spaces = await Space.find({ userId: ctx.userId }).sort({ createdAt: -1 }).lean();
      if (spaces.length === 0) {
        return { content: [{ type: "text" as const, text: "No spaces found. Create one in the dashboard first." }] };
      }
      const text = spaces.map(s =>
        `• **${s.name}** [ID: ${s._id}]${s.isSharedWithContext ? " 🌐 context-enabled" : ""}${s.description ? ` — ${s.description}` : ""}`
      ).join("\n");
      return { content: [{ type: "text" as const, text: `## Your Spaces\n\n${text}` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // list_notes
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "list_notes",
    "List notes — across all spaces (omit spaceId) or within a specific space.",
    {
      spaceId: z.string().optional().describe("Filter by space — omit to list across all spaces"),
      limit:   z.number().int().min(1).max(50).default(20),
    },
    async ({ spaceId, limit }) => {
      const { Note } = await db();
      const filter: any = { userId: ctx.userId };
      if (spaceId) filter.spaceId = spaceId;
      const notes = await Note.find(filter)
        .sort({ updatedAt: -1 }).limit(limit)
        .select("title tags isStarred updatedAt spaceId").lean();

      if (notes.length === 0) {
        return { content: [{ type: "text" as const, text: "No notes found." }] };
      }
      const text = notes.map(n =>
        `• ${n.isStarred ? "⭐ " : ""}**${n.title || "Untitled"}** [ID: ${n._id}]` +
        (n.tags?.length ? ` 🏷️ ${n.tags.join(", ")}` : "") +
        ` · ${timeAgo(n.updatedAt)}`
      ).join("\n");
      return { content: [{ type: "text" as const, text: `## Notes (${notes.length})\n\n${text}` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // get_note
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "get_note",
    "Get the full content of a note.",
    {
      noteId: z.string().min(1),
    },
    async ({ noteId }) => {
      const { Note, NoteBlock } = await db();
      const note = await Note.findOne({ _id: noteId, userId: ctx.userId }).lean();
      if (!note) {
        return { content: [{ type: "text" as const, text: `Note not found: ${noteId}` }] };
      }
      const blocks = await NoteBlock.find({ noteId }).sort({ order: 1 }).lean();
      const content = blocks.map(b => b.content).join("\n\n");

      return {
        content: [{
          type: "text" as const,
          text: `# ${note.title || "Untitled"}\n\n${content || "(empty note)"}`,
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // create_note
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "create_note",
    "Create a new note. spaceId is optional — omit it to auto-create or reuse a 'Notes' space.",
    {
      title:   z.string().max(200).default(""),
      content: z.string().default("").describe("Note content in markdown"),
      tags:    z.array(z.string()).default([]),
      spaceId: z.string().optional().describe("Space ID — omit to use the default Notes space"),
    },
    async ({ spaceId, title, content, tags }) => {
      const { Space, Note, NoteBlock } = await db();
      const uid = ctx.userId;

      let resolvedSpaceId = spaceId;
      let spaceName = "Notes";
      if (!resolvedSpaceId) {
        let notesSpace = await Space.findOne({ userId: uid, name: "Notes" }).lean();
        if (!notesSpace) {
          notesSpace = await Space.create({ userId: uid, name: "Notes", icon: "📝", description: "General notes" }) as any;
        }
        resolvedSpaceId = (notesSpace as any)._id.toString();
        spaceName = "Notes";
      } else {
        const space = await Space.findOne({ _id: resolvedSpaceId, userId: uid }).lean();
        if (!space) return { content: [{ type: "text" as const, text: "Space not found or access denied." }] };
        spaceName = (space as any).name;
      }

      const note = await Note.create({ title, spaceId: resolvedSpaceId, userId: uid, tags, preview: content.slice(0, 200) });

      if (content.trim()) {
        const chunks = splitIntoChunks(content, 2000, 200);
        await NoteBlock.insertMany(chunks.map((text, i) => ({
          noteId: note._id, spaceId: resolvedSpaceId, userId: uid, order: i, content: text,
        })));
      }

      return {
        content: [{
          type: "text" as const,
          text: `✅ Note created.\n\nID: ${note._id}\nTitle: ${title || "Untitled"}\nSpace: ${spaceName}`,
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // save_plan
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "save_plan",
    "Save an implementation plan as a structured checklist note. spaceId is optional — omit it and Operium will auto-create a 'Plans' space.",
    {
      title:    z.string().min(1).max(200),
      goal:     z.string().min(1).describe("What this plan achieves"),
      steps:    z.array(z.string()).min(1).describe("Flat list of action steps / tasks"),
      spaceId:  z.string().optional().describe("Space to save in — omit to auto-create a Plans space"),
      notes:    z.string().default(""),
    },
    async ({ title, goal, steps, spaceId, notes }) => {
      const { Space, Note, NoteBlock } = await db();
      const uid = ctx.userId;

      // Resolve or auto-create a space
      let resolvedSpaceId = spaceId;
      if (!resolvedSpaceId) {
        let plansSpace = await Space.findOne({ userId: uid, name: "Plans" }).lean();
        if (!plansSpace) {
          plansSpace = await Space.create({ userId: uid, name: "Plans", icon: "📋", description: "Implementation plans saved by AI" }) as any;
        }
        resolvedSpaceId = (plansSpace as any)._id.toString();
      }

      const content =
        `# ${title}\n\n**Goal**: ${goal}\n\n` +
        steps.map(s => `- [ ] ${s}`).join("\n") +
        (notes ? `\n\n## Notes\n\n${notes}` : "");

      const note = await Note.create({
        title, spaceId: resolvedSpaceId, userId: uid, tags: ["plan"], preview: goal.slice(0, 200),
      });
      await NoteBlock.create({ noteId: note._id, spaceId: resolvedSpaceId, userId: uid, order: 0, content });

      return {
        content: [{
          type: "text" as const,
          text: `✅ Plan saved as note.\n\nID: ${note._id}\nTitle: ${title}\nSteps: ${steps.length}\nSpace: ${resolvedSpaceId}`,
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // search_notes
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "search_notes",
    "Search notes by keyword across all spaces.",
    {
      query:   z.string().min(1),
      spaceId: z.string().optional(),
      limit:   z.number().int().min(1).max(20).default(10),
    },
    async ({ query, spaceId, limit }) => {
      const { NoteBlock, Note } = await db();
      const uid = ctx.userId;

      const blockFilter: any = { userId: uid, $text: { $search: query } };
      if (spaceId) blockFilter.spaceId = spaceId;

      const blocks = await NoteBlock.find(blockFilter, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .limit(limit * 2)
        .select("noteId content").lean().catch(() => []);

      if (blocks.length === 0) {
        return { content: [{ type: "text" as const, text: `No notes found for "${query}".` }] };
      }

      const noteIds = [...new Set(blocks.map(b => b.noteId.toString()))];
      const notes   = await Note.find({ _id: { $in: noteIds.slice(0, limit) }, userId: uid }).lean();
      const noteMap = new Map(notes.map(n => [n._id.toString(), n]));

      const text = noteIds.slice(0, limit).map(nid => {
        const note  = noteMap.get(nid);
        const block = blocks.find(b => b.noteId.toString() === nid);
        return `• **${note?.title || "Untitled"}** [ID: ${nid}]\n  ${block?.content.slice(0, 150) ?? ""}...\n  → get_note("${nid}")`;
      }).join("\n\n");

      return { content: [{ type: "text" as const, text: `## Notes matching "${query}" (${noteIds.length})\n\n${text}` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // save_rule
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "save_rule",
    "Save a coding convention, architectural decision, or workflow preference. Rules are loaded at startup and guide every session.",
    {
      title:    z.string().min(1).max(200),
      rule:     z.string().min(1).describe("The convention or rule to remember"),
      category: z.enum(["coding","communication","workflow","architecture","testing","general"]).default("general"),
      tags:     z.array(z.string()).default([]),
    },
    async ({ title, rule, category, tags }) => {
      const { ContextRule } = await db();
      const existing = await ContextRule.findOne({ userId: ctx.userId, title });

      if (existing) {
        await ContextRule.updateOne({ _id: existing._id }, { rule, category, tags, isActive: true });
        return { content: [{ type: "text" as const, text: `✅ Rule updated: "${title}"` }] };
      }

      const saved = await ContextRule.create({
        userId: ctx.userId, title, rule, category, tags, source: "manual",
      });
      return {
        content: [{
          type: "text" as const,
          text: `✅ Rule saved.\n\nID: ${saved._id}\nTitle: ${title}\nCategory: ${category}\n\nThis rule will be loaded in all future sessions.`,
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // list_rules
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "list_rules",
    "List your saved rules and conventions.",
    {
      category: z.string().optional(),
      activeOnly: z.boolean().default(true),
    },
    async ({ category, activeOnly }) => {
      const { ContextRule } = await db();
      const filter: any = { userId: ctx.userId };
      if (activeOnly) filter.isActive = true;
      if (category)   filter.category = category;

      const rules = await ContextRule.find(filter).sort({ timesApplied: -1, createdAt: -1 }).lean();
      if (rules.length === 0) {
        return { content: [{ type: "text" as const, text: "No rules saved yet." }] };
      }
      const text = rules.map(r =>
        `### [${r.category}] ${r.title}\n${r.rule}` +
        (r.tags?.length ? `\n🏷️ ${r.tags.join(", ")}` : "") +
        `\nID: ${r._id}`
      ).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text: `## Your Rules (${rules.length})\n\n${text}` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // learn_correction
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "learn_correction",
    "Save a correction as a rule so the same mistake isn't repeated. Call when the user corrects your behavior.",
    {
      title:      z.string().min(1).max(200),
      correction: z.string().min(1).describe("What to do differently in the future"),
      category:   z.enum(["coding","communication","workflow","architecture","testing","general"]).default("general"),
    },
    async ({ title, correction, category }) => {
      const { ContextRule } = await db();
      const rule = `Correction: ${correction}`;
      const existing = await ContextRule.findOne({ userId: ctx.userId, title });

      if (existing) {
        await ContextRule.updateOne({ _id: existing._id }, { rule, isActive: true });
      } else {
        await ContextRule.create({
          userId: ctx.userId, title, rule, category, source: "learned",
        });
      }

      return {
        content: [{
          type: "text" as const,
          text: `✅ Correction saved as rule: "${title}"\n\nThis will be applied in all future sessions.`,
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // get_experts
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "get_experts",
    "Find team members who have worked on a specific topic based on their cowork session tags.",
    {
      topic: z.string().min(1).describe("Topic or technology — e.g. 'auth', 'database migrations', 'React'"),
      limit: z.number().int().min(1).max(10).default(5),
    },
    async ({ topic, limit }) => {
      const { CoworkSession, User } = await db();

      const tags = parseQueryHints(topic, {}).tags;
      const searchTags = tags.length > 0 ? tags : [topic.toLowerCase()];

      const sessions = await CoworkSession.find({ isShared: true, tags: { $in: searchTags } })
        .sort({ helpfulCount: -1, createdAt: -1 }).limit(50)
        .select("userId tags title helpfulCount createdAt").lean();

      if (sessions.length === 0) {
        return { content: [{ type: "text" as const, text: `No team members found with expertise in "${topic}".` }] };
      }

      const expertise = new Map<string, { count: number; helpful: number; examples: string[] }>();
      for (const s of sessions) {
        const uid = s.userId.toString();
        if (!expertise.has(uid)) expertise.set(uid, { count: 0, helpful: 0, examples: [] });
        const e = expertise.get(uid)!;
        e.count++;
        e.helpful += s.helpfulCount ?? 0;
        if (e.examples.length < 2) e.examples.push(s.title);
      }

      const userIds = [...expertise.keys()].slice(0, limit);
      const users   = await (User as any).find({ _id: { $in: userIds } }).select("name email").lean() as any[];
      const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

      const text = userIds
        .sort((a, b) => (expertise.get(b)!.helpful + expertise.get(b)!.count) - (expertise.get(a)!.helpful + expertise.get(a)!.count))
        .map((uid, i) => {
          const e = expertise.get(uid)!;
          const u = userMap.get(uid);
          return `${i + 1}. **${u?.name || u?.email || "Team member"}** — ${e.count} sessions, ${e.helpful} helpful votes\n   Examples: ${e.examples.join(", ")}`;
        }).join("\n\n");

      return { content: [{ type: "text" as const, text: `## Experts in "${topic}"\n\n${text}` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // ping
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    "ping",
    "Health check — confirms MCP transport and auth are working.",
    {},
    async () => ({ content: [{ type: "text" as const, text: `pong — user ${ctx.userId}` }] }),
  );

  return server;
}
