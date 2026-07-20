import { randomBytes } from "crypto";
import { orgRepository } from "../repositories/org.repository.js";
import { membershipRepository } from "../repositories/membership.repository.js";
import { IOrg, IMembership } from "@operium/db";
import { ApiError } from "../utils/ApiError.js";

// 128 bits of entropy — invite codes gate an org's entire shared memory, so
// they must not be guessable even without rate limiting. Codes are pasted,
// not typed, so length doesn't hurt UX.
function generateInviteCode(): string {
  return `OP-${randomBytes(16).toString("hex").toUpperCase()}`;
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

  /**
   * Remove a member from an org. Authorization rules:
   *  - Actor must be owner or admin (enforced at the route via requireRole).
   *  - An admin may only remove plain members — not owners or other admins
   *    (no lateral/upward privilege moves).
   *  - The last remaining owner can never be removed (would orphan the org).
   * Removing a membership revokes the target's access to shared memory; their
   * own authored sessions/notes are left intact.
   */
  async removeMember(orgId: string, actorRole: string, targetUserId: string): Promise<void> {
    const target = await membershipRepository.findByOrgAndUser(orgId, targetUserId);
    if (!target) throw new ApiError(404, "That user is not a member of this organization");

    if (actorRole === "admin" && target.role !== "member") {
      throw new ApiError(403, "Admins can only remove members, not owners or other admins");
    }

    if (target.role === "owner") {
      const ownerCount = await membershipRepository.countByOrgAndRole(orgId, "owner");
      if (ownerCount <= 1) throw new ApiError(400, "Cannot remove the last owner — transfer ownership first");
    }

    await membershipRepository.deleteByOrgAndUser(orgId, targetUserId);
  }

  /**
   * A member leaves an org voluntarily. The last owner cannot leave (they must
   * transfer ownership or delete the org — not built yet).
   */
  async leaveOrg(orgId: string, userId: string): Promise<void> {
    const membership = await membershipRepository.findByOrgAndUser(orgId, userId);
    if (!membership) throw new ApiError(404, "You are not a member of this organization");

    if (membership.role === "owner") {
      const ownerCount = await membershipRepository.countByOrgAndRole(orgId, "owner");
      if (ownerCount <= 1) throw new ApiError(400, "The last owner cannot leave — transfer ownership first");
    }

    await membershipRepository.deleteByOrgAndUser(orgId, userId);
  }

  /**
   * Rotate the org's invite code (owner/admin only). Invalidates the previous
   * code immediately — use after offboarding or if a code leaks.
   */
  async rotateInviteCode(orgId: string): Promise<string> {
    const inviteCode = generateInviteCode();
    const org = await orgRepository.updateInviteCode(orgId, inviteCode);
    if (!org) throw new ApiError(404, "Organization not found");
    return inviteCode;
  }
}

export const orgService = new OrgService();
