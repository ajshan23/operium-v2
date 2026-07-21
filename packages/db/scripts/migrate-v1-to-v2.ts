/**
 * Operium v1 → v2 data migration.
 *
 * The real v1 data lives in the `test` database on the shared Atlas cluster;
 * the new v2 database is `operiumnew`. Those are the defaults, so the common
 * case is just:
 *
 *   pnpm --filter @operium/db migrate:v1 -- --dry-run        # preview
 *   pnpm --filter @operium/db migrate:v1                     # test → operiumnew
 *
 * Copy mode (default, safe): reads the source database and writes a fully
 * migrated copy into a NEW database. The source is NEVER written to.
 *
 *   pnpm --filter @operium/db migrate:v1 -- --source test --target operiumnew
 *
 * After a copy, run the repo backfill so multi-repo fields are populated:
 *
 *   MONGODB_URI="<cluster-uri>/operiumnew" pnpm --filter @operium/db backfill:cowork-repos
 *
 * In-place mode (destructive; only after the copy has been validated): applies
 * the same transforms inside the source database. Requires an explicit
 * --source — it never assumes the `test` default, so you can't nuke prod by
 * forgetting a flag.
 *
 *   pnpm --filter @operium/db migrate:v1 -- --source test --in-place
 *
 * Flags:
 *   --uri <mongodb-uri>   defaults to MONGODB_URI env (or apps/api/.env)
 *   --source <db>         old database name (default: test; required for --in-place)
 *   --target <db>         new database name (copy mode; default: operiumnew)
 *   --in-place            transform inside the source database instead of copying
 *   --dry-run             report what would happen; write nothing
 *   --copy-orphans        copy v1-only collections (chat, channels, logs…) verbatim
 *   --force               copy mode: allow a non-empty target database
 */

import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import type { Db, Document as MongoDoc } from "mongodb";
import {
  User, Org, Membership, Team, Space, Note, NoteBlock,
  WorkHistory, CoworkSession, CoworkChunk, ContextRule, Task, OTP, Invite,
} from "../src/index.js";

