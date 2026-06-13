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
