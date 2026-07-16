import { Task } from "@operium/db";
import type { TaskStatus, TaskPriority } from "@operium/db";
import { ApiError } from "../utils/ApiError.js";
import { membershipRepository } from "../repositories/membership.repository.js";

export interface CreateTaskData {
  title:       string;
  description?: string;
  status?:     TaskStatus;
  priority?:   TaskPriority;
  dueDate?:    string;
  tags?:       string[];
  assigneeId?: string;
}

export interface UpdateTaskData {
  title?:       string;
  description?: string;
  status?:      TaskStatus;
  priority?:    TaskPriority;
  dueDate?:     string | null;
  tags?:        string[];
  assigneeId?:  string | null;
}

const ASSIGNEE_FIELDS = "name email avatar";

// All org tasks, plus the user's own tasks created before org scoping existed
const orgScope = (userId: string, orgId: string) => ({
  $or: [{ orgId }, { orgId: { $exists: false }, userId }],
});

export class TasksService {
  private async assertAssigneeInOrg(orgId: string, assigneeId: string, userId: string) {
    if (assigneeId === userId) return;
    const membership = await membershipRepository.findByOrgAndUser(orgId, assigneeId);
    if (!membership) throw new ApiError(400, "Assignee is not a member of this organization");
  }

  async list(userId: string, orgId: string, status?: string) {
    const filter: any = orgScope(userId, orgId);
    if (status) filter.status = status;
    return Task.find(filter)
      .sort({ status: 1, priority: -1, createdAt: -1 })
      .populate("assigneeId", ASSIGNEE_FIELDS)
      .lean();
  }

  async create(userId: string, orgId: string, data: CreateTaskData) {
    if (!data.title?.trim()) throw new ApiError(400, "Title is required");

    if (data.assigneeId) await this.assertAssigneeInOrg(orgId, data.assigneeId, userId);

    const task = await Task.create({
      userId,
      orgId,
      assigneeId:  data.assigneeId ?? userId,
      title:       data.title.trim(),
      description: data.description ?? "",
      status:      data.status      ?? "todo",
      priority:    data.priority    ?? "medium",
      dueDate:     data.dueDate ? new Date(data.dueDate) : undefined,
      tags:        data.tags ?? [],
    });
    return task.populate("assigneeId", ASSIGNEE_FIELDS);
  }

  async update(id: string, userId: string, orgId: string, data: UpdateTaskData) {
    const upd: any = {};
    if (data.title       !== undefined) upd.title       = data.title.trim();
    if (data.description !== undefined) upd.description = data.description;
    if (data.status      !== undefined) upd.status      = data.status;
    if (data.priority    !== undefined) upd.priority    = data.priority;
    if (data.tags        !== undefined) upd.tags        = data.tags;

    if (data.assigneeId === null) {
      upd.$unset = { assigneeId: "" };
    } else if (data.assigneeId) {
      await this.assertAssigneeInOrg(orgId, data.assigneeId, userId);
      upd.assigneeId = data.assigneeId;
    }

    if (data.dueDate === null) {
      upd.$unset = { ...upd.$unset, dueDate: "" };
    } else if (data.dueDate) {
      upd.dueDate = new Date(data.dueDate);
    }

    if (data.status === "done" && !upd.completedAt) {
      upd.completedAt = new Date();
    } else if (data.status && data.status !== "done") {
      upd.$unset = { ...upd.$unset, completedAt: "" };
    }

    const task = await Task.findOneAndUpdate(
      { _id: id, ...orgScope(userId, orgId) },
      upd,
      { new: true, runValidators: true }
    ).populate("assigneeId", ASSIGNEE_FIELDS);
    if (!task) throw new ApiError(404, "Task not found");
    return task;
  }

  async delete(id: string, userId: string, orgId: string) {
    const task = await Task.findOneAndDelete({ _id: id, ...orgScope(userId, orgId) });
    if (!task) throw new ApiError(404, "Task not found");
    return { deleted: true };
  }

  async stats(userId: string, orgId: string) {
    const tasks = await Task.find(orgScope(userId, orgId)).select("status").lean();
    const result: Record<string, number> = { todo: 0, in_progress: 0, done: 0, cancelled: 0 };
    for (const t of tasks) {
      const s = t.status as string;
      result[s] = (result[s] ?? 0) + 1;
    }
    return result;
  }
}

export const tasksService = new TasksService();
