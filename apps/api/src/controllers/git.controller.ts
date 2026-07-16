import { Request, Response } from "express";
import { gitService } from "../services/git.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const uid = (req: Request): string => (req as any).user.userId as string;

const handle =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err: any) {
      res
        .status(err instanceof ApiError ? err.statusCode : 500)
        .json(err instanceof ApiError ? err.toJSON() : { message: err.message });
    }
  };

export const getOverview = handle(async (req, res) => {
  const providerParam = req.query.provider as string | undefined;
  const provider =
    providerParam === "github" || providerParam === "azure" ? providerParam : undefined;

  const overview = await gitService.getOverview(uid(req), {
    provider,
    repo: (req.query.repo as string) || undefined,
    q: (req.query.q as string) || undefined,
    tzOffsetMinutes: Number(req.query.tz) || 0,
  });

  res.json(new ApiResponse(200, overview, "Git overview fetched"));
});

export const syncGit = handle(async (req, res) => {
  const full = req.query.full === "true" || req.query.days === "full";
  const result = await gitService.sync(uid(req), full);
  res.json(new ApiResponse(200, result, "Git sync completed"));
});
