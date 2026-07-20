import { randomBytes } from "crypto";
import { orgRepository } from "../repositories/org.repository.js";
import { membershipRepository } from "../repositories/membership.repository.js";
import { inviteRepository } from "../repositories/invite.repository.js";
import { emailService } from "./email.service.js";
import { IOrg, IMembership, IInvite, Role, User } from "@operium/db";
import { ApiError } from "../utils/ApiError.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Legacy shared invite code. Shared-code joins were removed (per-email invites
// replaced them), but the field is still generated to satisfy the Org unique
// index; it is never exposed to clients and never accepted for joining.
function generateLegacyInviteCode(): string {
  return `OP-${randomBytes(16).toString("hex").toUpperCase()}`;
}

function generateInviteToken(): string {
  return randomBytes(32).toString("hex"); // 256 bits — unguessable
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class OrgService {
  async createOrg(userId: string, name: string): Promise<IOrg> {
    // One org per user: must leave the current one before creating another.
    if (await membershipRepository.countByUser(userId) > 0) {
      throw new ApiError(409, "You're already in an organization — leave it before creating a new one");
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
    const inviteCode = generateLegacyInviteCode();

    const org = await orgRepository.create({ name, slug, inviteCode });

    await membershipRepository.create({
      userId,
      orgId: org.id,
      role: "owner",
    });

    return org;
  }

  async getUserOrgs(userId: string): Promise<IMembership[]> {
    return await membershipRepository.findByUserId(userId);
  }

  async getOrgMembers(orgId: string): Promise<IMembership[]> {
    return await membershipRepository.findByOrgId(orgId);
  }

  // ── Invites (per-email, tokenized) ──────────────────────────────────────────

  /**
   * Create an invite for a specific email. Owner/admin only (route-enforced);
   * an admin cannot mint owner/admin invites (no privilege escalation).
   * Emails the recipient a tokenized accept link and returns the invite.
   */
  async createInvite(orgId: string, inviterUserId: string, actorRole: string, email: string, role: Role): Promise<IInvite> {
    const normalized = email.toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      throw new ApiError(400, "A valid email address is required");
    }
    if (actorRole === "admin" && role !== "member") {
      throw new ApiError(403, "Admins can only invite members, not owners or admins");
    }

    // Already a member? Nothing to do. Match case-insensitively — User.email
    // isn't normalized, so a lowercased lookup would miss "Bob@x.com".
    const existingUser = await User.findOne({
      email: { $regex: `^${escapeRegex(normalized)}$`, $options: "i" },
    }).select("_id").lean() as any;
    if (existingUser) {
      const membership = await membershipRepository.findByOrgAndUser(orgId, String(existingUser._id));
      if (membership) throw new ApiError(409, "That person is already a member of this organization");
    }

    // One pending invite per address. If a stale one exists, clear it so a
    // fresh invite can reissue (otherwise the partial unique index rejects it).
    const pending = await inviteRepository.findPendingByOrgAndEmail(orgId, normalized);
    if (pending) {
      if (pending.expiresAt.getTime() < Date.now()) {
        pending.status = "revoked";
        await pending.save();
      } else {
        throw new ApiError(409, "An invite for that email is already pending — revoke it first to reissue");
      }
    }

    const token = generateInviteToken();
    const invite = await inviteRepository.create({
      orgId,
      email: normalized,
      role,
      token,
      invitedBy: inviterUserId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    const org = await orgRepository.findById(orgId);
    await emailService.sendInvite(normalized, org?.name ?? "an organization", token);

    return invite;
  }

  async listInvites(orgId: string): Promise<IInvite[]> {
    return await inviteRepository.listPendingByOrg(orgId);
  }

  async revokeInvite(orgId: string, inviteId: string): Promise<void> {
    const invite = await inviteRepository.findByIdAndOrg(inviteId, orgId);
    if (!invite || invite.status !== "pending") {
      throw new ApiError(404, "Pending invite not found");
    }
    invite.status = "revoked";
    await invite.save();
  }

  /**
   * Accept an invite. The caller must be authenticated and their account email
   * must match the invited address — the token alone is not enough, so a leaked
   * token can't be redeemed by the wrong person. Enforces status + expiry.
   */
  async acceptInvite(userId: string, token: string): Promise<IOrg> {
    const invite = await inviteRepository.findByToken(token);
    if (!invite || invite.status !== "pending") {
      throw new ApiError(404, "This invite is invalid or has already been used");
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new ApiError(410, "This invite has expired — ask for a new one");
    }

    const user = await User.findById(userId).select("email").lean() as any;
    if (!user) throw new ApiError(404, "User not found");
    if (user.email.toLowerCase().trim() !== invite.email) {
      throw new ApiError(403, "This invite was sent to a different email address");
    }

    const orgId = String(invite.orgId);
    const existing = await membershipRepository.findByOrgAndUser(orgId, userId);
    if (!existing) {
      // One org per user: must leave the current one before joining another.
      // (Re-accepting into the org you're already in is a no-op, handled above.)
      if (await membershipRepository.countByUser(userId) > 0) {
        throw new ApiError(409, "You're already in an organization — leave it before joining another");
      }
      await membershipRepository.create({ userId, orgId, role: invite.role });
    } else if (existing.role === "member" && invite.role === "admin") {
      // Already a member, invited to a higher role — apply the promotion.
      // Only escalate; never downgrade via an invite (avoids demoting owners).
      await membershipRepository.updateRole(orgId, userId, "admin");
    }

    invite.status = "accepted";
    invite.acceptedBy = userId as any;
    invite.acceptedAt = new Date();
    await invite.save();

    const org = await orgRepository.findById(orgId);
    if (!org) throw new ApiError(404, "Organization not found");
    return org;
  }

  // ── Membership management ────────────────────────────────────────────────────

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
}

export const orgService = new OrgService();
