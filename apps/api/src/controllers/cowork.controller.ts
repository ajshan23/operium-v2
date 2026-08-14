import { Request, Response } from "express";
import { coworkService } from "../services/cowork.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const uid = (req: Request): string => (req as any).user.userId as string;
const oid = (req: Request): string => req.orgId as string;
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

// ─── Handlers ────────────────────────────────────────────────────────────────

export const listSessions = handle(async (req, res) => {
  const { scope, source, tag, limit, page } = req.query as Record<string, string>;
  const result = await coworkService.list(uid(req), oid(req), {
    scope:  scope  as "team" | "personal" | undefined,
    source: source || undefined,
    tag:    tag    || undefined,
    limit:  limit  ? Number(limit) : undefined,
    page:   page   ? Number(page)  : undefined,
  });
  res.json(new ApiResponse(200, result, "Sessions fetched"));
});

export const getResume = handle(async (req, res) => {
  const result = await coworkService.getResume(uid(req), oid(req));
  res.json(new ApiResponse(200, result, "Resume sessions fetched"));
});

export const searchSessions = handle(async (req, res) => {
  const { q, scope, limit } = req.query as Record<string, string | undefined>;
  if (!q) {
    res.status(400).json(new ApiError(400, "q is required").toJSON());
    return;
  }
  const sessions = await coworkService.search(
    uid(req), oid(req), q, scope as "team" | "personal" | undefined,
    limit ? Number(limit) : undefined
  );
  res.json(new ApiResponse(200, sessions, "Search results"));
});

export const createSession = handle(async (req, res) => {
  const result = await coworkService.create(uid(req), oid(req), req.body);
  res.status(201).json(new ApiResponse(201, result, "Session created"));
});

export const getSession = handle(async (req, res) => {
  const result = await coworkService.getById(pid(req), uid(req), oid(req));
  res.json(new ApiResponse(200, result, "Session fetched"));
});

export const listRepos = handle(async (req, res) => {
  const repos = await coworkService.listRepos(uid(req));
  res.json(new ApiResponse(200, repos, "Repos fetched"));
});

export const setRepoVisibility = handle(async (req, res) => {
  const { repoKey, shared } = req.body as { repoKey?: string; shared?: boolean };
  if (typeof repoKey !== "string" || typeof shared !== "boolean") {
    res.status(400).json(new ApiError(400, "repoKey (string) and shared (boolean) are required").toJSON());
    return;
  }
  const result = await coworkService.setRepoVisibility(uid(req), repoKey, shared);
  res.json(new ApiResponse(200, result, "Repo visibility updated"));
});

export const getRelated = handle(async (req, res) => {
  const { limit } = req.query as Record<string, string>;
  const result = await coworkService.getRelated(
    pid(req), uid(req), oid(req), limit ? Number(limit) : undefined
  );
  res.json(new ApiResponse(200, result, "Related sessions"));
});

export const recordFeedback = handle(async (req, res) => {
  const { helpful } = req.body as { helpful?: boolean };
  const result = await coworkService.feedback(pid(req), uid(req), oid(req), helpful);
  res.json(new ApiResponse(200, result, "Feedback recorded"));
});

export const deleteSession = handle(async (req, res) => {
  await coworkService.delete(pid(req), uid(req));
  res.json(new ApiResponse(200, null, "Session deleted"));
});

export const chatWithSession = handle(async (req, res) => {
  const { messages, sessionId } = req.body as {
    messages: { role: "user" | "model"; content: string }[];
    sessionId?: string;
  };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json(new ApiError(400, "messages array is required").toJSON());
    return;
  }
  const result = await coworkService.chat(uid(req), oid(req), messages, sessionId);
  res.json(new ApiResponse(200, result, "Reply generated"));
});
