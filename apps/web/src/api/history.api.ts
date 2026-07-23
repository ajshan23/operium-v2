import { apiClient } from "./client";

export interface HistoryEntry {
  _id: string;
  title: string;
  description?: string;
  category: string;
  type: "simple" | "code" | "checklist";
  source: "manual" | "git" | "pr" | "deploy" | "build" | "azure";
  isMilestone: boolean;
  isBlocker: boolean;
  isImportant: boolean;
  isOngoing: boolean;
  codeSnippet?: { code: string; language: string; filename?: string };
  checklistItems?: Array<{ text: string; completed: boolean }>;
  externalId?: string;
  metadata?: {
    prLink?: string;
    prStatus?: string;
    prId?: string;
    role?: "author" | "reviewer";
    myVote?: number;
    sourceBranch?: string;
    targetBranch?: string;
    reviewers?: Array<{ name: string; vote: number; isRequired: boolean }>;
    pushLink?: string;
    project?: string;
    repo?: string;
    buildLink?: string;
    result?: string;
    buildStatus?: string;
    contributors?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface HistoryListResponse {
  items: HistoryEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export interface HeatmapCell {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface StatsResponse {
  cells: HeatmapCell[];
  totalEntries: number;
}

export interface IntegrationsResponse {
  githubConnected: boolean;
  azureConnected: boolean;
  azureOrg: string | null;
  githubLastSync: string | null;
  azureLastSync: string | null;
  githubFullSync: boolean;
  azureFullSync: boolean;
  azureFullSyncDate: string | null;
  editWindowHours: number;
}

export interface HistoryQueryParams {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  source?: string;
  isMilestone?: boolean;
  isBlocker?: boolean;
  isImportant?: boolean;
  startDate?: string;
  endDate?: string;
}

function buildQuery(params: Record<string, any>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== false) {
      q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const historyApi = {
  getHistory(params: HistoryQueryParams = {}): Promise<{ data: HistoryListResponse }> {
    return apiClient(`/api/history${buildQuery(params)}`);
  },

  createEntry(data: Partial<HistoryEntry>): Promise<{ data: HistoryEntry }> {
    return apiClient("/api/history", { method: "POST", data });
  },

  updateEntry(id: string, data: Partial<HistoryEntry>): Promise<{ data: HistoryEntry }> {
    return apiClient(`/api/history/${id}`, { method: "PATCH", data });
  },

  deleteEntry(id: string): Promise<void> {
    return apiClient(`/api/history/${id}`, { method: "DELETE" });
  },

  getStats(tzOffsetMinutes = 0): Promise<{ data: StatsResponse }> {
    return apiClient(`/api/history/stats?tz=${tzOffsetMinutes}`);
  },

  getLiveItems(): Promise<{ data: HistoryEntry[] }> {
    return apiClient("/api/history/live");
  },

  syncGithub(full = false): Promise<{ data: { synced: number; login: string } }> {
    return apiClient(`/api/history/sync${full ? "?days=full" : ""}`, { method: "POST" });
  },

  syncAzure(full = false): Promise<{ data: { synced: number; org: string; projects: number } }> {
    return apiClient(`/api/history/sync-azure${full ? "?days=full" : ""}`, { method: "POST" });
  },

  resetAzure(): Promise<{ data: { deleted: number } }> {
    return apiClient("/api/history/reset-azure", { method: "POST" });
  },

  getIntegrations(): Promise<{ data: IntegrationsResponse }> {
    return apiClient("/api/history/integrations");
  },

  updateIntegrations(data: {
    githubToken?: string;
    azureDevOpsToken?: string;
    azureDevOpsOrg?: string;
    editWindowHours?: number;
  }): Promise<void> {
    return apiClient("/api/history/integrations", { method: "PATCH", data });
  },

  getCustomIntegrations(): Promise<{ data: Array<{ id: string; name: string; url: string; method: string; isActive: boolean }> }> {
    return apiClient("/api/history/custom-integrations");
  },

  saveCustomIntegrations(integrations: Array<{ name: string; url: string; method?: string }>): Promise<void> {
    return apiClient("/api/history/custom-integrations", { method: "PUT", data: { integrations } });
  },

  syncCustom(): Promise<{ data: { synced: number; integrations: number } }> {
    return apiClient("/api/history/sync-custom", { method: "POST" });
  },
};
