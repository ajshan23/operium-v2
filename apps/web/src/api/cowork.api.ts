import { apiClient } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CoworkSource  = "antigravity" | "claude-code" | "cursor" | "system";
export type CoworkIntent  = "bug-fix" | "feature" | "refactor" | "investigation" | "planning" | "review" | "docs";
export type CoworkOutcome = "fixed" | "implemented" | "explored" | "blocked" | "abandoned" | "partial";

export interface CoworkRepo {
  repoKey:       string;
  repoUrl:       string;
  repoName:      string;
  branch?:       string;
  commitSha?:    string;
  prUrl?:        string;
  filesTouched?: string[];
}

export interface CoworkSession {
  _id:            string;
  id:             string;
  title:          string;
  source:         CoworkSource;
  summary:        string;
  tags:           string[];
  isShared:       boolean;
  scope:          "team" | "personal";
  intent?:        CoworkIntent;
  outcome?:       CoworkOutcome;
  filesTouched?:  string[];
  languages?:     string[];
  repos?:         CoworkRepo[];
  /** Legacy single-repo fields — mirror of repos[0] */
  branch?:        string;
  commitSha?:     string;
  repoUrl?:       string;
  prUrl?:         string;
  useCount:       number;
  helpfulCount:   number;
  notHelpfulCount:number;
  lastUsedAt?:    string;
  createdAt:      string;
  updatedAt:      string;
  author?:        { name: string; avatar?: string } | null;
  isOwn:          boolean;
  reasons?:       string[];   // for related sessions
}

export interface CoworkChunk {
  _id:            string;
  sessionId:      string;
  order:          number;
  text:           string;
  sessionTitle:   string;
  sessionSource:  string;
  embeddingDirty: boolean;
  createdAt:      string;
}

export interface Pagination {
  total: number;
  page:  number;
  pages: number;
}

// ─── API client ───────────────────────────────────────────────────────────────

export const coworkApi = {

  list(params: {
    scope?:  "team" | "personal";
    source?: string;
    tag?:    string;
    limit?:  number;
    page?:   number;
  } = {}): Promise<{ data: { sessions: CoworkSession[]; pagination: Pagination } }> {
    const qs = new URLSearchParams();
    if (params.scope)          qs.set("scope",  params.scope);
    if (params.source)         qs.set("source", params.source);
    if (params.tag)            qs.set("tag",    params.tag);
    if (params.limit != null)  qs.set("limit",  String(params.limit));
    if (params.page  != null)  qs.set("page",   String(params.page));
    const q = qs.toString();
    return apiClient(`/api/cowork${q ? `?${q}` : ""}`);
  },

  search(params: {
    q:      string;
    scope?: "team" | "personal";
    limit?: number;
  }): Promise<{ data: CoworkSession[] }> {
    const qs = new URLSearchParams({ q: params.q });
    if (params.scope)        qs.set("scope", params.scope);
    if (params.limit != null) qs.set("limit", String(params.limit));
    return apiClient(`/api/cowork/search?${qs.toString()}`);
  },

  create(data: {
    source:        CoworkSource;
    title:         string;
    summary:       string;
    tags?:         string[];
    isShared?:     boolean;
    intent?:       CoworkIntent;
    outcome?:      CoworkOutcome;
    filesTouched?: string[];
    branch?:       string;
    commitSha?:    string;
    repoUrl?:      string;
    prUrl?:        string;
    chunks?:       string[];
  }): Promise<{ data: { session: CoworkSession; chunks: CoworkChunk[] } }> {
    return apiClient("/api/cowork", { method: "POST", data });
  },

  get(id: string): Promise<{ data: { session: CoworkSession; chunks: CoworkChunk[] } }> {
    return apiClient(`/api/cowork/${id}`);
  },

  related(id: string, limit = 5): Promise<{ data: { related: CoworkSession[] } }> {
    return apiClient(`/api/cowork/${id}/related?limit=${limit}`);
  },

  feedback(id: string, helpful?: boolean): Promise<{ data: { useCount: number; helpfulCount: number; notHelpfulCount: number } }> {
    return apiClient(`/api/cowork/${id}/feedback`, {
      method: "POST",
      data:   helpful !== undefined ? { helpful } : {},
    });
  },

  delete(id: string): Promise<void> {
    return apiClient(`/api/cowork/${id}`, { method: "DELETE" });
  },

  chat(messages: { role: "user" | "model"; content: string }[], sessionId?: string): Promise<{ data: { reply: string } }> {
    return apiClient("/api/cowork/chat", { method: "POST", data: { messages, sessionId } });
  },
};
