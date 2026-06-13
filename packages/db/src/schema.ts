import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/**
 * Postgres `tsvector` column for full-text search. Drizzle has no native helper,
 * so we declare a custom type; the column is populated as a generated column in SQL.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ── Enums ───────────────────────────────────────────────────────────────────

export const intentEnum = pgEnum("intent", [
  "bug-fix",
  "feature",
  "refactor",
  "investigation",
  "planning",
  "review",
  "docs",
]);

export const outcomeEnum = pgEnum("outcome", [
  "fixed",
  "implemented",
  "explored",
  "blocked",
  "abandoned",
  "partial",
]);

export const ruleCategoryEnum = pgEnum("rule_category", [
  "preference",
  "convention",
  "adr",
  "gotcha",
  "pattern",
]);

export const ruleScopeEnum = pgEnum("rule_scope", ["personal", "team"]);

export const ruleSourceEnum = pgEnum("rule_source", [
  "user-explicit",
  "auto-learned",
  "ai-inferred",
]);

export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "member"]);

export const authProviderEnum = pgEnum("auth_provider", ["email", "google", "github"]);

// ── Tenancy & identity ───────────────────────────────────────────────────────

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  authProvider: authProviderEnum("auth_provider").notNull().default("email"),
  githubId: text("github_id").unique(),
  googleId: text("google_id").unique(),
  isSuperUser: boolean("is_super_user").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgMembers = pgTable(
  "org_members",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull().unique(),
    label: text("label"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)],
);

export const geminiKeys = pgTable(
  "gemini_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    encryptedKey: text("encrypted_key").notNull(),
    idx: integer("idx").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gemini_keys_user_idx").on(t.userId)],
);

// ── Memory: cowork sessions + chunks ─────────────────────────────────────────

export const coworkSessions = pgTable(
  "cowork_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    autoSummary: text("auto_summary"), // JSON string: {request, investigated, ...}
    intent: intentEnum("intent"),
    outcome: outcomeEnum("outcome"),
    tags: text("tags").array().notNull().default(sql`'{}'`),
    filesTouched: text("files_touched").array().notNull().default(sql`'{}'`),
    repoUrl: text("repo_url"),
    branch: text("branch"),
    commitSha: text("commit_sha"),
    prUrl: text("pr_url"),
    isShared: boolean("is_shared").notNull().default(false),
    useCount: integer("use_count").notNull().default(0),
    helpfulCount: integer("helpful_count").notNull().default(0),
    notHelpfulCount: integer("not_helpful_count").notNull().default(0),
    // temporal lifecycle (Zep-style bi-temporal, as plain columns)
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    supersededBy: uuid("superseded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sessions_user_created_idx").on(t.userId, t.createdAt),
    index("sessions_org_shared_idx").on(t.orgId, t.isShared, t.createdAt),
    index("sessions_repo_branch_idx").on(t.repoUrl, t.branch, t.createdAt),
    index("sessions_active_idx").on(t.orgId).where(sql`${t.supersededBy} IS NULL`),
  ],
);

export const coworkChunks = pgTable(
  "cowork_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => coworkSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    orgId: uuid("org_id"),
    ord: integer("ord").notNull().default(0),
    text: text("text").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    fts: tsvector("fts").generatedAlwaysAs(
      (): import("drizzle-orm").SQL => sql`to_tsvector('english', ${coworkChunks.text})`,
    ),
    isShared: boolean("is_shared").notNull().default(false),
    embeddingDirty: boolean("embedding_dirty").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chunks_session_hash_idx").on(t.sessionId, t.contentHash),
    index("chunks_session_ord_idx").on(t.sessionId, t.ord),
    index("chunks_dirty_idx").on(t.embeddingDirty),
    index("chunks_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    index("chunks_fts_idx").using("gin", t.fts),
  ],
);

// ── Memory: context rules ────────────────────────────────────────────────────

export const contextRules = pgTable(
  "context_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    scope: ruleScopeEnum("scope").notNull().default("personal"),
    category: ruleCategoryEnum("category").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    confidence: doublePrecision("confidence").notNull().default(1),
    source: ruleSourceEnum("source").notNull().default("user-explicit"),
    tags: text("tags").array().notNull().default(sql`'{}'`),
    isActive: boolean("is_active").notNull().default(true),
    supersededBy: uuid("superseded_by"),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rules_user_active_idx").on(t.userId, t.isActive, t.projectId),
    index("rules_org_scope_idx").on(t.orgId, t.scope, t.isActive, t.projectId),
  ],
);

// ── Observability ────────────────────────────────────────────────────────────

export const mcpUsageLogs = pgTable(
  "mcp_usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id"),
    toolName: text("tool_name").notNull(),
    query: text("query"),
    returnedIds: text("returned_ids").array(),
    tokensReturned: integer("tokens_returned"),
    success: boolean("success").notNull().default(true),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_user_created_idx").on(t.userId, t.createdAt)],
);

// ── Inferred types ───────────────────────────────────────────────────────────

export type Org = typeof orgs.$inferSelect;
export type User = typeof users.$inferSelect;
export type CoworkSession = typeof coworkSessions.$inferSelect;
export type NewCoworkSession = typeof coworkSessions.$inferInsert;
export type CoworkChunk = typeof coworkChunks.$inferSelect;
export type NewCoworkChunk = typeof coworkChunks.$inferInsert;
export type ContextRule = typeof contextRules.$inferSelect;
export type McpUsageLog = typeof mcpUsageLogs.$inferSelect;
