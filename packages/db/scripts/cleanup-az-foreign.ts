/**
 * One-off cleanup for histories polluted by the pre-identity-scoping Azure
 * sync, which wrote the whole org's pushes/PRs/builds into each user's
 * history. Verifies every az-* entry against the Azure API (actual
 * pusher/creator/requester id vs the token owner's id) and deletes the
 * foreign ones. Precise: no window or truncation assumptions. Run once per
 * affected user; the sync's built-in reconcile keeps things clean afterwards.
 *
 *   npx tsx scripts/cleanup-az-foreign.ts --email <email> [--apply]
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { User, WorkHistory } from "../src/index.js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const email = args[args.indexOf("--email") + 1];
if (!email) { console.error("Pass --email <email>"); process.exit(1); }

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/api/.env");
const uri = readFileSync(envPath, "utf8").split("\n").find(l => l.startsWith("MONGODB_URI="))!
  .slice("MONGODB_URI=".length).trim().replace(/^["']|["']$/g, "");

async function az(url: string, token: string): Promise<any | null> {
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${Buffer.from(":" + token).toString("base64")}` },
  });
  if (!res.ok) return null;
  return res.json();
}

await mongoose.connect(uri);
const user = await User.findOne({ email }).select("+azureDevOpsToken azureDevOpsOrg email").lean() as any;
if (!user?.azureDevOpsToken || !user?.azureDevOpsOrg) { console.error("User/token/org not found"); process.exit(1); }
const token = user.azureDevOpsToken, org = user.azureDevOpsOrg;

const conn = await az(`https://dev.azure.com/${org}/_apis/connectiondata`, token);
const myId: string | undefined = conn?.authenticatedUser?.id;
if (!myId) { console.error("Could not resolve identity"); process.exit(1); }
console.log(`User ${email} → Azure identity ${myId}${APPLY ? "  [APPLY]" : "  [DRY RUN]"}`);

const entries = await WorkHistory.find({ userId: user._id, externalId: { $regex: "^az-" } })
  .select("externalId title metadata createdAt").lean();
console.log(`Verifying ${entries.length} az-* entries…`);

const API = "api-version=7.1-preview.1";

// Old v1-synced entries lack metadata.project/repoId — resolve by scanning the
// org's projects (and their repos, matched by name) with caching.
const projectsData = await az(`https://dev.azure.com/${org}/_apis/projects?$top=50&${API}`, token);
const projectNames: string[] = (projectsData?.value ?? []).map((p: any) => p.name);
const repoCache = new Map<string, { id: string; name: string }[]>();
async function reposOf(project: string) {
  if (!repoCache.has(project)) {
    const d = await az(`https://dev.azure.com/${org}/${project}/_apis/git/repositories?${API}`, token);
    repoCache.set(project, (d?.value ?? []).map((r: any) => ({ id: r.id, name: r.name })));
  }
  return repoCache.get(project)!;
}
/** Candidate (project, repoId) pairs for an entry, best-guess first. */
async function repoCandidates(m: any): Promise<{ project: string; repoId: string }[]> {
  if (m.project && m.repoId) return [{ project: m.project, repoId: m.repoId }];
  const out: { project: string; repoId: string }[] = [];
  const wantedRepo = (m.repo ?? "").toLowerCase();
  const projs = m.project ? [m.project] : projectNames;
  for (const p of projs) {
    for (const r of await reposOf(p)) {
      if (!wantedRepo || r.name.toLowerCase() === wantedRepo) out.push({ project: p, repoId: r.id });
    }
  }
  return out;
}

let mine = 0, foreign = 0, unverifiable = 0;
const toDelete: mongoose.Types.ObjectId[] = [];

for (const e of entries) {
  const ext = (e as any).externalId as string;
  const m = (e as any).metadata ?? {};
  let ownerId: string | null | undefined;

  try {
    if (ext.startsWith("az-push-")) {
      for (const c of await repoCandidates(m)) {
        const push = await az(`https://dev.azure.com/${org}/${c.project}/_apis/git/repositories/${c.repoId}/pushes/${ext.slice(8)}?${API}`, token);
        if (push?.pushedBy?.id) { ownerId = push.pushedBy.id; break; }
      }
    } else if (ext.startsWith("az-pr-")) {
      // PR ids are org-unique — resolvable without project/repo
      const pr = await az(`https://dev.azure.com/${org}/_apis/git/pullrequests/${ext.slice(6)}?${API}`, token);
      ownerId = pr?.createdBy?.id;
    } else if (ext.startsWith("az-build-")) {
      for (const p of m.project ? [m.project] : projectNames) {
        const build = await az(`https://dev.azure.com/${org}/${p}/_apis/build/builds/${ext.slice(9)}?${API}`, token);
        const owner = build?.requestedFor ?? build?.requestedBy;
        if (owner?.id) { ownerId = owner.id; break; }
      }
    }
  } catch { /* treat as unverifiable */ }

  if (!ownerId) {
    unverifiable++;
    console.log(`  ?  ${ext}  "${(e as any).title}" (${new Date((e as any).createdAt).toISOString().slice(0, 10)})`);
  } else if (ownerId === myId) {
    mine++;
  } else {
    foreign++;
    toDelete.push((e as any)._id);
    console.log(`  ✗  ${ext}  "${(e as any).title}" — owner ${ownerId}`);
  }
}

console.log(`\nmine: ${mine} · foreign: ${foreign} · unverifiable (kept): ${unverifiable}`);
if (APPLY && toDelete.length) {
  const res = await WorkHistory.deleteMany({ _id: { $in: toDelete } });
  console.log(`Deleted ${res.deletedCount} foreign entries.`);
} else if (toDelete.length) {
  console.log("Dry run — nothing deleted. Re-run with --apply.");
}
await mongoose.disconnect();
