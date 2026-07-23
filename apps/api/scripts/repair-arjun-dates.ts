/**
 * In-place repair (no deletions): fix createdAt on arjun.das@fantacode.com's
 * az-* history entries. The pre-fix upsert let Mongoose overwrite the real
 * event date with the sync time, so all 1693 entries sit on the sync day.
 * Re-fetches the true dates from Azure (push.date / pr.creationDate /
 * build.finishTime) and $sets createdAt back, with timestamps disabled.
 *
 *   cd apps/api && npx tsx scripts/repair-arjun-dates.ts
 */
import { readFileSync } from "fs";
import mongoose from "mongoose";
import { User, WorkHistory } from "@operium/db";

const uri = readFileSync(new URL("../.env", import.meta.url).pathname, "utf8")
  .split("\n").find(l => l.startsWith("MONGODB_URI="))!
  .slice("MONGODB_URI=".length).trim().replace(/^["']|["']$/g, "");

await mongoose.connect(uri, { dbName: "operiumnew" });
console.log("db:", mongoose.connection.name);

const user = await User.findOne({ email: "arjun.das@fantacode.com" })
  .select("+azureDevOpsToken azureDevOpsOrg").lean() as any;
if (!user?.azureDevOpsToken) { console.error("no token"); process.exit(1); }
const org = user.azureDevOpsOrg, token = user.azureDevOpsToken;

const az = async (url: string) => {
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${Buffer.from(":" + token).toString("base64")}` },
  });
  return res.ok ? res.json() as any : null;
};
const API = "api-version=7.0";
const base = `https://dev.azure.com/${encodeURIComponent(org)}`;

const conn = await az(`${base}/_apis/connectiondata`);
const myId = conn?.authenticatedUser?.id;
if (!myId) { console.error("no identity"); process.exit(1); }

const cutoff = new Date(Date.now() - 3650 * 86400 * 1000).toISOString();

// externalId -> true event date, harvested with the same queries the sync uses
const trueDates = new Map<string, Date>();
// externalId -> PR role details (backfills entries synced before role existed)
const prMeta = new Map<string, { role: "author" | "reviewer"; myVote: number; merged: boolean; title: string }>();

const projectsData = await az(`${base}/_apis/projects?$top=20&${API}`);
for (const p of (projectsData?.value ?? [])) {
  const pName = p.name;
  const reposData = await az(`${base}/${encodeURIComponent(pName)}/_apis/git/repositories?${API}`);
  for (const r of (reposData?.value ?? [])) {
    let skip = 0;
    while (true) {
      const d = await az(`${base}/${encodeURIComponent(pName)}/_apis/git/repositories/${r.id}/pushes?searchCriteria.fromDate=${encodeURIComponent(cutoff)}&searchCriteria.pusherId=${encodeURIComponent(myId)}&$top=100&$skip=${skip}&${API}`);
      const pushes: any[] = d?.value ?? [];
      for (const push of pushes) if (push.date) trueDates.set(`az-push-${push.pushId}`, new Date(push.date));
      if (pushes.length < 100 || skip > 2000) break;
      skip += 100;
    }
    let skipPR = 0;
    while (true) {
      const d = await az(`${base}/${encodeURIComponent(pName)}/_apis/git/repositories/${r.id}/pullrequests?searchCriteria.status=all&searchCriteria.minTime=${encodeURIComponent(cutoff)}&$top=100&$skip=${skipPR}&${API}`);
      const prs: any[] = d?.value ?? [];
      for (const pr of prs) {
        const isAuthor = pr.createdBy?.id === myId;
        const myReview = (pr.reviewers ?? []).find((rv: any) => rv?.id === myId);
        if (!isAuthor && !myReview) continue;
        if (pr.creationDate) trueDates.set(`az-pr-${pr.pullRequestId}`, new Date(pr.creationDate));
        prMeta.set(`az-pr-${pr.pullRequestId}`, {
          role:   isAuthor ? "author" : "reviewer",
          myVote: isAuthor ? 0 : (myReview?.vote ?? 0),
          merged: pr.status === "completed",
          title:  pr.title || `Pull Request #${pr.pullRequestId}`,
        });
      }
      if (prs.length < 100 || skipPR > 1000) break;
      skipPR += 100;
    }
  }
  let cont = "";
  while (true) {
    const res = await fetch(
      `${base}/${encodeURIComponent(pName)}/_apis/build/builds?minTime=${encodeURIComponent(cutoff)}&requestedFor=${encodeURIComponent(myId)}&$top=100${cont ? `&continuationToken=${encodeURIComponent(cont)}` : ""}&${API}`,
      { headers: { Authorization: `Basic ${Buffer.from(":" + token).toString("base64")}` } });
    if (!res.ok) break;
    cont = res.headers.get("x-ms-continuationtoken") || "";
    const d = await res.json() as any;
    for (const b of (d?.value ?? [])) {
      const raw = b.finishTime || b.startTime || b.queueTime;
      if (raw) trueDates.set(`az-build-${b.id}`, new Date(raw));
    }
    if (!cont) break;
  }
  console.log(`harvested through project ${pName} — ${trueDates.size} dates so far`);
}

console.log(`\ntrue dates harvested: ${trueDates.size}`);

// Apply: only touch entries whose createdAt differs by > 1h from the truth
const entries = await WorkHistory.find({ userId: user._id, externalId: { $regex: "^az-" } })
  .select("externalId createdAt").lean() as any[];
console.log(`db entries: ${entries.length}`);

const ops: any[] = [];
let unmatched = 0;
for (const e of entries) {
  const truth = trueDates.get(e.externalId);
  if (!truth) { unmatched++; continue; }
  const $set: any = {};
  if (Math.abs(new Date(e.createdAt).getTime() - truth.getTime()) > 3_600_000) {
    $set.createdAt = truth;
  }
  // Backfill PR role/vote and correct role-blind milestones/titles
  const meta = prMeta.get(e.externalId);
  if (meta) {
    $set["metadata.role"]   = meta.role;
    $set["metadata.myVote"] = meta.myVote;
    $set.isMilestone        = meta.merged && meta.role === "author";
    $set.title              = (meta.role === "reviewer" ? "Reviewed: " : "") + meta.title;
  }
  if (Object.keys($set).length) {
    ops.push({ updateOne: { filter: { _id: e._id }, update: { $set } } });
  }
}
console.log(`to fix: ${ops.length} · already correct: ${entries.length - ops.length - unmatched} · no Azure match (left untouched): ${unmatched}`);

if (ops.length) {
  // Native driver bulkWrite: skips Mongoose's timestamps plugin and the
  // createdAt-immutable cast, both of which silently discard the new date.
  const res = await WorkHistory.collection.bulkWrite(ops, { ordered: false });
  console.log(`modified: ${res.modifiedCount}`);
}

const byMonth = await WorkHistory.aggregate([
  { $match: { userId: user._id, externalId: { $regex: "^az-" } } },
  { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, n: { $sum: 1 } } },
  { $sort: { _id: 1 } },
]);
console.log("\ncreatedAt by month after repair:");
for (const m of byMonth) console.log(`  ${m._id}: ${m.n}`);

await mongoose.disconnect();
