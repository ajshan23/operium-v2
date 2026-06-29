import { apiClient } from "./client";

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
};
