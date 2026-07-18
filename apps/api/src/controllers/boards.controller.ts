import { Request, Response } from "express";
import { boardsService } from "../services/boards.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const uid = (req: Request): string => (req as any).user.userId as string;
const project = (req: Request): string => String(req.params["project"]);

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

function parseCsv(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const list = value.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function parseBool(value: unknown): boolean {
  return value === "1" || value === "true" || value === true;
}

export const getStatus = handle(async (req, res) => {
  const status = await boardsService.status(uid(req));
  res.json(new ApiResponse(200, status, "Azure Boards status fetched"));
});

export const listProjects = handle(async (req, res) => {
  const projects = await boardsService.projects(uid(req));
  res.json(new ApiResponse(200, projects, "Projects fetched"));
});

export const listTeams = handle(async (req, res) => {
  const teams = await boardsService.teams(uid(req), project(req));
  res.json(new ApiResponse(200, teams, "Teams fetched"));
});

export const listIterations = handle(async (req, res) => {
  const team = String(req.params["team"]);
  const iterations = await boardsService.iterations(uid(req), project(req), team);
  res.json(new ApiResponse(200, iterations, "Iterations fetched"));
});

export const getMeta = handle(async (req, res) => {
  const team = (req.query["team"] as string | undefined) || undefined;
  const meta = await boardsService.meta(uid(req), project(req), team);
  res.json(new ApiResponse(200, meta, "Board metadata fetched"));
});

export const listWorkItems = handle(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const result = await boardsService.workItems(uid(req), project(req), {
    team: (q["team"] as string | undefined) || undefined,
    iterationPath: (q["iterationPath"] as string | undefined) || undefined,
    assignedToMe: parseBool(q["assignedToMe"]),
    types: parseCsv(q["types"]),
    stateCategories: parseCsv(q["stateCategories"]),
  });
  res.json(new ApiResponse(200, result, "Work items fetched"));
});

export const updateWorkItem = handle(async (req, res) => {
  const id = Number(req.params["id"]);
  const item = await boardsService.updateItem(uid(req), project(req), id, req.body);
  res.json(new ApiResponse(200, item, "Work item updated"));
});

export const createWorkItem = handle(async (req, res) => {
  const item = await boardsService.createItem(uid(req), project(req), req.body);
  res.status(201).json(new ApiResponse(201, item, "Work item created"));
});

export const deleteWorkItem = handle(async (req, res) => {
  const id = Number(req.params["id"]);
  const result = await boardsService.deleteItem(uid(req), project(req), id);
  res.json(new ApiResponse(200, result, "Work item moved to Recycle Bin"));
});