// ─── CLI / env ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function resolveUri(): string {
  if (opt("uri")) return opt("uri")!;
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  // Fall back to apps/api/.env so the script "just works" in this repo
  try {
    const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/api/.env");
    const line = readFileSync(envPath, "utf8").split("\n").find(l => l.startsWith("MONGODB_URI="));
    if (line) return line.slice("MONGODB_URI=".length).trim().replace(/^["']|["']$/g, "");
  } catch { /* fall through */ }
  throw new Error("No MongoDB URI. Pass --uri or set MONGODB_URI.");
}

const IN_PLACE = flag("in-place");
// Copy mode is wired to this project's real databases (test → operiumnew) so
// the common case just works. In-place is destructive, so it never assumes a
// source — you must name it explicitly.
const SOURCE  = opt("source") ?? (IN_PLACE ? undefined : "test");
const TARGET  = IN_PLACE ? SOURCE : (opt("target") ?? "operiumnew");
const DRY     = flag("dry-run");
const ORPHANS = flag("copy-orphans");
const FORCE   = flag("force");

if (!SOURCE) {
  console.error(IN_PLACE
    ? "--in-place is destructive: pass --source <db> explicitly (no default)."
    : "Usage: migrate-v1-to-v2 [--source <old-db>] [--target <new-db>] [--in-place] [--dry-run]");
  process.exit(1);
}
if (IN_PLACE && opt("target")) {
  console.error("--in-place and --target are mutually exclusive.");
  process.exit(1);
}

// ─── Transform helpers ────────────────────────────────────────────────────────

const generateInviteCode = () => {
  const part = () => randomBytes(2).toString("hex").toUpperCase();
  return `OP-${part()}-${part()}`;
};

const CONTEXT_CATEGORY_MAP: Record<string, string> = {
  preference: "general", convention: "coding", adr: "architecture",
  gotcha: "general", pattern: "coding",
};
const CONTEXT_SOURCE_MAP: Record<string, string> = {
  "user-explicit": "manual", "auto-learned": "learned", "ai-inferred": "learned",
};
const COWORK_SOURCES = new Set(["antigravity", "claude-code", "cursor", "system"]);

function workHistorySource(externalId?: string): string {
  if (!externalId)                      return "manual";
  if (externalId.startsWith("az-pr-"))    return "pr";
  if (externalId.startsWith("az-push-"))  return "git";
  if (externalId.startsWith("az-build-")) return "build";
  if (externalId.startsWith("az-"))       return "azure";
  if (externalId.startsWith("github-"))   return "git";
  return "manual"; // custom-* and anything else
}

// Each transform takes a v1 document and returns the v2 document.
// All transforms are idempotent: running them on an already-migrated
// document is a no-op, which is what makes --in-place safe to re-run.

function transformUser(doc: any): any {
  const out = { ...doc };
  if (out.password && !out.passwordHash) out.passwordHash = out.password;
  delete out.password;
  if (!out.geminiApiKey && Array.isArray(out.geminiApiKeys) && out.geminiApiKeys.length > 0) {
    const idx = typeof out.geminiKeyIndex === "number" ? out.geminiKeyIndex : 0;
    out.geminiApiKey = out.geminiApiKeys[idx] ?? out.geminiApiKeys[0];
  }
  delete out.geminiApiKeys;
  delete out.geminiKeyIndex;
  if (out.isVerified === undefined) out.isVerified = true; // existing accounts were live
  if (out.isBlocked === undefined) out.isBlocked = false;
  if (Array.isArray(out.customIntegrations)) {
    out.customIntegrations = out.customIntegrations.map((ci: any) => ({
      ...ci,
      headers: Array.isArray(ci.headers)
        ? Object.fromEntries(ci.headers.filter((h: any) => h?.key).map((h: any) => [h.key, h.value ?? ""]))
        : ci.headers,
    }));
  }
  // v1 preferences carried canvas theming that v2 dropped; v2 adds
  // shareCoworkByDefault. Keep editWindowHours, set the v2 default for sharing
  // (raw inserts bypass Mongoose defaults, so write both fields explicitly).
  out.preferences = {
    editWindowHours: out.preferences?.editWindowHours ?? 48,
    shareCoworkByDefault: true,
  };
  delete out.apiKeys;
  delete out.orgId; // org membership now lives in the memberships collection
  return out;
}

function transformOrg(doc: any): any {
  const out = { ...doc };
  if (!out.inviteCode) out.inviteCode = generateInviteCode();
  delete out.createdBy; // consumed by membership creation
  return out;
}

function transformContextRule(doc: any): any {
  const out = { ...doc };
  if (out.content !== undefined && out.rule === undefined) out.rule = out.content;
  delete out.content;
  if (out.category && CONTEXT_CATEGORY_MAP[out.category]) out.category = CONTEXT_CATEGORY_MAP[out.category];
  if (out.source && CONTEXT_SOURCE_MAP[out.source]) out.source = CONTEXT_SOURCE_MAP[out.source];
  if (out.timesApplied === undefined) out.timesApplied = 0;
  // v1 and v2 share the personal|team scope enum, so preserve team-sharing
  // intent — but a "team" rule needs an org to be visible in v2; downgrade
  // orphaned team rules to personal rather than hide them entirely.
  if (out.scope !== "personal" && out.scope !== "team") out.scope = "personal";
  if (out.scope === "team" && !out.orgId) out.scope = "personal";
  if (!out.orgId) delete out.orgId;
  delete out.confidence;
  delete out.supersededBy;
  delete out.projectId;
  return out;
}

function transformCoworkSession(doc: any, userOrg: Map<string, any>): any {
  const out = { ...doc };
  const src = String(out.source ?? "").toLowerCase();
  out.source = COWORK_SOURCES.has(src) ? src : "system";
  if (!out.orgId) {
    const orgId = userOrg.get(String(out.userId));
    if (orgId) out.orgId = orgId; else delete out.orgId;
  }
  delete out.projectId;
  return out;
}

function transformCoworkChunk(doc: any, userOrg: Map<string, any>): any {
  const out = { ...doc };
  if (!out.orgId) {
    const orgId = userOrg.get(String(out.userId));
    if (orgId) out.orgId = orgId; else delete out.orgId;
  }
  // v2 chunks carry a kind; everything v1 saved was an incremental checkpoint.
  if (!out.kind) out.kind = "checkpoint";
  // CRITICAL: the embed worker's CoworkChunk query is
  //   { embeddingDirty: true, embeddingAttempts: { $lt: MAX } }
  // A missing embeddingAttempts (v1 has no such field) fails the $lt clause, so
  // a dirty v1 chunk would NEVER get embedded. Seed it to 0 so it's pickable.
  // v1's embedding/embeddingDirty are preserved as-is (same 768-dim Gemini
  // space), so already-embedded chunks stay done and searchable immediately.
  if (out.embeddingAttempts === undefined) out.embeddingAttempts = 0;
  delete out.projectId;
  return out;
}

// v1 stored NoteBlock embeddings in a separate `noteblockchunks` collection
// (dropped in v2, which embeds the block directly). Migrated blocks therefore
// have no embedding yet — seed the embed-worker fields so they get picked up
// and re-embedded, and drop the dead orgId.
function transformNoteBlock(doc: any): any {
  const out = { ...doc };
  delete out.orgId;
  out.embeddingDirty = true;
  if (out.embeddingAttempts === undefined) out.embeddingAttempts = 0;
  return out;
}

function transformWorkHistory(doc: any): any {
  const out = { ...doc };
  if (!out.source) out.source = workHistorySource(out.externalId);
  delete out.linkedNoteIds;
  if (!out.orgId) delete out.orgId;
  return out;
}

const stripFields = (fields: string[]) => (doc: any) => {
  const out = { ...doc };
  for (const f of fields) delete out[f];
  return out;
};

// ─── Collection plan ──────────────────────────────────────────────────────────

type Transform = (doc: any) => any;

const V1_ORPHANS = [
  "chatsessions", "messages", "knowledgechunks", "noteblockchunks",
  "channels", "channelmessages", "mcpusagelogs", "mytasks",
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function migrateCollection(
  srcDb: Db, dstDb: Db, name: string, tx: Transform, stats: Record<string, number>
) {
  const docs = await srcDb.collection(name).find({}).toArray();
  stats[name] = docs.length;
  if (DRY || docs.length === 0) return;

  const migrated = docs.map(tx);
  if (IN_PLACE) {
    const bulk = migrated.map((d: MongoDoc) => ({
      replaceOne: { filter: { _id: d._id }, replacement: d },
    }));
    await dstDb.collection(name).bulkWrite(bulk as any, { ordered: false });
  } else {
    await dstDb.collection(name).insertMany(migrated as MongoDoc[], { ordered: false });
  }
}

async function main() {
  const uri = resolveUri();
  const conn = await mongoose.createConnection(uri).asPromise();
  const srcDb = conn.useDb(SOURCE!, { useCache: false }).db as unknown as Db;
  const dstDb = conn.useDb(TARGET!, { useCache: false }).db as unknown as Db;

  console.log(`\nMode:   ${IN_PLACE ? "IN-PLACE (source is modified!)" : "copy"}${DRY ? " + DRY-RUN (no writes)" : ""}`);
  console.log(`Source: ${SOURCE}`);
  console.log(`Target: ${TARGET}\n`);

  const srcCollections = (await srcDb.listCollections().toArray()).map(c => c.name);
  if (srcCollections.length === 0) throw new Error(`Source database "${SOURCE}" is empty or does not exist.`);

  if (!IN_PLACE && !DRY && !FORCE) {
    const existing = await dstDb.listCollections().toArray();
    if (existing.length > 0) {
      throw new Error(`Target database "${TARGET}" is not empty. Pass --force to write into it anyway.`);
    }
  }

  const stats: Record<string, number> = {};
  const warnings: string[] = [];

  // 1. Load v1 users & orgs once — needed to derive memberships and org backfills
  const v1Users = await srcDb.collection("users").find({}).toArray();
  const v1Orgs  = await srcDb.collection("orgs").find({}).toArray();
  const userOrg = new Map<string, any>(
    v1Users.filter(u => u.orgId).map(u => [String(u._id), u.orgId])
  );

  // 2. Orgs (generate inviteCode)
  await migrateCollection(srcDb, dstDb, "orgs", transformOrg, stats);

  // 3. Memberships derived from User.orgId + Org.createdBy
  const orgCreator = new Map(v1Orgs.map(o => [String(o._id), String(o.createdBy ?? "")]));
  const memberships = v1Users
    .filter(u => u.orgId)
    .map(u => ({
      userId: u._id,
      orgId:  u.orgId,
      role:   orgCreator.get(String(u.orgId)) === String(u._id) ? "owner" : "member",
      createdAt: u.createdAt ?? new Date(),
      _email: u.email, // for reporting only; stripped before insert
    }));
  // Orgs whose creator is not a member: promote the earliest-joined member to owner
  for (const o of v1Orgs) {
    const orgMembers = memberships.filter(m => String(m.orgId) === String(o._id));
    if (orgMembers.length > 0 && !orgMembers.some(m => m.role === "owner")) {
      const oldest = orgMembers.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
      oldest.role = "owner";
      warnings.push(`Org "${o.name}": creator is not a member — promoted earliest member ${oldest._email} to owner.`);
    }
  }
  memberships.forEach(m => delete (m as any)._email);
  stats["memberships (created)"] = memberships.length;
  if (!DRY && memberships.length > 0) {
    if (IN_PLACE) {
      const bulk = memberships.map(m => ({
        updateOne: {
          filter: { userId: m.userId, orgId: m.orgId },
          update: { $setOnInsert: m },
          upsert: true,
        },
      }));
      await dstDb.collection("memberships").bulkWrite(bulk as any, { ordered: false });
    } else {
      await dstDb.collection("memberships").insertMany(memberships as MongoDoc[], { ordered: false });
    }
  }

  // 4. Transformed collections
  await migrateCollection(srcDb, dstDb, "users", transformUser, stats);
  await migrateCollection(srcDb, dstDb, "contextrules", transformContextRule, stats);
  await migrateCollection(srcDb, dstDb, "coworksessions", d => transformCoworkSession(d, userOrg), stats);
  await migrateCollection(srcDb, dstDb, "coworkchunks",  d => transformCoworkChunk(d, userOrg), stats);
  await migrateCollection(srcDb, dstDb, "workhistories", transformWorkHistory, stats);

  // 5. Compatible collections (strip dead v1 fields, otherwise verbatim)
  await migrateCollection(srcDb, dstDb, "spaces",     stripFields(["orgId"]), stats);
  await migrateCollection(srcDb, dstDb, "notes",      stripFields(["orgId", "checklist"]), stats);
  await migrateCollection(srcDb, dstDb, "noteblocks", transformNoteBlock, stats);

  // 6. v1-only collections
  for (const name of V1_ORPHANS) {
    if (!srcCollections.includes(name)) continue;
    const count = await srcDb.collection(name).countDocuments();
    if (ORPHANS && !IN_PLACE) {
      await migrateCollection(srcDb, dstDb, name, d => d, stats);
      stats[`${name} (orphan, copied verbatim)`] = stats[name] ?? count;
      delete stats[name];
    } else {
      stats[`${name} (orphan, NOT ${IN_PLACE ? "touched" : "copied"})`] = count;
    }
  }

  // 6b. No silent drops: warn about any source collection the plan neither
  // migrates nor knows as an orphan (e.g. a stray `organizations`, `kgedges`).
  const HANDLED = new Set<string>([
    "orgs", "memberships", "users", "contextrules", "coworksessions",
    "coworkchunks", "workhistories", "spaces", "notes", "noteblocks",
    ...V1_ORPHANS,
  ]);
  for (const name of srcCollections) {
    if (HANDLED.has(name) || name.startsWith("system.")) continue;
    const count = await srcDb.collection(name).countDocuments();
    warnings.push(`Unmapped source collection "${name}" (${count} docs) — NOT migrated. Add it to the plan if it holds data you need.`);
  }

  // 7. Build v2 indexes on the target (drops stale ones, creates new ones)
  if (!DRY) {
    const targetConn = conn.useDb(TARGET!, { useCache: false });
    const models = { User, Org, Membership, Team, Space, Note, NoteBlock, WorkHistory, CoworkSession, CoworkChunk, ContextRule, Task, OTP, Invite };
    for (const [name, model] of Object.entries(models)) {
      const bound = targetConn.model(name, (model as any).schema);
      await bound.syncIndexes();
    }
    console.log("Indexes synced to v2 schemas.\n");
  }

  // 8. Report
  console.log("─".repeat(60));
  console.log(DRY ? "DRY RUN — would migrate:" : "Migrated:");
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(45)} ${v}`);
  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }
  console.log("─".repeat(60));

  await conn.close();
  process.exit(0);
}

main().catch(err => {
  console.error("\n🔴 Migration failed:", err.message);
  process.exit(1);
});
