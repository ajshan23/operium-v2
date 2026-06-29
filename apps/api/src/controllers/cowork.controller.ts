import { Request, Response } from "express";
import { coworkService } from "../services/cowork.service.js";
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

// ─── Handlers ────────────────────────────────────────────────────────────────

export const listSessions = handle(async (req, res) => {
  const { scope, source, tag, limit, page } = req.query as Record<string, string>;
  const result = await coworkService.list(uid(req), {
    scope:  scope  as "team" | "personal" | undefined,
    source: source || undefined,
    tag:    tag    || undefined,
    limit:  limit  ? Number(limit) : undefined,
    page:   page   ? Number(page)  : undefined,
  });
  res.json(new ApiResponse(200, result, "Sessions fetched"));
});

export const searchSessions = handle(async (req, res) => {
  const { q, scope, limit } = req.query as Record<string, string | undefined>;
  if (!q) {
    res.status(400).json(new ApiError(400, "q is required").toJSON());
    return;
  }
  const sessions = await coworkService.search(
    uid(req), q, scope as "team" | "personal" | undefined,
    limit ? Number(limit) : undefined
  );
  res.json(new ApiResponse(200, sessions, "Search results"));
});

export const createSession = handle(async (req, res) => {
  const result = await coworkService.create(uid(req), req.body);
  res.status(201).json(new ApiResponse(201, result, "Session created"));
});

export const getSession = handle(async (req, res) => {
  const result = await coworkService.getById(pid(req), uid(req));
  res.json(new ApiResponse(200, result, "Session fetched"));
});

export const getRelated = handle(async (req, res) => {
  const { limit } = req.query as Record<string, string>;
  const result = await coworkService.getRelated(
    pid(req), uid(req), limit ? Number(limit) : undefined
  );
  res.json(new ApiResponse(200, result, "Related sessions"));
});

export const recordFeedback = handle(async (req, res) => {
  const { helpful } = req.body as { helpful?: boolean };
  const result = await coworkService.feedback(pid(req), uid(req), helpful);
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
  const result = await coworkService.chat(uid(req), messages, sessionId);
  res.json(new ApiResponse(200, result, "Reply generated"));
});
