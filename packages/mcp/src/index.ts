import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  compositeScore, splitMarkdownChunks, markdownQualityNudge, snippet, parseQueryHints,
  AzureBoardsClient, AzureBoardsError, buildTree,
  type BoardItem, type BoardItemNode, type BoardComment, type QueryWorkItemsOpts,
  type UpdateWorkItemPatch, type CreateWorkItemFields,
} from "@operium/core";

/** Per-request context injected by the HTTP or stdio transport. */
export interface McpContext {
  userId: string;
  orgId: string | null;
  geminiKey?: string;
  /** Optional embedding function injected by the transport layer */
  embedFn?: (text: string) => Promise<number[]>;
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

const OPERIUM_INSTRUCTIONS = `Operium is persistent, shared memory for AI coding agents. Everything you save is rendered as rich Markdown in a web app and re-read by other agents and teammates.

Session contract:
1. START — call get_startup_context first, every session.
2. BEFORE non-trivial work — recall_context("<topic>"): a teammate or a past session may already have the answer.
3. DURING — checkpoint_cowork after every significant finding (~every 10-15 messages) so progress survives crashes and context loss.
4. END — save_chat to finalize with a polished summary. Call save_rule / learn_correction the moment the user states a convention or corrects you. Use update_plan to tick off plan steps as you complete them, and update_task to move tasks you finish.

Live Azure Boards: list_board_items / list_sprints / update_board_item / create_board_item read and write real Azure DevOps work items. Call update_board_item to move a work item's state and sprint the moment the user says they've finished sprint work on it.

Formatting contract (applies to every finding, summary, note, plan, rule, and description you save):
- Write well-structured Markdown: ## headings, bullet lists, tables where useful.
- ALL code, commands, logs, and diffs go in fenced blocks with a language tag (\`\`\`ts, \`\`\`bash, ...). Never paste code inline in prose.
- Reference files as \`backtick/paths.ts\` and end saves with a "**Files:** ..." line.
- Never save a single unstructured wall of text — future agents must be able to skim it.`;

/** Static registry — the single source of truth for what this server exposes. */
export const MCP_TOOL_NAMES = [
  "get_startup_context", "recall_context", "search",
  "create_history", "list_history", "update_history", "delete_history",
  "checkpoint_cowork", "save_chat", "list_cowork", "get_cowork", "cowork_digest",
  "related_cowork", "mark_cowork_used", "delete_cowork",
  "list_spaces", "list_notes", "get_note", "create_note", "append_note", "update_note", "delete_note",
  "save_plan", "list_plans", "update_plan", "search_notes",
  "save_rule", "list_rules", "learn_correction", "delete_rule",
  "get_experts", "list_tasks", "create_task", "update_task",
  "list_board_items", "list_sprints", "get_board_item", "update_board_item", "create_board_item",
  "delete_board_item", "add_board_comment",
  "whoami", "ping",
] as const;
export const MCP_TOOL_COUNT = MCP_TOOL_NAMES.length;

export function buildMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: "operium", version: "1.1.0" },
    { instructions: OPERIUM_INSTRUCTIONS },
  );

  // Shared memory is visible only within the caller's org. With no org
  // membership, "shared" collapses to the caller's own shared items.
  const sharedScope: any = ctx.orgId
    ? { isShared: true, orgId: ctx.orgId }
    : { isShared: true, userId: ctx.userId };

  // Lazy-load heavy deps at tool-call time so the module stays importable without DB.
  async function db() {
    const mod = await import("@operium/db");
    return mod;
  }

  // ── Azure Boards: shared plumbing ──────────────────────────────────────────
  const BOARDS_NOT_CONNECTED =
    "Azure DevOps is not connected. Add your organisation and a PAT with Work Items (read & write) scope in Operium Settings → Integrations.";

  async function boardsClient(): Promise<{ client: AzureBoardsClient; org: string; pat: string } | null> {
    const { User } = await db();
    const user = await User.findById(ctx.userId).select("+azureDevOpsToken azureDevOpsOrg").lean() as any;
    if (!user?.azureDevOpsToken || !user?.azureDevOpsOrg) return null;
    const org = user.azureDevOpsOrg as string;
    const pat = user.azureDevOpsToken as string;
    return { client: new AzureBoardsClient({ org, pat }), org, pat };
  }

  function formatAzureError(err: unknown): string {
    if (err instanceof AzureBoardsError) {
      if (err.status === 401 || err.status === 403) {
        return "Azure DevOps PAT is invalid, expired, or missing the Work Items (read & write) scope. Update it in Operium Settings → Integrations.";
      }
      if (err.status === 409) {
        return "This work item changed in Azure since it was last read — re-list and retry.";
      }
      if (err.status === 429) {
        return `Azure is throttling requests${err.retryAfterSec !== undefined ? ` — retry in ${err.retryAfterSec}s` : " — retry shortly"}.`;
      }
      return `Azure DevOps error: ${err.message}`;
    }
    return `Azure DevOps error: ${(err as Error)?.message ?? String(err)}`;
  }

  /** Resolves the target project — returns its name, or a ToolResult to send back when ambiguous. */
  async function resolveProject(client: AzureBoardsClient, project?: string): Promise<string | ToolResult> {
    if (project) return project;
    const projects = await client.listProjects();
    if (projects.length === 1) return projects[0]!.name;
    if (projects.length === 0) {
      return { content: [{ type: "text" as const, text: "No Azure DevOps projects found for this organisation." }] };
    }
    const list = projects.map((p) => `- ${p.name}`).join("\n");
    return {
      content: [{
        type: "text" as const,
        text: `Multiple projects found — pass \`project\` to pick one:\n\n${list}`,
      }],
    };
  }

  /** Resolves the target team — the first team from listTeams when none is given. */
  async function resolveTeam(client: AzureBoardsClient, project: string, team?: string): Promise<string | ToolResult> {
    if (team) return team;
    const teams = await client.listTeams(project);
    if (teams.length === 0) {
      return { content: [{ type: "text" as const, text: `No teams found for project "${project}".` }] };
    }
    return teams[0]!.name;
  }

  /** Resolves a sprint name (or a full "\"-separated path, passed through as-is) to its iteration path. */
  async function resolveSprintPath(
    client: AzureBoardsClient,
    project: string,
    sprint: string,
    team?: string,
  ): Promise<string | ToolResult> {
    if (sprint.includes("\\")) return sprint;
    const resolvedTeam = await resolveTeam(client, project, team);
    if (typeof resolvedTeam !== "string") return resolvedTeam;
    const iterations = await client.listIterations(project, resolvedTeam);
    const match = iterations.find((it) => it.name.toLowerCase() === sprint.toLowerCase());
    if (!match) {
      const names = iterations.map((it) => it.name).join(", ") || "(none configured)";
      return {
        content: [{
          type: "text" as const,
          text: `Sprint "${sprint}" not found for team "${resolvedTeam}". Available: ${names}`,
        }],
      };
    }
    return match.path;
  }

  /** Best-effort resolution of "me" (the PAT holder) to an Azure identity for assignee filtering. */
  async function resolveMyAzureIdentity(org: string, pat: string): Promise<string | null> {
    try {
      const res = await fetch(`https://dev.azure.com/${encodeURIComponent(org)}/_apis/connectiondata`, {
        headers: { Authorization: `Basic ${Buffer.from(":" + pat).toString("base64")}` },
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data?.authenticatedUser?.properties?.Account?.$value ?? data?.authenticatedUser?.providerDisplayName ?? null;
    } catch {
      return null;
    }
  }

  /** One-line "connected as ..." status for whoami; never throws. */
  async function azureIdentityLine(org: string, pat: string): Promise<string> {
    try {
      const res = await fetch(`https://dev.azure.com/${encodeURIComponent(org)}/_apis/connectiondata`, {
        headers: { Authorization: `Basic ${Buffer.from(":" + pat).toString("base64")}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return `connected to org **${org}**, but the PAT check failed (${res.status}) — it may be expired or revoked`;
      const data: any = await res.json();
      const au = data?.authenticatedUser;
      const name = au?.providerDisplayName ?? au?.customDisplayName;
      const account = au?.properties?.Account?.$value;
      return `connected as **${name ?? "unknown"}**${account ? ` (${account})` : ""} — org **${org}**`;
    } catch {
      return `connected to org **${org}**, but Azure DevOps could not be reached`;
    }
  }

  /** One-line "connected as ..." status for whoami; never throws. */
  async function githubIdentityLine(token: string): Promise<string> {
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "operium-mcp",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return `connected, but the token check failed (${res.status}) — it may be expired or revoked`;
      const gh: any = await res.json();
      return `connected as **${gh?.login ?? "unknown"}**${gh?.name ? ` (${gh.name})` : ""}`;
    } catch {
      return "connected, but GitHub could not be reached";
    }
  }

  function renderBoardTree(nodes: BoardItemNode[], depth: number, lines: string[]): void {
    for (const n of nodes) {
      const assignee = n.assignee ? ` (${n.assignee.displayName})` : "";
      const sprintTag = n.iterationPath ? ` {${n.iterationPath.split("\\").pop()}}` : "";
      lines.push(`${"  ".repeat(depth)}- #${n.id} [${n.type}] ${n.title} — ${n.state}${assignee}${sprintTag}`);
      renderBoardTree(n.children, depth + 1, lines);
    }
  }

  async function embedText(text: string): Promise<number[] | null> {
    try {
      if (ctx.embedFn) return await ctx.embedFn(text.slice(0, 8000));
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fire-and-forget per-chunk embedding for a session's dirty chunks.
   * Runs only when the caller has a personal Gemini key (ctx.embedFn);
   * anything left dirty is picked up by the API's background embed worker.
   */
  function embedDirtyChunks(sessionId: any, title: string, source: string) {
    if (!ctx.embedFn) return;
    void (async () => {
      const { CoworkChunk } = await db();
      const dirty = await CoworkChunk.find({ sessionId, embeddingDirty: true })
        .sort({ order: 1 }).limit(12).select("_id text").lean();
      for (const c of dirty) {
        const emb = await embedText(`[${source}] ${title}\n\n${c.text}`);
        if (!emb) return; // rate limited / failed — leave dirty for the worker
        await CoworkChunk.updateOne({ _id: c._id }, { embedding: emb, embeddingDirty: false });
      }
    })().catch(() => {});
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

  // ── Tool registration wrapper: usage logging + friendly error surface ──────
  type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
  function tool(
    name: (typeof MCP_TOOL_NAMES)[number],
    description: string,
    schema: z.ZodRawShape,
    handler: (args: any) => Promise<ToolResult>,
  ) {
    server.tool(name, description, schema, (async (args: any) => {
      const t0 = Date.now();
      const log = (success: boolean, errorMessage?: string) =>
        void db()
          .then(({ McpUsageLog }) => McpUsageLog.create({
            userId: ctx.userId, toolName: name, success, errorMessage, durationMs: Date.now() - t0,
          }))
          .catch(() => {});
      try {
        const res = await handler(args);
        log(true);
        return res;
      } catch (err: any) {
        log(false, String(err?.message ?? err).slice(0, 500));
        return {
          content: [{
            type: "text" as const,
            text: `❌ ${name} failed: ${err?.message ?? "unknown error"}. Nothing was saved — retry, or tell the user if it keeps failing.`,
          }],
          isError: true,
        };
      }
    }) as any);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // get_startup_context
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
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
        CoworkSession.find({ $or: [{ userId: uid }, sharedScope] })
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
  tool(
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
      // Hints are soft ranking boosts, never hard filters (a wrong guess must
      // not hide relevant results). NOTE: in-memory cosine over a recency
      // window — swap for Atlas $vectorSearch when the corpus outgrows this.
      const chunkFilter: any = { $or: [{ userId: uid }, sharedScope] };

      const chunks = await CoworkChunk.find(chunkFilter)
        .sort({ createdAt: -1 })
        .limit(500)
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
            const hintBoost =
              (hints.intent && s.intent === hints.intent ? 0.05 : 0) +
              (hints.outcome && s.outcome === hints.outcome ? 0.03 : 0);
            const score = compositeScore({
              relevance: (meta.sim || 0.5) + hintBoost,
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
            `💬 ${snippet(meta.text, 300)}\n` +
            `→ get_cowork("${s._id}")`
          ).join("\n\n---\n\n");

          sections.push(`## Cowork Sessions (${scored.length})\n\n${text}`);
        }
      }

      // ── Work history search ───────────────────────────────
      const histFilter: any = { userId: uid };
      if (since) histFilter.createdAt = { $gte: since };

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
  tool(
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
        // Only EXPLICIT args filter hard; auto-detected hints are soft boosts.
        const chunkFilter: any = { $or: [{ userId: uid }, sharedScope] };
        if (intent)  chunkFilter.sessionIntent  = intent;
        if (outcome) chunkFilter.sessionOutcome = outcome;

        const chunks = await CoworkChunk.find(chunkFilter)
          .sort({ createdAt: -1 }).limit(500)
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
        if (tags?.length) sessionFilter.tags = { $in: tags }; // explicit tags only — hint tags stay soft

        const sessions = await CoworkSession.find(sessionFilter).lean();
        if (sessions.length > 0) {
          const scored = sessions.map(s => {
            const meta = sessionMap.get(s._id.toString()) ?? { sim: 0.5, text: "" };
            const hintBoost =
              (hints.intent && s.intent === hints.intent ? 0.05 : 0) +
              (hints.outcome && s.outcome === hints.outcome ? 0.03 : 0);
            return {
              s, meta,
              score: compositeScore({
                relevance: meta.sim + hintBoost,
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
            `💬 ${snippet(meta.text, 300)}\n` +
            (includeSummary && s.summary ? `\n**Summary**: ${s.summary.slice(0, 500)}\n` : "") +
            `→ get_cowork("${s._id}")`
          ).join("\n\n---\n\n");

          sections.push(`## Cowork Sessions (${scored.length})\n\n${text}`);
        }
      }

      // ── Notes ─────────────────────────────────────────────
      // NoteBlock has no embeddings, so this is always a text search.
      if (scope === "all" || scope === "notes") {
        let topBlocks: any[] = await NoteBlock.find(
          { userId: uid, $text: { $search: query } },
          { score: { $meta: "textScore" } }
        )
          .sort({ score: { $meta: "textScore" } }).limit(10)
          .select("noteId content").lean().catch(() => []);

        if (topBlocks.length === 0) {
          const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          topBlocks = await NoteBlock.find({ userId: uid, content: { $regex: escaped, $options: "i" } })
            .sort({ createdAt: -1 }).limit(10)
            .select("noteId content").lean();
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
  tool(
    "create_history",
    "Log a new work history entry — meetings, PRs, deployments, debugging sessions, etc. Essential for standup summaries.",
    {
      title:       z.string().min(1).max(200),
      description: z.string().max(5000).default("").describe(
        "Optional detail in Markdown, kept scannable (<=5 bullets): what happened, why, result, links, blockers. Shown in standup digests and search results."),
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
  tool(
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
  tool(
    "checkpoint_cowork",
    "Save an incremental finding, fix, or decision mid-session — call after every significant discovery (~every 10-15 messages) so progress survives crashes and context loss. Write `finding` as structured Markdown: it is rendered in a web UI and read back by other agents. At session end, call save_chat(sessionId) to finalize.",
    {
      source:       z.string().default("claude-code").describe("Tool or source: claude-code, cursor, system"),
      title:        z.string().min(1).max(200),
      finding:      z.string().min(1).describe(
        "The finding in rich Markdown (~200-2000 chars). Recommended shape:\n" +
        "## What happened\nOne short paragraph stating the finding/fix/decision.\n" +
        "### Root cause / Key insight\n```ts\n// minimal relevant code, error output, or command — ALWAYS in a fenced block with a language tag\n```\n" +
        "**Files:** `src/foo.ts`, `src/bar.ts`\n**Next:** what remains or what to try.\n" +
        "Never send an unformatted wall of text; never put code outside ``` fences."),
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
          orgId: ctx.orgId ?? undefined,
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

      // Chunk the finding (markdown-aware: never splits inside a code fence)
      const chunks = splitMarkdownChunks(finding);
      const existingCount = await CoworkChunk.countDocuments({ sessionId: session._id });
      const chunkDocs = chunks.map((text, i) => ({
        sessionId:     session._id,
        userId:        uid,
        orgId:         ctx.orgId ?? undefined,
        isShared:      true,
        kind:          "checkpoint" as const,
        order:         existingCount + i,
        text,
        sessionTitle:  title,
        sessionSource: source,
        sessionIntent:  intent ?? session.intent,
        sessionOutcome: outcome ?? session.outcome,
        embeddingDirty: true,
      }));

      await CoworkChunk.insertMany(chunkDocs);
      embedDirtyChunks(session._id, title, source);

      const nudge = markdownQualityNudge(finding);
      return {
        content: [{
          type: "text" as const,
          text:
            `✅ Checkpoint saved (${chunks.length} chunk${chunks.length > 1 ? "s" : ""}) — session ${session._id}.\n` +
            (nudge ? `\n${nudge}\n` : "") +
            `\nKeep going — checkpoint again after your next significant finding.\n` +
            `When the session ends, finalize with:\n` +
            `save_chat(sessionId="${session._id}", summary=<Markdown: ## Goal / ## What was done / ## Key decisions & gotchas / **Files:** / ## Next steps>)`,
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // save_chat  (finalize a session or save a whole conversation at once)
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
    "save_chat",
    "Finalize a checkpoint_cowork session (pass its sessionId) or save a whole conversation at once. The summary becomes the session's permanent record — rendered as Markdown in the web app and used to answer future recall_context queries from the whole team. Call at the end of every session.",
    {
      title:        z.string().min(1).max(200),
      summary:      z.string().min(1).describe(
        "Polished summary in rich Markdown (~300-3000 chars), written for a teammate — or a future agent — with zero context. Structure:\n" +
        "## Goal\n## What was done\n- one bullet per change/fix, naming `file/paths.ts`\n" +
        "## Key decisions & gotchas\n```lang\n// fenced blocks for any code worth remembering\n```\n" +
        "**Files:** all touched paths\n## Next steps"),
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
      let finalized = false;
      if (sessionId) {
        session = await CoworkSession.findOneAndUpdate(
          { _id: sessionId, userId: uid },
          { title, summary, intent, outcome, $addToSet: { tags: { $each: tags }, filesTouched: { $each: filesTouched } }, branch, repoUrl },
          { new: true },
        );
        finalized = !!session;
      }

      if (!session) {
        session = await CoworkSession.create({
          userId: uid,
          orgId: ctx.orgId ?? undefined,
          source: source as any,
          title, summary, tags, isShared: true,
          intent, outcome, filesTouched, branch, repoUrl,
        });
      }

      // Index the polished summary as its own chunks (markdown-aware).
      // On re-finalize, replace prior summary chunks so this stays idempotent;
      // checkpoint chunks are kept — they hold detail the summary condenses away.
      await CoworkChunk.deleteMany({ sessionId: session._id, kind: "summary" });
      const startOrder = await CoworkChunk.countDocuments({ sessionId: session._id });
      const summaryChunks = splitMarkdownChunks(summary);
      await CoworkChunk.insertMany(summaryChunks.map((text, i) => ({
        sessionId: session._id, userId: uid, orgId: ctx.orgId ?? undefined, isShared: true,
        kind: "summary" as const,
        order: startOrder + i, text,
        sessionTitle: title, sessionSource: session.source,
        sessionIntent: intent ?? session.intent, sessionOutcome: outcome ?? session.outcome,
        embeddingDirty: true,
      })));
      embedDirtyChunks(session._id, title, session.source);

      const nudge = markdownQualityNudge(summary);
      return {
        content: [{
          type: "text" as const,
          text:
            `✅ Session ${finalized ? "finalized" : "saved"}: "${title}" (${session._id})\n` +
            `${summaryChunks.length} summary chunk${summaryChunks.length !== 1 ? "s" : ""} indexed for team search.` +
            `${intent ? `\n🎯 Intent: ${intent}` : ""}${outcome ? `\n✅ Outcome: ${outcome}` : ""}${tags.length ? `\n🏷️ Tags: ${tags.join(", ")}` : ""}` +
            (nudge ? `\n\n${nudge}` : "") +
            `\n\nThis is now shared memory — teammates' agents will find it via recall_context.`,
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // list_cowork
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
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
      else if (scope === "team") filter = { ...sharedScope };
      else filter = { $or: [{ userId: uid }, sharedScope] };

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
  tool(
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
        $or: [{ userId: uid }, sharedScope],
      }).lean();

      if (!session) {
        return { content: [{ type: "text" as const, text: `Session not found: ${sessionId}` }] };
      }

      await CoworkSession.updateOne({ _id: sessionId }, { $inc: { useCount: 1 }, lastUsedAt: new Date() });

      const chunks = await CoworkChunk.find({ sessionId, kind: { $ne: "summary" } })
        .sort({ order: 1 }).select("text order").lean();

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
  tool(
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
      else if (scope === "team")  Object.assign(filter, sharedScope);
      else filter.$or = [{ userId: uid }, sharedScope];

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
  tool(
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
        $or: [{ userId: uid }, sharedScope],
      }).lean();

      if (!base) {
        return { content: [{ type: "text" as const, text: "Session not found." }] };
      }

      const filter: any = {
        _id: { $ne: base._id },
        $or: [{ userId: uid }, sharedScope],
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
  tool(
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
  tool(
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
  tool(
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
  tool(
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
  tool(
    "create_note",
    "Create a new note (rendered as rich Markdown in the web app). spaceId is optional — omit it to auto-create or reuse a 'Notes' space.",
    {
      title:   z.string().max(200).default(""),
      content: z.string().default("").describe(
        "Note body in Markdown. Use # headings, bullet lists, tables, and fenced code blocks with language tags — the note renders as rich Markdown in the web app."),
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
        const chunks = splitMarkdownChunks(content, 2000);
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
  tool(
    "save_plan",
    "Save an implementation plan as a Markdown checklist note (each step becomes a '- [ ]' item you can later tick off with update_plan). spaceId is optional — omit it and Operium will auto-create a 'Plans' space.",
    {
      title:    z.string().min(1).max(200),
      goal:     z.string().min(1).describe("1-2 sentence statement of what this plan achieves (plain prose, no heading)"),
      steps:    z.array(z.string()).min(1).describe("Flat list of action steps — one imperative sentence each; they become '- [ ]' checklist items"),
      spaceId:  z.string().optional().describe("Space to save in — omit to auto-create a Plans space"),
      notes:    z.string().default("").describe("Optional Markdown context: risks, open questions, links, fenced code sketches."),
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
        steps.map((s: string) => `- [ ] ${s}`).join("\n") +
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
  tool(
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
  tool(
    "save_rule",
    "Save a coding convention, architectural decision, or workflow preference. Rules are loaded at startup and guide every session.",
    {
      title:    z.string().min(1).max(200),
      rule:     z.string().min(1).describe(
        "The convention as ONE imperative sentence (e.g. 'Always use pnpm, never npm'), optionally followed by a short Markdown example — a ```lang fenced before/after snippet. Keep it directly actionable; it is injected into every future session."),
      category: z.enum(["coding","communication","workflow","architecture","testing","general"]).default("general"),
      tags:     z.array(z.string()).default([]),
    },
    async ({ title, rule, category, tags }) => {
      const { ContextRule } = await db();
      const existing = await ContextRule.findOne({ userId: ctx.userId, title });

      if (existing) {
        await ContextRule.updateOne({ _id: existing._id }, { rule, category, tags, isActive: true });
        const tip = rule.includes("`") ? "" : "\n\nTip: rules render as Markdown — a fenced before/after example makes them easier to apply.";
        return { content: [{ type: "text" as const, text: `✅ Rule updated: "${title}"${tip}` }] };
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
  tool(
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
  tool(
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

      const tip = correction.includes("`") ? "" : "\nTip: corrections render as Markdown — a fenced wrong/right example makes them easier to apply.";
      return {
        content: [{
          type: "text" as const,
          text: `✅ Correction saved as rule: "${title}"\n\nThis will be applied in all future sessions.${tip}`,
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // get_experts
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
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

      const sessions = await CoworkSession.find({ ...sharedScope, tags: { $in: searchTags } })
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
  // whoami
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
    "whoami",
    "Your identity card: who you are acting as, which organization you belong to, which Azure DevOps and GitHub accounts are connected, and how much memory exists. Call when unsure about identity, org context, or what Operium already knows.",
    {},
    async () => {
      const { User, Org, Membership, CoworkSession, ContextRule, Note, Task } = await db();
      const uid = ctx.userId;

      const [user, membership, sessionCount, ruleCount, noteCount, openTasks] = await Promise.all([
        User.findById(uid).select("name email azureDevOpsOrg +geminiApiKey +githubToken +azureDevOpsToken").lean() as any,
        ctx.orgId ? Membership.findOne({ userId: uid, orgId: ctx.orgId }).lean() as any : null,
        CoworkSession.countDocuments({ $or: [{ userId: uid }, sharedScope] }),
        ContextRule.countDocuments({ userId: uid, isActive: true }),
        Note.countDocuments({ userId: uid }),
        Task.countDocuments({ $or: [{ userId: uid }, { assigneeId: uid }], status: { $in: ["todo", "in_progress"] } }),
      ]);

      let orgLine = "No organization — shared memory is limited to your own items.";
      let teammateLine = "";
      if (ctx.orgId) {
        const [org, memberCount] = await Promise.all([
          Org.findById(ctx.orgId).lean() as any,
          Membership.countDocuments({ orgId: ctx.orgId }),
        ]);
        orgLine = `**Org:** ${org?.name ?? ctx.orgId} — you are ${membership?.role ?? "member"}`;
        teammateLine = `**Teammates:** ${Math.max(memberCount - 1, 0)}`;
      }

      const [azureLine, githubLine] = await Promise.all([
        user?.azureDevOpsToken && user?.azureDevOpsOrg
          ? azureIdentityLine(user.azureDevOpsOrg, user.azureDevOpsToken)
          : Promise.resolve("not connected — add an organisation + PAT in Settings to use the *_board_* tools"),
        user?.githubToken
          ? githubIdentityLine(user.githubToken)
          : Promise.resolve("not connected — add a token in Settings to sync git activity"),
      ]);

      const text =
        `## Who you are\n\n` +
        `**User:** ${user?.name ?? "Unknown"} (${user?.email ?? uid})\n` +
        `${orgLine}\n` +
        (teammateLine ? `${teammateLine}\n` : "") +
        `**Semantic search:** ${user?.geminiApiKey ? "on (personal Gemini key configured)" : "keyword-only (no Gemini key — add one in Settings for semantic recall)"}\n\n` +
        `## Connected integrations\n\n` +
        `- **Azure DevOps:** ${azureLine}\n` +
        `- **GitHub:** ${githubLine}\n\n` +
        `## Memory on hand\n\n` +
        `- ${sessionCount} cowork sessions visible to you\n` +
        `- ${ruleCount} active rules · ${noteCount} notes · ${openTasks} open tasks\n\n` +
        `Use get_startup_context to load it; recall_context to search it.`;

      return { content: [{ type: "text" as const, text }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // update_history / delete_history
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
    "update_history",
    "Fix a work history entry you logged earlier (wrong title, category, flags, or description). Own entries only.",
    {
      historyId:   z.string().min(1),
      title:       z.string().max(200).optional(),
      description: z.string().max(5000).optional().describe("Markdown, kept scannable — bullets over prose"),
      category:    z.enum(["General","Meeting","PR Review","Daily Standup","Sales Meeting","Coding","Debugging","Design","Planning","Deployment","Wiki"]).optional(),
      isMilestone: z.boolean().optional(),
      isBlocker:   z.boolean().optional(),
      isImportant: z.boolean().optional(),
    },
    async ({ historyId, ...fields }) => {
      const { WorkHistory } = await db();
      const upd: any = {};
      for (const [k, v] of Object.entries(fields)) if (v !== undefined) upd[k] = v;
      if (Object.keys(upd).length === 0) {
        return { content: [{ type: "text" as const, text: "Nothing to update — pass at least one field." }] };
      }
      const doc = await WorkHistory.findOneAndUpdate({ _id: historyId, userId: ctx.userId }, upd, { new: true }).lean();
      if (!doc) return { content: [{ type: "text" as const, text: `History entry not found (or not yours): ${historyId}` }] };
      return { content: [{ type: "text" as const, text: `✅ History entry updated: "${doc.title}" [${doc.category}]` }] };
    },
  );

  tool(
    "delete_history",
    "Delete a work history entry you logged by mistake. Own entries only; irreversible.",
    { historyId: z.string().min(1) },
    async ({ historyId }) => {
      const { WorkHistory } = await db();
      const doc = await WorkHistory.findOneAndDelete({ _id: historyId, userId: ctx.userId });
      if (!doc) return { content: [{ type: "text" as const, text: `History entry not found (or not yours): ${historyId}` }] };
      return { content: [{ type: "text" as const, text: `🗑️ Deleted history entry "${doc.title}".` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // delete_cowork
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
    "delete_cowork",
    "Delete a cowork session you created (plus all its chunks) — for accidental or junk saves. Own sessions only; irreversible.",
    { sessionId: z.string().min(1) },
    async ({ sessionId }) => {
      const { CoworkSession, CoworkChunk } = await db();
      const doc = await CoworkSession.findOneAndDelete({ _id: sessionId, userId: ctx.userId });
      if (!doc) return { content: [{ type: "text" as const, text: `Session not found (or not yours): ${sessionId}` }] };
      const { deletedCount } = await CoworkChunk.deleteMany({ sessionId });
      return { content: [{ type: "text" as const, text: `🗑️ Deleted session "${doc.title}" and ${deletedCount} chunk(s).` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // append_note / update_note / delete_note
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
    "append_note",
    "Append a Markdown section to an existing note — the right tool for running logs and decision journals. Own notes only.",
    {
      noteId:  z.string().min(1),
      content: z.string().min(1).describe("Markdown to append — start with a ## heading so the note stays skimmable; fence any code with a language tag"),
    },
    async ({ noteId, content }) => {
      const { Note, NoteBlock } = await db();
      const note = await Note.findOne({ _id: noteId, userId: ctx.userId });
      if (!note) return { content: [{ type: "text" as const, text: `Note not found (or not yours): ${noteId}` }] };

      const order = await NoteBlock.countDocuments({ noteId });
      const chunks = splitMarkdownChunks(content, 2000);
      await NoteBlock.insertMany(chunks.map((text, i) => ({
        noteId, spaceId: note.spaceId, userId: ctx.userId, order: order + i, content: text,
      })));
      await Note.updateOne({ _id: noteId }, { updatedAt: new Date() });

      return { content: [{ type: "text" as const, text: `✅ Appended ${chunks.length} block(s) to "${note.title || "Untitled"}".` }] };
    },
  );

  tool(
    "update_note",
    "Replace a note's title, content, or tags. Content is Markdown and fully replaces the existing body — use append_note to add instead. Own notes only.",
    {
      noteId:  z.string().min(1),
      title:   z.string().max(200).optional(),
      content: z.string().optional().describe("New full body in Markdown (## headings, bullets, fenced code with language tags)"),
      tags:    z.array(z.string()).optional(),
    },
    async ({ noteId, title, content, tags }) => {
      const { Note, NoteBlock } = await db();
      const note = await Note.findOne({ _id: noteId, userId: ctx.userId });
      if (!note) return { content: [{ type: "text" as const, text: `Note not found (or not yours): ${noteId}` }] };

      const upd: any = {};
      if (title !== undefined) upd.title = title;
      if (tags  !== undefined) upd.tags  = tags;
      if (content !== undefined) {
        upd.preview = content.substring(0, 200);
        await NoteBlock.deleteMany({ noteId });
        const chunks = splitMarkdownChunks(content, 2000);
        await NoteBlock.insertMany(chunks.map((text, i) => ({
          noteId, spaceId: note.spaceId, userId: ctx.userId, order: i, content: text,
        })));
      }
      await Note.updateOne({ _id: noteId }, upd);
      return { content: [{ type: "text" as const, text: `✅ Note updated: "${title ?? note.title ?? "Untitled"}"` }] };
    },
  );

  tool(
    "delete_note",
    "Delete a note (and all its content blocks) — also how you delete a plan. Own notes only; irreversible.",
    { noteId: z.string().min(1) },
    async ({ noteId }) => {
      const { Note, NoteBlock } = await db();
      const note = await Note.findOneAndDelete({ _id: noteId, userId: ctx.userId });
      if (!note) return { content: [{ type: "text" as const, text: `Note not found (or not yours): ${noteId}` }] };
      await NoteBlock.deleteMany({ noteId });
      return { content: [{ type: "text" as const, text: `🗑️ Deleted note "${note.title || "Untitled"}".` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // list_plans / update_plan
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
    "list_plans",
    "List saved implementation plans with checklist progress (e.g. 3/7 steps done).",
    { limit: z.number().int().min(1).max(30).default(10) },
    async ({ limit }) => {
      const { Note, NoteBlock } = await db();
      const plans = await Note.find({ userId: ctx.userId, tags: "plan" })
        .sort({ updatedAt: -1 }).limit(limit).lean();
      if (plans.length === 0) {
        return { content: [{ type: "text" as const, text: "No plans saved yet. Use save_plan to create one." }] };
      }
      const lines: string[] = [];
      for (const p of plans) {
        const blocks = await NoteBlock.find({ noteId: p._id }).sort({ order: 1 }).select("content").lean();
        const body = blocks.map(b => b.content).join("\n");
        const done  = (body.match(/^- \[x\]/gim) ?? []).length;
        const total = done + (body.match(/^- \[ \]/gm) ?? []).length;
        lines.push(`• **${p.title || "Untitled"}** — ${done}/${total} steps done · ${timeAgo(p.updatedAt)}\n  ID: ${p._id}`);
      }
      return { content: [{ type: "text" as const, text: `## Plans (${plans.length})\n\n${lines.join("\n\n")}\n\nUse update_plan(noteId, completeSteps=[...]) to tick steps off.` }] };
    },
  );

  tool(
    "update_plan",
    "Update plan progress as you work — mark steps done the moment they're completed, add newly-discovered steps, or append notes. Steps are numbered from 1 in checklist order.",
    {
      noteId:          z.string().min(1).describe("Plan note ID (from save_plan or list_plans)"),
      completeSteps:   z.array(z.number().int().min(1)).default([]).describe("1-based step numbers to mark done"),
      uncompleteSteps: z.array(z.number().int().min(1)).default([]).describe("1-based step numbers to re-open"),
      addSteps:        z.array(z.string()).default([]).describe("New steps to append as unchecked items"),
      notes:           z.string().default("").describe("Markdown to append to the plan's Notes section"),
    },
    async ({ noteId, completeSteps, uncompleteSteps, addSteps, notes }) => {
      const { Note, NoteBlock } = await db();
      const note = await Note.findOne({ _id: noteId, userId: ctx.userId });
      if (!note) return { content: [{ type: "text" as const, text: `Plan not found (or not yours): ${noteId}` }] };

      const blocks = await NoteBlock.find({ noteId }).sort({ order: 1 }).select("content").lean();
      let body = blocks.map(b => b.content).join("\n\n");

      // Toggle checklist items by 1-based position
      let idx = 0;
      body = body.split("\n").map(line => {
        const m = line.match(/^(\s*)- \[( |x)\] (.*)$/i);
        if (!m) return line;
        idx += 1;
        if (completeSteps.includes(idx))   return `${m[1]}- [x] ${m[3]}`;
        if (uncompleteSteps.includes(idx)) return `${m[1]}- [ ] ${m[3]}`;
        return line;
      }).join("\n");

      if (addSteps.length > 0) {
        const lines = body.split("\n");
        let lastIdx = -1;
        lines.forEach((l, i) => { if (/^\s*- \[( |x)\]/i.test(l)) lastIdx = i; });
        const newItems = addSteps.map((st: string) => `- [ ] ${st}`);
        if (lastIdx >= 0) lines.splice(lastIdx + 1, 0, ...newItems);
        else lines.push("", ...newItems);
        body = lines.join("\n");
      }

      if (notes.trim()) {
        body += body.includes("## Notes") ? `\n\n${notes.trim()}` : `\n\n## Notes\n\n${notes.trim()}`;
      }

      await NoteBlock.deleteMany({ noteId });
      const chunks = splitMarkdownChunks(body, 2000);
      await NoteBlock.insertMany(chunks.map((text, i) => ({
        noteId, spaceId: note.spaceId, userId: ctx.userId, order: i, content: text,
      })));
      await Note.updateOne({ _id: noteId }, { preview: body.replace(/^# .*\n/, "").slice(0, 200) });

      const done  = (body.match(/^- \[x\]/gim) ?? []).length;
      const total = done + (body.match(/^- \[ \]/gm) ?? []).length;
      const remaining = body.split("\n").filter(l => /^\s*- \[ \]/.test(l)).slice(0, 5).map(l => l.replace(/^\s*- \[ \] /, "• ")).join("\n");
      return {
        content: [{
          type: "text" as const,
          text: `✅ Plan updated: ${done}/${total} steps done.` + (remaining ? `\n\nNext up:\n${remaining}` : "\n\n🎉 All steps complete — consider save_chat to record the outcome."),
        }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // delete_rule
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
    "delete_rule",
    "Deactivate a saved rule that no longer applies (soft delete — it stops loading at startup but stays auditable). Use save_rule with the same title to change a rule instead.",
    { title: z.string().min(1).describe("Exact rule title (see list_rules)") },
    async ({ title }) => {
      const { ContextRule } = await db();
      const doc = await ContextRule.findOneAndUpdate({ userId: ctx.userId, title }, { isActive: false });
      if (!doc) return { content: [{ type: "text" as const, text: `Rule not found: "${title}" — check list_rules for exact titles.` }] };
      return { content: [{ type: "text" as const, text: `🗑️ Rule deactivated: "${title}". It will no longer load at session start.` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // list_tasks / create_task / update_task
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
    "list_tasks",
    "List tasks on the team board (org-wide, same view as the web app). Filter by status or just your own.",
    {
      status: z.enum(["todo","in_progress","done","cancelled"]).optional(),
      mine:   z.boolean().default(false).describe("Only tasks created by or assigned to you"),
      limit:  z.number().int().min(1).max(50).default(20),
    },
    async ({ status, mine, limit }) => {
      const { Task } = await db();
      const uid = ctx.userId;
      const base: any = ctx.orgId
        ? { $or: [{ orgId: ctx.orgId }, { orgId: { $exists: false }, userId: uid }] }
        : { $or: [{ userId: uid }, { assigneeId: uid }] };
      const filter: any = mine
        ? { $and: [base, { $or: [{ userId: uid }, { assigneeId: uid }] }] }
        : base;
      if (status) filter.status = status;

      const tasks = await Task.find(filter)
        .sort({ status: 1, priority: -1, createdAt: -1 }).limit(limit)
        .populate("assigneeId", "name email").lean();

      if (tasks.length === 0) return { content: [{ type: "text" as const, text: "No matching tasks." }] };
      const text = tasks.map((t: any) => {
        const assignee = t.assigneeId && typeof t.assigneeId === "object"
          ? (t.assigneeId.name || t.assigneeId.email) : null;
        return `• [${t.status}] **${t.title}** (${t.priority})${assignee ? ` — ${assignee}` : ""}${t.dueDate ? ` · due ${timeAgo(t.dueDate)}` : ""}\n  ID: ${t._id}`;
      }).join("\n");
      return { content: [{ type: "text" as const, text: `## Tasks (${tasks.length})\n\n${text}` }] };
    },
  );

  tool(
    "create_task",
    "Create a task on the team board — e.g. follow-up work discovered during a session. Assign to a teammate by email, or leave it assigned to yourself.",
    {
      title:         z.string().min(1).max(300),
      description:   z.string().default("").describe("Optional detail in Markdown — context, acceptance criteria, links"),
      priority:      z.enum(["low","medium","high","urgent"]).default("medium"),
      dueDate:       z.string().optional().describe("ISO date, e.g. 2026-08-01"),
      assigneeEmail: z.string().optional().describe("Teammate's email — must be a member of your org; omit to assign to yourself"),
      tags:          z.array(z.string()).default([]),
    },
    async ({ title, description, priority, dueDate, assigneeEmail, tags }) => {
      const { Task, User, Membership } = await db();
      const uid = ctx.userId;

      let assigneeId: any = uid;
      let assigneeLabel = "you";
      if (assigneeEmail) {
        const assignee: any = await User.findOne({ email: assigneeEmail.toLowerCase().trim() }).select("name email").lean();
        if (!assignee) return { content: [{ type: "text" as const, text: `No user found with email ${assigneeEmail}.` }] };
        if (!ctx.orgId) return { content: [{ type: "text" as const, text: "You have no organization — you can only create tasks for yourself." }] };
        const member = await Membership.findOne({ orgId: ctx.orgId, userId: assignee._id }).lean();
        if (!member) return { content: [{ type: "text" as const, text: `${assigneeEmail} is not a member of your organization.` }] };
        assigneeId = assignee._id;
        assigneeLabel = assignee.name || assignee.email;
      }

      const task = await Task.create({
        userId: uid,
        orgId: ctx.orgId ?? undefined,
        assigneeId,
        title,
        description,
        priority,
        status: "todo",
        dueDate: dueDate ? new Date(dueDate) : undefined,
        tags,
      });

      return { content: [{ type: "text" as const, text: `✅ Task created and assigned to ${assigneeLabel}: "${title}" (${priority})\nID: ${task._id}\n\nIt is now visible on the team's task board.` }] };
    },
  );

  tool(
    "update_task",
    "Update a task on the team board — move it to done when the user confirms the work is complete, reassign it, or edit fields.",
    {
      taskId:        z.string().min(1),
      status:        z.enum(["todo","in_progress","done","cancelled"]).optional(),
      title:         z.string().max(300).optional(),
      priority:      z.enum(["low","medium","high","urgent"]).optional(),
      dueDate:       z.string().optional().describe("ISO date; empty string clears it"),
      assigneeEmail: z.string().optional().describe("Reassign to this org member's email"),
    },
    async ({ taskId, status, title, priority, dueDate, assigneeEmail }) => {
      const { Task, User, Membership } = await db();
      const uid = ctx.userId;

      const upd: any = {};
      if (title    !== undefined) upd.title    = title;
      if (priority !== undefined) upd.priority = priority;
      if (status   !== undefined) {
        upd.status = status;
        if (status === "done") upd.completedAt = new Date();
        else upd.$unset = { completedAt: "" };
      }
      if (dueDate !== undefined) {
        if (dueDate === "") upd.$unset = { ...upd.$unset, dueDate: "" };
        else upd.dueDate = new Date(dueDate);
      }
      if (assigneeEmail) {
        const assignee: any = await User.findOne({ email: assigneeEmail.toLowerCase().trim() }).select("_id").lean();
        if (!assignee) return { content: [{ type: "text" as const, text: `No user found with email ${assigneeEmail}.` }] };
        if (ctx.orgId) {
          const member = await Membership.findOne({ orgId: ctx.orgId, userId: assignee._id }).lean();
          if (!member) return { content: [{ type: "text" as const, text: `${assigneeEmail} is not a member of your organization.` }] };
        }
        upd.assigneeId = assignee._id;
      }
      if (Object.keys(upd).length === 0) {
        return { content: [{ type: "text" as const, text: "Nothing to update — pass at least one field." }] };
      }

      const scope: any = ctx.orgId
        ? { $or: [{ orgId: ctx.orgId }, { orgId: { $exists: false }, userId: uid }] }
        : { $or: [{ userId: uid }, { assigneeId: uid }] };
      const task = await Task.findOneAndUpdate({ _id: taskId, ...scope }, upd, { new: true }).lean();
      if (!task) return { content: [{ type: "text" as const, text: `Task not found (or not in your org): ${taskId}` }] };

      return { content: [{ type: "text" as const, text: `✅ Task updated: "${task.title}" → [${task.status}] (${task.priority})` }] };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // list_board_items / list_sprints / update_board_item / create_board_item
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
    "list_board_items",
    "List Azure Boards work items (Epics, Features, User Stories, Tasks, Bugs...) as a hierarchy. Live from Azure DevOps.",
    {
      project: z.string().optional().describe("Azure DevOps project name; omit to auto-resolve when you only have one"),
      team: z.string().optional().describe("Team name, used for sprint resolution; omit to use the project's first team"),
      sprint: z.string().optional().describe('"current" for the active sprint, "backlog" for unscheduled items, or an iteration name/path'),
      mine: z.boolean().default(false).describe("Only items assigned to you (reliable only when your Azure identity resolves from the PAT)"),
      types: z.array(z.string()).optional().describe('Filter by work item type, e.g. ["Task", "Bug"]'),
      include_completed: z.boolean().default(false).describe("Include Completed/Removed items"),
    },
    async ({ project, team, sprint, mine, types, include_completed }) => {
      const bc = await boardsClient();
      if (!bc) return { content: [{ type: "text" as const, text: BOARDS_NOT_CONNECTED }] };
      const { client, org, pat } = bc;

      try {
        const resolvedProject = await resolveProject(client, project);
        if (typeof resolvedProject !== "string") return resolvedProject;

        let iterationPath: string | undefined;
        let sprintLabel = "";
        const notes: string[] = [];

        if (sprint === "current") {
          const resolvedTeam = await resolveTeam(client, resolvedProject, team);
          if (typeof resolvedTeam !== "string") return resolvedTeam;
          const iterations = await client.listIterations(resolvedProject, resolvedTeam);
          const current = iterations.find((it) => it.timeFrame === "current");
          if (current) {
            iterationPath = current.path;
            sprintLabel = current.name;
          } else {
            notes.push(`No current sprint found for team "${resolvedTeam}" — showing all items instead.`);
          }
        } else if (sprint === "backlog") {
          sprintLabel = "Backlog";
        } else if (sprint) {
          const resolvedPath = await resolveSprintPath(client, resolvedProject, sprint, team);
          if (typeof resolvedPath !== "string") return resolvedPath;
          iterationPath = resolvedPath;
          sprintLabel = sprint;
        }

        let assignedTo: string | undefined;
        if (mine) {
          const identity = await resolveMyAzureIdentity(org, pat);
          if (identity) {
            assignedTo = identity;
          } else {
            notes.push('Could not resolve your Azure identity from the PAT — "mine" filter was skipped.');
          }
        }

        const queryOpts: QueryWorkItemsOpts = {
          project: resolvedProject,
          iterationPath,
          assignedTo,
          types: types && types.length > 0 ? types : undefined,
          includeCompleted: include_completed,
        };
        let items: BoardItem[] = await client.queryWorkItems(queryOpts);

        if (sprint === "backlog") {
          items = items.filter((it) => it.iterationPath === resolvedProject);
        }

        const total = items.length;
        let truncatedNote = "";
        if (total > 150) {
          items = items.slice(0, 150);
          truncatedNote = `\n\n…truncated — showing 150 of ${total} items.`;
        }

        const lines: string[] = [];
        renderBoardTree(buildTree(items), 0, lines);

        const headerParts = [`**Project:** ${resolvedProject}`];
        if (sprintLabel) headerParts.push(`**Sprint:** ${sprintLabel}`);
        headerParts.push(`**Count:** ${items.length}`);

        const text =
          `## Azure Boards items\n\n${headerParts.join(" · ")}\n` +
          (notes.length > 0 ? `\n${notes.join("\n")}\n` : "") +
          `\n${lines.join("\n") || "(no items match)"}${truncatedNote}`;

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatAzureError(err) }] };
      }
    },
  );

  tool(
    "list_sprints",
    "List sprints (iterations) for an Azure Boards team, with current/past/future time frames.",
    {
      project: z.string().optional().describe("Azure DevOps project name; omit to auto-resolve when you only have one"),
      team: z.string().optional().describe("Team name; omit to use the project's first team"),
    },
    async ({ project, team }) => {
      const bc = await boardsClient();
      if (!bc) return { content: [{ type: "text" as const, text: BOARDS_NOT_CONNECTED }] };
      const { client } = bc;

      try {
        const resolvedProject = await resolveProject(client, project);
        if (typeof resolvedProject !== "string") return resolvedProject;
        const resolvedTeam = await resolveTeam(client, resolvedProject, team);
        if (typeof resolvedTeam !== "string") return resolvedTeam;

        const iterations = await client.listIterations(resolvedProject, resolvedTeam);
        if (iterations.length === 0) {
          return { content: [{ type: "text" as const, text: "This team has no sprints configured — work items live in the backlog." }] };
        }

        const rows = iterations
          .map((it) => `| ${it.name} | ${it.path} | ${it.timeFrame} | ${it.startDate ?? "—"} – ${it.finishDate ?? "—"} |`)
          .join("\n");
        const text =
          `## Sprints — ${resolvedProject} / ${resolvedTeam}\n\n` +
          `| Name | Path | Time frame | Dates |\n|---|---|---|---|\n${rows}`;

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatAzureError(err) }] };
      }
    },
  );

  tool(
    "get_board_item",
    "Full detail of one Azure Boards work item: description, state, sprint, assignee, parent, direct children, and recent comments. Live from Azure DevOps.",
    {
      id: z.number().int().describe("Work item ID"),
      project: z.string().optional().describe("Azure DevOps project name; omit to auto-resolve when you only have one"),
    },
    async ({ id, project }) => {
      const bc = await boardsClient();
      if (!bc) return { content: [{ type: "text" as const, text: BOARDS_NOT_CONNECTED }] };
      const { client } = bc;

      try {
        const resolvedProject = await resolveProject(client, project);
        if (typeof resolvedProject !== "string") return resolvedProject;

        const [item] = await client.getWorkItems(resolvedProject, [id]);
        if (!item) {
          return { content: [{ type: "text" as const, text: `Work item #${id} not found in project "${resolvedProject}".` }] };
        }

        const [parent, children, comments] = await Promise.all([
          item.parentId !== undefined
            ? client.getWorkItems(resolvedProject, [item.parentId]).then((r) => r[0] ?? null).catch(() => null)
            : Promise.resolve(null),
          client.queryWorkItems({ project: resolvedProject, parentId: id }).catch(() => [] as BoardItem[]),
          client.getWorkItemComments(resolvedProject, id, 5).catch(() => [] as BoardComment[]),
        ]);

        const lines: string[] = [`## #${item.id} [${item.type}] ${item.title}`, ""];
        lines.push(`- **State:** ${item.state} (${item.stateCategory})`);
        lines.push(`- **Sprint:** ${item.iterationPath.split("\\").pop() || "—"}`);
        lines.push(`- **Assignee:** ${item.assignee ? `${item.assignee.displayName} (${item.assignee.uniqueName})` : "Unassigned"}`);
        if (item.priority !== undefined) lines.push(`- **Priority:** ${item.priority}`);
        if (item.tags.length > 0) lines.push(`- **Tags:** ${item.tags.join(", ")}`);
        if (parent) lines.push(`- **Parent:** #${parent.id} [${parent.type}] ${parent.title} — ${parent.state}`);
        lines.push(`- **URL:** ${item.url}`);
        if (item.description) lines.push("", "### Description", "", item.description);
        if (children.length > 0) {
          lines.push("", `### Children (${children.length})`, "");
          for (const c of children) {
            lines.push(`- #${c.id} [${c.type}] ${c.title} — ${c.state}${c.assignee ? ` (${c.assignee.displayName})` : ""}`);
          }
        }
        if (comments.length > 0) {
          lines.push("", "### Recent comments", "");
          for (const cm of comments) {
            lines.push(`- **${cm.createdBy?.displayName ?? "Unknown"}** (${cm.createdDate.slice(0, 10)}): ${cm.text.slice(0, 300)}`);
          }
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatAzureError(err) }] };
      }
    },
  );

  tool(
    "update_board_item",
    "Update an Azure Boards work item live: change state, move to another sprint, reassign, retitle, or set priority.",
    {
      id: z.number().int().describe("Work item ID"),
      project: z.string().optional().describe("Azure DevOps project name; omit to auto-resolve when you only have one"),
      state: z.string().optional().describe('New state, e.g. "Active", "Resolved", "Closed"'),
      sprint: z.string().optional().describe("Iteration name or full path to move this item to"),
      assignee_email: z.string().optional().describe('Assignee email/unique name; "" or "none" unassigns'),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description (plain text or HTML)"),
      priority: z.number().int().min(1).max(4).optional(),
      team: z.string().optional().describe("Team name, used only to resolve `sprint` by name"),
    },
    async ({ id, project, state, sprint, assignee_email, title, description, priority, team }) => {
      const bc = await boardsClient();
      if (!bc) return { content: [{ type: "text" as const, text: BOARDS_NOT_CONNECTED }] };
      const { client } = bc;

      try {
        const resolvedProject = await resolveProject(client, project);
        if (typeof resolvedProject !== "string") return resolvedProject;

        const patch: UpdateWorkItemPatch = {};
        if (title !== undefined) patch.title = title;
        if (description !== undefined) patch.description = description;
        if (state !== undefined) patch.state = state;
        if (priority !== undefined) patch.priority = priority;
        if (assignee_email !== undefined) {
          patch.assignee = assignee_email === "" || assignee_email.toLowerCase() === "none" ? null : assignee_email;
        }
        if (sprint !== undefined) {
          const resolvedSprint = await resolveSprintPath(client, resolvedProject, sprint, team);
          if (typeof resolvedSprint !== "string") return resolvedSprint;
          patch.iterationPath = resolvedSprint;
        }

        if (Object.keys(patch).length === 0) {
          return { content: [{ type: "text" as const, text: "Nothing to update — pass at least one field (state, sprint, assignee_email, title, description, priority)." }] };
        }

        const updated = await client.updateWorkItem(resolvedProject, id, patch);
        const sprintName = updated.iterationPath.split("\\").pop();
        return {
          content: [{
            type: "text" as const,
            text: `✅ #${updated.id} ${updated.title} → ${updated.state} (${sprintName}), ${updated.url}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatAzureError(err) }] };
      }
    },
  );

  tool(
    "create_board_item",
    "Create a work item in Azure Boards (Task, Bug, User Story, ...), optionally under a parent (e.g. a Task under a User Story).",
    {
      title: z.string().min(1),
      type: z.string().min(1).describe('Work item type, e.g. "Task", "Bug", "User Story"'),
      project: z.string().optional().describe("Azure DevOps project name; omit to auto-resolve when you only have one"),
      description: z.string().optional().describe("Plain text or HTML description"),
      parent_id: z.number().int().optional().describe("Parent work item ID to link under (e.g. a User Story)"),
      sprint: z.string().optional().describe("Iteration name or full path"),
      assignee_email: z.string().optional(),
      priority: z.number().int().min(1).max(4).optional(),
      team: z.string().optional().describe("Team name, used only to resolve `sprint` by name"),
    },
    async ({ title, type, project, description, parent_id, sprint, assignee_email, priority, team }) => {
      const bc = await boardsClient();
      if (!bc) return { content: [{ type: "text" as const, text: BOARDS_NOT_CONNECTED }] };
      const { client } = bc;

      try {
        const resolvedProject = await resolveProject(client, project);
        if (typeof resolvedProject !== "string") return resolvedProject;

        const validTypes = await client.getWorkItemTypes(resolvedProject);
        const match = validTypes.find((t) => t.name.toLowerCase() === type.toLowerCase());
        if (!match) {
          const names = validTypes.map((t) => t.name).join(", ");
          return { content: [{ type: "text" as const, text: `"${type}" is not a valid work item type for project "${resolvedProject}". Valid types: ${names}` }] };
        }

        const fields: CreateWorkItemFields = { title };
        if (description !== undefined) fields.description = description;
        if (parent_id !== undefined) fields.parentId = parent_id;
        if (assignee_email !== undefined) fields.assignee = assignee_email;
        if (priority !== undefined) fields.priority = priority;
        if (sprint !== undefined) {
          const resolvedSprint = await resolveSprintPath(client, resolvedProject, sprint, team);
          if (typeof resolvedSprint !== "string") return resolvedSprint;
          fields.iterationPath = resolvedSprint;
        }

        const created = await client.createWorkItem(resolvedProject, match.name, fields);
        return {
          content: [{
            type: "text" as const,
            text: `✅ Created #${created.id} [${created.type}] ${created.title}, ${created.url}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatAzureError(err) }] };
      }
    },
  );

  tool(
    "delete_board_item",
    "Delete an Azure Boards work item — moves it to the project's Recycle Bin (recoverable in Azure DevOps, not permanent). Only delete when the user explicitly asks.",
    {
      id: z.number().int().describe("Work item ID"),
      project: z.string().optional().describe("Azure DevOps project name; omit to auto-resolve when you only have one"),
    },
    async ({ id, project }) => {
      const bc = await boardsClient();
      if (!bc) return { content: [{ type: "text" as const, text: BOARDS_NOT_CONNECTED }] };
      const { client } = bc;

      try {
        const resolvedProject = await resolveProject(client, project);
        if (typeof resolvedProject !== "string") return resolvedProject;

        // Fetch first so the confirmation names the item, and a bad ID fails cleanly.
        const [item] = await client.getWorkItems(resolvedProject, [id]);
        if (!item) {
          return { content: [{ type: "text" as const, text: `Work item #${id} not found in project "${resolvedProject}".` }] };
        }

        await client.deleteWorkItem(resolvedProject, id);
        return {
          content: [{
            type: "text" as const,
            text: `🗑️ Deleted #${item.id} [${item.type}] ${item.title} — moved to the Recycle Bin (recoverable in Azure DevOps).`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatAzureError(err) }] };
      }
    },
  );

  tool(
    "add_board_comment",
    "Add a comment to an Azure Boards work item's discussion — e.g. a progress note or a summary of work just completed.",
    {
      id: z.number().int().describe("Work item ID"),
      text: z.string().min(1).describe("Comment text (plain text or simple HTML)"),
      project: z.string().optional().describe("Azure DevOps project name; omit to auto-resolve when you only have one"),
    },
    async ({ id, text, project }) => {
      const bc = await boardsClient();
      if (!bc) return { content: [{ type: "text" as const, text: BOARDS_NOT_CONNECTED }] };
      const { client } = bc;

      try {
        const resolvedProject = await resolveProject(client, project);
        if (typeof resolvedProject !== "string") return resolvedProject;

        const comment = await client.addWorkItemComment(resolvedProject, id, text);
        const preview = comment.text.length > 120 ? `${comment.text.slice(0, 120)}…` : comment.text;
        return { content: [{ type: "text" as const, text: `💬 Comment added to #${id}: ${preview}` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatAzureError(err) }] };
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // ping
  // ─────────────────────────────────────────────────────────────────────────────
  tool(
    "ping",
    "Health check — confirms MCP transport and auth are working.",
    {},
    async () => ({ content: [{ type: "text" as const, text: `pong — user ${ctx.userId}` }] }),
  );

  return server;
}
