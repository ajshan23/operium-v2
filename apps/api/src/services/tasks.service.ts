import { Task } from "@operium/db";
import type { TaskStatus, TaskPriority } from "@operium/db";
import { ApiError } from "../utils/ApiError.js";

export interface CreateTaskData {
  title:       string;
  description?: string;
  status?:     TaskStatus;
  priority?:   TaskPriority;
  dueDate?:    string;
  tags?:       string[];
}

export interface UpdateTaskData {
  title?:       string;
  description?: string;
  status?:      TaskStatus;
  priority?:    TaskPriority;
  dueDate?:     string | null;
  tags?:        string[];
}

export class TasksService {
  async list(userId: string, status?: string) {
    const filter: any = { userId };
    if (status) filter.status = status;
    return Task.find(filter).sort({ status: 1, priority: -1, createdAt: -1 }).lean();
  }

  async create(userId: string, data: CreateTaskData) {
    if (!data.title?.trim()) throw new ApiError(400, "Title is required");

    const task = await Task.create({
      userId,
      title:       data.title.trim(),
      description: data.description ?? "",
      status:      data.status      ?? "todo",
      priority:    data.priority    ?? "medium",
      dueDate:     data.dueDate ? new Date(data.dueDate) : undefined,
      tags:        data.tags ?? [],
    });
    return task;
  }

  async update(id: string, userId: string, data: UpdateTaskData) {
    const upd: any = {};
    if (data.title       !== undefined) upd.title       = data.title.trim();
    if (data.description !== undefined) upd.description = data.description;
    if (data.status      !== undefined) upd.status      = data.status;
    if (data.priority    !== undefined) upd.priority    = data.priority;
    if (data.tags        !== undefined) upd.tags        = data.tags;

    if (data.dueDate === null) {
      upd.$unset = { dueDate: "" };
    } else if (data.dueDate) {
      upd.dueDate = new Date(data.dueDate);
    }

    if (data.status === "done" && !upd.completedAt) {
      upd.completedAt = new Date();
    } else if (data.status && data.status !== "done") {
      upd.$unset = { ...upd.$unset, completedAt: "" };
    }

    const task = await Task.findOneAndUpdate({ _id: id, userId }, upd, { new: true, runValidators: true });
    if (!task) throw new ApiError(404, "Task not found");
    return task;
  }

  async delete(id: string, userId: string) {
    const task = await Task.findOneAndDelete({ _id: id, userId });
    if (!task) throw new ApiError(404, "Task not found");
    return { deleted: true };
  }

  async stats(userId: string) {
    const tasks = await Task.find({ userId }).select("status").lean();
    const result: Record<string, number> = { todo: 0, in_progress: 0, done: 0, cancelled: 0 };
    for (const t of tasks) {
      const s = t.status as string;
      result[s] = (result[s] ?? 0) + 1;
    }
    return result;
  }
}

export const tasksService = new TasksService();
