/**
 * READ-ONLY diagnostic: compare what Azure DevOps returns for
 * arjun.das@fantacode.com (using his stored PAT) against what's in Mongo.
 * No writes, no deletes.
 *
 *   cd apps/api && npx tsx scripts/verify-arjun-azure.ts
 */
import { readFileSync } from "fs";
import mongoose from "mongoose";
import { User, WorkHistory } from "@operium/db";

const uri = readFileSync(new URL("../.env", import.meta.url).pathname, "utf8")
  .split("\n").find(l => l.startsWith("MONGODB_URI="))!
  .slice("MONGODB_URI=".length).trim().replace(/^["']|["']$/g, "");

await mongoose.connect(uri, { dbName: "operiumnew" });

const user = await User.findOne({ email: "arjun.das@fantacode.com" })
  .select("+azureDevOpsToken azureDevOpsOrg").lean() as any;
if (!user?.azureDevOpsToken) { console.error("no token"); process.exit(1); }
const org = user.azureDevOpsOrg, token = user.azureDevOpsToken;

const az = async (url: string) => {
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${Buffer.from(":" + token).toString("base64")}` },
  });
  if (!res.ok) { console.log(`  ! ${res.status} ${url.slice(0, 120)}`); return null; }
  return res.json() as any;
};

const API = "api-version=7.0";
const base = `https://dev.azure.com/${encodeURIComponent(org)}`;

const conn = await az(`${base}/_apis/connectiondata`);
const myId = conn?.authenticatedUser?.id;
console.log(`org=${org} identity=${myId} (${conn?.authenticatedUser?.providerDisplayName})`);

const cutoff = new Date(Date.now() - 3650 * 86400 * 1000).toISOString();
const projectsData = await az(`${base}/_apis/projects?$top=20&${API}`);
const projects: any[] = projectsData?.value ?? [];
console.log(`projects: ${projects.map((p: any) => p.name).join(", ")}`);

let azPushes = 0, azPrs = 0, azBuilds = 0;

for (const p of projects) {
  const pName = p.name;
  const reposData = await az(`${base}/${encodeURIComponent(pName)}/_apis/git/repositories?${API}`);
  const repos: any[] = reposData?.value ?? [];

  for (const r of repos) {
    // pushes by him (paginated count)
    let skip = 0, pushCount = 0;
    while (true) {
      const d = await az(`${base}/${encodeURIComponent(pName)}/_apis/git/repositories/${r.id}/pushes?searchCriteria.fromDate=${encodeURIComponent(cutoff)}&searchCriteria.pusherId=${encodeURIComponent(myId)}&$top=100&$skip=${skip}&${API}`);
      const n = d?.value?.length ?? 0;
      pushCount += n;
      if (n < 100 || skip > 2000) break;
      skip += 100;
    }
    // PRs where he's creator or reviewer (paginated)
    let skipPR = 0, prCount = 0;
    while (true) {
      const d = await az(`${base}/${encodeURIComponent(pName)}/_apis/git/repositories/${r.id}/pullrequests?searchCriteria.status=all&searchCriteria.minTime=${encodeURIComponent(cutoff)}&$top=100&$skip=${skipPR}&${API}`);
      const prs: any[] = d?.value ?? [];
      prCount += prs.filter((pr: any) =>
        pr.createdBy?.id === myId || (pr.reviewers ?? []).some((rv: any) => rv?.id === myId)).length;
      if (prs.length < 100 || skipPR > 1000) break;
      skipPR += 100;
    }
    if (pushCount || prCount) console.log(`  ${pName}/${r.name}: pushes=${pushCount} prs=${prCount}`);
    azPushes += pushCount; azPrs += prCount;
  }

  // builds requested by him (continuation-paginated)
  let cont = "", buildCount = 0;
  while (true) {
    const res = await fetch(
      `${base}/${encodeURIComponent(pName)}/_apis/build/builds?minTime=${encodeURIComponent(cutoff)}&requestedFor=${encodeURIComponent(myId)}&$top=100${cont ? `&continuationToken=${encodeURIComponent(cont)}` : ""}&${API}`,
      { headers: { Authorization: `Basic ${Buffer.from(":" + token).toString("base64")}` } });
    if (!res.ok) break;
    cont = res.headers.get("x-ms-continuationtoken") || "";
    const d = await res.json() as any;
    buildCount += d?.value?.length ?? 0;
    if (!cont) break;
  }
  if (buildCount) console.log(`  ${pName} builds: ${buildCount}`);
  azBuilds += buildCount;
}

console.log(`\nAZURE says: pushes=${azPushes} prs=${azPrs} builds=${azBuilds} → total=${azPushes + azPrs + azBuilds}`);

const dbPushes = await WorkHistory.countDocuments({ userId: user._id, externalId: { $regex: "^az-push-" } });
const dbPrs    = await WorkHistory.countDocuments({ userId: user._id, externalId: { $regex: "^az-pr-" } });
const dbBuilds = await WorkHistory.countDocuments({ userId: user._id, externalId: { $regex: "^az-build-" } });
console.log(`MONGO has:  pushes=${dbPushes} prs=${dbPrs} builds=${dbBuilds} → total=${dbPushes + dbPrs + dbBuilds}`);

const wrongDate = await WorkHistory.countDocuments({
  userId: user._id, externalId: { $regex: "^az-" },
  createdAt: { $gte: new Date("2026-07-23T00:00:00Z") },
});
console.log(`entries with createdAt = sync day (2026-07-23): ${wrongDate}`);

await mongoose.disconnect();
