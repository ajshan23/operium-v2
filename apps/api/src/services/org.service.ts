import { randomBytes } from "crypto";
import { orgRepository } from "../repositories/org.repository.js";
import { membershipRepository } from "../repositories/membership.repository.js";
import { IOrg, IMembership } from "@operium/db";

function generateInviteCode(): string {
  const part = () => randomBytes(2).toString("hex").toUpperCase();
  return `OP-${part()}-${part()}`;
}

export class OrgService {
  async createOrg(userId: string, name: string): Promise<IOrg> {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
    const inviteCode = generateInviteCode();

    const org = await orgRepository.create({ name, slug, inviteCode });

    await membershipRepository.create({
      userId,
      orgId: org.id,
      role: "owner",
    });

    return org;
  }

  async joinOrg(userId: string, inviteCode: string): Promise<IOrg> {
    const org = await orgRepository.findByInviteCode(inviteCode);
    if (!org) {
      throw new Error("Invalid invite code");
    }

    const existing = await membershipRepository.findByOrgAndUser(org.id, userId);
    if (existing) {
      throw new Error("You are already a member of this organization");
    }

    await membershipRepository.create({
      userId,
      orgId: org.id,
      role: "member",
    });

    return org;
  }

  async getUserOrgs(userId: string): Promise<IMembership[]> {
    return await membershipRepository.findByUserId(userId);
  }

  async getOrgMembers(orgId: string): Promise<IMembership[]> {
    return await membershipRepository.findByOrgId(orgId);
  }
}

export const orgService = new OrgService();
