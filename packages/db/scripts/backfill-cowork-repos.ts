/**
 * Backfill CoworkSession.repos[] and CoworkChunk.repoKeys from the legacy
 * single-repo fields (repoUrl / branch / commitSha / prUrl).
 *
 *   pnpm --filter @operium/db backfill:cowork-repos -- [--dry-run]
 *
 * Flags:
 *   --uri <mongodb-uri>   defaults to MONGODB_URI env (or apps/api/.env)
 *   --db <name>           database name (defaults to the one in the URI)
 *   --dry-run             report what would happen; write nothing
 *
 * Idempotent: sessions that already have repos[] entries are skipped, and
 * chunk repoKeys are recomputed from their session either way.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { normalizeRepoRefs } from "@operium/core";
import { CoworkSession, CoworkChunk } from "../src/index.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function resolveUri(): string {
  if (opt("uri")) return opt("uri")!;
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  try {
    const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/api/.env");
    const line = readFileSync(envPath, "utf8").split("\n").find(l => l.startsWith("MONGODB_URI="));
    if (line) return line.slice("MONGODB_URI=".length).trim().replace(/^["']|["']$/g, "");
  } catch { /* fall through */ }
  throw new Error("No MongoDB URI. Pass --uri or set MONGODB_URI.");
}

const DRY = flag("dry-run");

async function main() {
  await mongoose.connect(resolveUri(), { dbName: opt("db") });
  console.log(`Connected (db: ${mongoose.connection.name})${DRY ? " [DRY RUN]" : ""}`);

  // ── Sessions: legacy scalars → repos[] ─────────────────────────────────────
  const sessions = await CoworkSession.find({
    repoUrl: { $exists: true, $nin: [null, ""] },
    $or: [{ repos: { $exists: false } }, { repos: { $size: 0 } }],
  }).lean();

  let sessionsUpdated = 0;
  for (const s of sessions) {
    const repos = normalizeRepoRefs([{
      repoUrl:      s.repoUrl!,
      branch:       s.branch || undefined,
      commitSha:    s.commitSha || undefined,
      prUrl:        s.prUrl || undefined,
      filesTouched: s.filesTouched?.length ? s.filesTouched : undefined,
    }]);
    if (!repos.length) {
      console.log(`  skip ${s._id} — unparseable repoUrl: ${s.repoUrl}`);
      continue;
    }
    if (!DRY) await CoworkSession.updateOne({ _id: s._id }, { $set: { repos } });
    sessionsUpdated++;
  }
  console.log(`Sessions backfilled: ${sessionsUpdated}/${sessions.length}`);

  // ── Chunks: stamp repoKeys from their session ──────────────────────────────
  const withRepos = await CoworkSession.find({ "repos.0": { $exists: true } })
    .select("_id repos").lean();

  let chunksUpdated = 0;
  for (const s of withRepos) {
    const repoKeys = [...new Set(s.repos.map(r => r.repoKey))];
    if (DRY) {
      chunksUpdated += await CoworkChunk.countDocuments({
        sessionId: s._id, repoKeys: { $exists: false },
      });
    } else {
      const res = await CoworkChunk.updateMany(
        { sessionId: s._id, repoKeys: { $exists: false } },
        { $set: { repoKeys } },
      );
      chunksUpdated += res.modifiedCount;
    }
  }
  console.log(`Chunks stamped with repoKeys: ${chunksUpdated}`);

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch(err => { console.error(err); process.exit(1); });
