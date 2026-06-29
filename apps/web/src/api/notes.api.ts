import { apiClient } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Space {
  _id:                 string;
  name:                string;
  description?:        string;
  icon?:               string;
  isSharedWithContext: boolean;
  createdAt:           string;
  updatedAt:           string;
}

export interface Note {
  _id:       string;
  title:     string;
  type:      "text" | "canvas";
  preview?:  string;
  content?:  string;
  spaceId:   string;
  tags:      string[];
  isStarred: boolean;
  isShared:  boolean;
  shareId?:  string;
  createdAt: string;
  updatedAt: string;
}

// ─── Spaces API ───────────────────────────────────────────────────────────────

export const spacesApi = {
  list(): Promise<{ data: Space[] }> {
    return apiClient("/api/spaces");
  },

  create(data: { name: string; description?: string; icon?: string }): Promise<{ data: Space }> {
    return apiClient("/api/spaces", { method: "POST", data });
  },

  get(id: string): Promise<{ data: Space }> {
    return apiClient(`/api/spaces/${id}`);
  },

  update(id: string, data: { name?: string; description?: string; icon?: string; isSharedWithContext?: boolean }): Promise<{ data: Space }> {
    return apiClient(`/api/spaces/${id}`, { method: "PUT", data });
  },

  delete(id: string): Promise<void> {
    return apiClient(`/api/spaces/${id}`, { method: "DELETE" });
  },
};

// ─── Notes API ────────────────────────────────────────────────────────────────

export const notesApi = {
  list(spaceId?: string): Promise<{ data: Note[] }> {
    const qs = spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : "";
    return apiClient(`/api/notes${qs}`);
  },

  create(data: { spaceId: string; title?: string; content?: string; tags?: string[]; type?: string }): Promise<{ data: Note }> {
    return apiClient("/api/notes", { method: "POST", data });
  },

  get(id: string): Promise<{ data: Note }> {
    return apiClient(`/api/notes/${id}`);
  },

  update(id: string, data: { title?: string; content?: string; tags?: string[]; isStarred?: boolean; type?: string }): Promise<{ data: Note }> {
    return apiClient(`/api/notes/${id}`, { method: "PUT", data });
  },

  delete(id: string): Promise<void> {
    return apiClient(`/api/notes/${id}`, { method: "DELETE" });
  },

  toggleStar(id: string): Promise<{ data: { isStarred: boolean } }> {
    return apiClient(`/api/notes/${id}/star`, { method: "POST" });
  },

  setSharing(id: string, isShared: boolean): Promise<{ data: { isShared: boolean; shareId: string | null } }> {
    return apiClient(`/api/notes/${id}/sharing`, { method: "POST", data: { isShared } });
  },
};
