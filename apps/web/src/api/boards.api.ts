import { apiClient } from "./client";

/** Standard API response envelope — read `.data` on results. */
export interface ApiEnvelope<T> {
  statusCode: number;
  data: T;
  message: string;
}

export interface BoardsStatus {
  connected: boolean;
  org: string | null;
}

export interface BoardProject {
  id: string;
  name: string;
}

export interface BoardTeam {
  id: string;
  name: string;
}

export type IterationTimeFrame = "past" | "current" | "future" | "unknown";

export interface BoardIteration {
  id: string;
  name: string;
  path: string;
  startDate?: string;
  finishDate?: string;
  timeFrame: IterationTimeFrame;
}

export type StateCategory = "Proposed" | "InProgress" | "Resolved" | "Completed" | "Removed";

export interface BoardStateMeta {
  name: string;
  category: string;
  color?: string;
}

export interface BoardTypeMeta {
  name: string;
  icon?: string;
  color?: string;
  states: BoardStateMeta[];
}

export interface BoardMember {
  displayName: string;
  uniqueName: string;
  imageUrl?: string;
}

export interface BoardsMeta {
  types: BoardTypeMeta[];
  members: BoardMember[];
}

export interface BoardItem {
  id: number;
  rev: number;
  type: string;
  title: string;
  state: string;
  stateCategory: string;
  assignee?: BoardMember;
  iterationPath: string;
  areaPath: string;
  priority?: number;
  tags: string[];
  parentId?: number;
  description?: string;
  url: string;
  changedDate: string;
  createdDate: string;
}

export interface BoardItemNode extends BoardItem {
  children: BoardItemNode[];
}

export interface WorkItemsResult {
  items: BoardItemNode[];
  count: number;
}

export interface WorkItemsQuery {
  team?: string;
  iterationPath?: string;
  assignedToMe?: boolean;
  types?: string[];
  stateCategories?: string[];
}

export interface UpdateWorkItemData {
  title?: string;
  state?: string;
  iterationPath?: string;
  /** uniqueName of the new assignee, or null to unassign. */
  assignee?: string | null;
  priority?: number;
  rev?: number;
}

export interface CreateWorkItemData {
  type: string;
  title: string;
  description?: string;
  iterationPath?: string;
  assignee?: string;
  priority?: number;
  parentId?: number;
}

const projectBase = (project: string) => `/api/boards/projects/${encodeURIComponent(project)}`;

export const boardsApi = {
  status: () =>
    apiClient<ApiEnvelope<BoardsStatus>>("/api/boards/status", { method: "GET" }),

  projects: () =>
    apiClient<ApiEnvelope<BoardProject[]>>("/api/boards/projects", { method: "GET" }),

  teams: (project: string) =>
    apiClient<ApiEnvelope<BoardTeam[]>>(`${projectBase(project)}/teams`, { method: "GET" }),

  iterations: (project: string, team: string) =>
    apiClient<ApiEnvelope<BoardIteration[]>>(
      `${projectBase(project)}/teams/${encodeURIComponent(team)}/iterations`,
      { method: "GET" }
    ),

  meta: (project: string, team?: string) =>
    apiClient<ApiEnvelope<BoardsMeta>>(
      `${projectBase(project)}/meta${team ? `?team=${encodeURIComponent(team)}` : ""}`,
      { method: "GET" }
    ),

  workItems: (project: string, query: WorkItemsQuery = {}) => {
    const params = new URLSearchParams();
    if (query.team) params.set("team", query.team);
    if (query.iterationPath) params.set("iterationPath", query.iterationPath);
    if (query.assignedToMe) params.set("assignedToMe", "1");
    if (query.types?.length) params.set("types", query.types.join(","));
    if (query.stateCategories?.length) params.set("stateCategories", query.stateCategories.join(","));
    const qs = params.toString();
    return apiClient<ApiEnvelope<WorkItemsResult>>(
      `${projectBase(project)}/workitems${qs ? `?${qs}` : ""}`,
      { method: "GET" }
    );
  },

  updateWorkItem: (project: string, id: number, data: UpdateWorkItemData) =>
    apiClient<ApiEnvelope<BoardItem>>(`${projectBase(project)}/workitems/${id}`, {
      method: "PATCH",
      data,
    }),

  createWorkItem: (project: string, data: CreateWorkItemData) =>
    apiClient<ApiEnvelope<BoardItem>>(`${projectBase(project)}/workitems`, {
      method: "POST",
      data,
    }),
};
