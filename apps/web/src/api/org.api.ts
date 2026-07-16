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

export const orgApi = {
  createOrg: async (name: string) => {
    return apiClient("/api/orgs", { data: { name } });
  },

  joinOrg: async (inviteCode: string) => {
    return apiClient("/api/orgs/join", { data: { inviteCode } });
  },

  getOrgs: async () => {
    return apiClient("/api/orgs/me", { method: "GET" });
  },

  getMembers: async () => {
    return apiClient("/api/orgs/members", { method: "GET" });
  },
};
