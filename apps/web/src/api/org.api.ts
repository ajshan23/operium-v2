import { apiClient } from "./client";

export interface OrgMember {
  _id: string;
  role: "owner" | "admin" | "member";
  orgId: string;
  userId: {
    _id: string;
    name?: string;
    email?: string;
    avatar?: string;
  };
}

export interface OrgInvite {
  _id: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
  createdAt?: string;
  /** Present for owner/admin — used to build a shareable invite link. */
  token?: string;
}

export const orgApi = {
  createOrg: async (name: string) => {
    return apiClient("/api/orgs", { data: { name } });
  },

  getOrgs: async () => {
    return apiClient("/api/orgs/me", { method: "GET" });
  },

  getMembers: async () => {
    return apiClient("/api/orgs/members", { method: "GET" });
  },

  // ── Invites (per-email, tokenized) ──
  // Accept an invite you received by email (token from the link).
  acceptInvite: async (token: string) => {
    return apiClient("/api/orgs/invites/accept", { data: { token } });
  },

  // Owner/admin: invite a person by email.
  createInvite: async (email: string, role: "admin" | "member" = "member") => {
    return apiClient("/api/orgs/invites", { data: { email, role } });
  },

  listInvites: async () => {
    return apiClient("/api/orgs/invites", { method: "GET" });
  },

  revokeInvite: async (inviteId: string) => {
    return apiClient(`/api/orgs/invites/${inviteId}`, { method: "DELETE" });
  },

  // ── Member management (owner/admin) ──
  removeMember: async (userId: string) => {
    return apiClient(`/api/orgs/members/${userId}`, { method: "DELETE" });
  },

  // ── Self-service ──
  leaveOrg: async () => {
    return apiClient("/api/orgs/leave", { method: "POST" });
  },
};
