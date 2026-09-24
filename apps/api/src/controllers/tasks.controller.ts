import { Request, Response } from "express";
import { tasksService } from "../services/tasks.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { z } from "zod";

const uid = (req: Request): string => (req as any).user.userId as string;
const oid = (req: Request): string | undefined => req.orgId;
const pid = (req: Request): string => String(req.params["id"]);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid task or assignee ID");
const statusSchema = z.enum(["todo", "in_progress", "done", "cancelled"]);
const dateSchema = z.string().date("Use a valid date in YYYY-MM-DD format");
const fields = {
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000).optional(),
  status: statusSchema.optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: dateSchema.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  assigneeId: objectId.nullable().optional(),
};
const createSchema = z.object({ ...fields, dueDate: dateSchema.optional(), assigneeId: objectId.optional() }).strict();
const updateSchema = z.object(fields).partial().strict().refine(value => Object.keys(value).length > 0, "No changes supplied");

const handle = (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.issues[0]?.message ?? "Invalid task data" });
        return;
      }
      res
        .status(err instanceof ApiError ? err.statusCode : 500)
        .json(err instanceof ApiError ? err.toJSON() : { message: err.message });
    }
  };

export const listTasks = handle(async (req, res) => {
  const { status } = z.object({ status: statusSchema.optional() }).parse(req.query);
  const tasks = await tasksService.list(uid(req), oid(req), status);
  res.json(new ApiResponse(200, tasks, "Tasks fetched"));
});

export const createTask = handle(async (req, res) => {
  const task = await tasksService.create(uid(req), oid(req), createSchema.parse(req.body));
  res.status(201).json(new ApiResponse(201, task, "Task created"));
});

export const updateTask = handle(async (req, res) => {
  const task = await tasksService.update(objectId.parse(pid(req)), uid(req), oid(req), updateSchema.parse(req.body));
  res.json(new ApiResponse(200, task, "Task updated"));
});

export const deleteTask = handle(async (req, res) => {
  await tasksService.delete(objectId.parse(pid(req)), uid(req), oid(req));
  res.json(new ApiResponse(200, null, "Task deleted"));
});

export const getStats = handle(async (req, res) => {
  const stats = await tasksService.stats(uid(req), oid(req));
  res.json(new ApiResponse(200, stats, "Stats fetched"));
});
