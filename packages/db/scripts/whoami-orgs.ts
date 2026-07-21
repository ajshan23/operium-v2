/**
 * Look up users by name/email fragment and print which org(s) they belong to.
 *
 *   npx tsx scripts/whoami-orgs.ts moosa ajmal
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { User, Membership, Org } from "../src/index.js";

const terms = process.argv.slice(2);
if (terms.length === 0) { console.error("Pass one or more name/email fragments"); process.exit(1); }

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/api/.env");
const uri = readFileSync(envPath, "utf8").split("\n").find(l => l.startsWith("MONGODB_URI="))!
  .slice("MONGODB_URI=".length).trim().replace(/^["']|["']$/g, "");

await mongoose.connect(uri);

for (const term of terms) {
  const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const users = await User.find({ $or: [{ name: rx }, { email: rx }] })
    .select("name email").lean() as any[];

  if (users.length === 0) { console.log(`\n"${term}": no matching user`); continue; }

  for (const u of users) {
    const memberships = await Membership.find({ userId: u._id }).lean() as any[];
    const orgIds = memberships.map(m => m.orgId);
    const orgs = await Org.find({ _id: { $in: orgIds } }).select("name slug").lean() as any[];
    const orgById = new Map(orgs.map(o => [String(o._id), o]));

    console.log(`\n"${term}" → ${u.name ?? "(no name)"} <${u.email}>  [${u._id}]`);
    if (memberships.length === 0) {
      console.log("   • not a member of any organization");
    } else {
      for (const m of memberships) {
        const o = orgById.get(String(m.orgId));
        console.log(`   • ${o?.name ?? "(unknown org)"}  (slug: ${o?.slug ?? "?"}, orgId: ${m.orgId}) — role: ${m.role}`);
      }
    }
  }
}

await mongoose.disconnect();
