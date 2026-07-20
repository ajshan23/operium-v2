import { z } from "zod";

/** Vector dimensions for Gemini `gemini-embedding-001`. */
export const EMBEDDING_DIM = 768;

// ── Enums (kept in sync with the DB schema) ─────────────────────────────────

export const INTENTS = [
  "bug-fix",
  "feature",
  "refactor",
  "investigation",
  "planning",
  "review",
  "docs",
] as const;
export type Intent = (typeof INTENTS)[number];

export const OUTCOMES = [
  "fixed",
  "implemented",
  "explored",
  "blocked",
  "abandoned",
  "partial",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const RULE_CATEGORIES = [
  "preference",
  "convention",
  "adr",
  "gotcha",
  "pattern",
] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

export const RULE_SCOPES = ["personal", "team"] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

export const RULE_SOURCES = ["user-explicit", "auto-learned", "ai-inferred"] as const;
export type RuleSource = (typeof RULE_SOURCES)[number];

export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Decision returned by the write-time memory pipeline (Mem0 pattern). */
export const MEMORY_DECISIONS = ["ADD", "UPDATE", "SUPERSEDE", "NOOP"] as const;
export type MemoryDecision = (typeof MEMORY_DECISIONS)[number];

// ── API / MCP boundary schemas ──────────────────────────────────────────────

export const checkpointInput = z.object({
  source: z.string().min(1),
  title: z.string().min(1),
  finding: z.string().min(1),
  intent: z.enum(INTENTS).optional(),
  outcome: z.enum(OUTCOMES).optional(),
  tags: z.array(z.string()).optional(),
  repoUrl: z.string().optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  prUrl: z.string().optional(),
  filesTouched: z.array(z.string()).optional(),
});
export type CheckpointInput = z.infer<typeof checkpointInput>;

export const searchInput = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(5),
  maxTokens: z.number().int().positive().default(4000),
  files: z.array(z.string()).optional(),
});
export type SearchInput = z.infer<typeof searchInput>;

/** Structured auto-summary produced by the capture pipeline. */
export const autoSummarySchema = z.object({
  request: z.string(),
  investigated: z.string(),
  learned: z.string(),
  completed: z.string(),
  next_steps: z.string(),
});
export type AutoSummary = z.infer<typeof autoSummarySchema>;

// ─── MCP tool registry ─────────────────────────────────────────────────────────
// Single source of truth for the tools the Operium MCP server exposes.
// Lives here (browser-safe) so the web settings screen renders the real list;
// @operium/mcp imports it to type and register handlers.

export const MCP_TOOL_NAMES = [
  "get_startup_context", "recall_context", "recall_error", "repo_context", "search",
  "create_history", "list_history", "update_history", "delete_history",
  "checkpoint_cowork", "save_chat", "list_cowork", "get_cowork", "cowork_digest",
  "related_cowork", "mark_cowork_used", "delete_cowork", "handoff_session",
  "list_spaces", "list_notes", "get_note", "create_note", "append_note", "update_note", "delete_note",
  "save_plan", "list_plans", "update_plan", "search_notes",
  "save_rule", "list_rules", "learn_correction", "delete_rule",
  "get_experts", "list_tasks", "create_task", "update_task",
  "list_board_items", "list_sprints", "get_board_item", "update_board_item", "create_board_item",
  "delete_board_item", "add_board_comment",
  "pr_context", "sync_git", "generate_standup",
  "whoami", "ping",
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];
export const MCP_TOOL_COUNT = MCP_TOOL_NAMES.length;

/** Display grouping for the web settings screen. Tools not listed in any
 *  group fall into "Other" so newly added tools always render. */
export const MCP_TOOL_GROUPS: { label: string; tools: McpToolName[] }[] = [
  { label: "Memory & Recall",  tools: ["get_startup_context", "recall_context", "recall_error", "repo_context", "search", "get_experts"] },
  { label: "Cowork Sessions",  tools: ["checkpoint_cowork", "save_chat", "list_cowork", "get_cowork", "related_cowork", "cowork_digest", "mark_cowork_used", "delete_cowork", "handoff_session"] },
  { label: "Notes & Plans",    tools: ["list_spaces", "list_notes", "get_note", "create_note", "append_note", "update_note", "delete_note", "search_notes", "save_plan", "list_plans", "update_plan"] },
  { label: "Rules",            tools: ["save_rule", "list_rules", "learn_correction", "delete_rule"] },
  { label: "Tasks",            tools: ["list_tasks", "create_task", "update_task"] },
  { label: "Work History",     tools: ["create_history", "list_history", "update_history", "delete_history", "pr_context", "sync_git", "generate_standup"] },
  { label: "Azure Boards",     tools: ["list_board_items", "list_sprints", "get_board_item", "update_board_item", "create_board_item", "delete_board_item", "add_board_comment"] },
  { label: "Utility",          tools: ["whoami", "ping"] },
];
