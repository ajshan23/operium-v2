import { apiClient } from "./client";

export interface Task {
  _id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  tags: string[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskData {
  title: string;
  description?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  dueDate?: string;
  tags?: string[];
}

export const tasksApi = {
  list: (status?: string) =>
    apiClient(`/api/tasks${status ? `?status=${status}` : ""}`, { method: "GET" }),

  stats: () =>
    apiClient("/api/tasks/stats", { method: "GET" }),

  create: (data: CreateTaskData) =>
    apiClient("/api/tasks", { data }),

  update: (id: string, data: Partial<CreateTaskData & { dueDate: string | null }>) =>
    apiClient(`/api/tasks/${id}`, { method: "PUT", data }),

  delete: (id: string) =>
    apiClient(`/api/tasks/${id}`, { method: "DELETE" }),
};
