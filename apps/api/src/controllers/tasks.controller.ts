import { Request, Response } from "express";
import { tasksService } from "../services/tasks.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const uid = (req: Request): string => (req as any).user.userId as string;
const pid = (req: Request): string => String(req.params["id"]);

const handle = (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err: any) {
      res
        .status(err instanceof ApiError ? err.statusCode : 500)
        .json(err instanceof ApiError ? err.toJSON() : { message: err.message });
    }
  };

export const listTasks = handle(async (req, res) => {
  const { status } = req.query as Record<string, string>;
  const tasks = await tasksService.list(uid(req), status || undefined);
  res.json(new ApiResponse(200, tasks, "Tasks fetched"));
});

export const createTask = handle(async (req, res) => {
  const task = await tasksService.create(uid(req), req.body);
  res.status(201).json(new ApiResponse(201, task, "Task created"));
});

export const updateTask = handle(async (req, res) => {
  const task = await tasksService.update(pid(req), uid(req), req.body);
  res.json(new ApiResponse(200, task, "Task updated"));
});

export const deleteTask = handle(async (req, res) => {
  await tasksService.delete(pid(req), uid(req));
  res.json(new ApiResponse(200, null, "Task deleted"));
});

export const getStats = handle(async (req, res) => {
  const stats = await tasksService.stats(uid(req));
  res.json(new ApiResponse(200, stats, "Stats fetched"));
});
