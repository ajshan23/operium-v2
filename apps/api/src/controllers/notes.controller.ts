import { Request, Response } from "express";
import { spacesService, notesService } from "../services/notes.service.js";
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

// ─── Spaces ───────────────────────────────────────────────────────────────────

export const listSpaces = handle(async (req, res) => {
  const spaces = await spacesService.list(uid(req));
  res.json(new ApiResponse(200, spaces, "Spaces fetched"));
});

export const createSpace = handle(async (req, res) => {
  const space = await spacesService.create(uid(req), req.body);
  res.status(201).json(new ApiResponse(201, space, "Space created"));
});

export const getSpace = handle(async (req, res) => {
  const space = await spacesService.getById(pid(req), uid(req));
  res.json(new ApiResponse(200, space, "Space fetched"));
});

export const updateSpace = handle(async (req, res) => {
  const space = await spacesService.update(pid(req), uid(req), req.body);
  res.json(new ApiResponse(200, space, "Space updated"));
});

export const deleteSpace = handle(async (req, res) => {
  await spacesService.delete(pid(req), uid(req));
  res.json(new ApiResponse(200, null, "Space deleted"));
});

// ─── Notes ────────────────────────────────────────────────────────────────────

export const listNotes = handle(async (req, res) => {
  const notes = await notesService.list(uid(req), req.query.spaceId as string | undefined);
  res.json(new ApiResponse(200, notes, "Notes fetched"));
});

export const createNote = handle(async (req, res) => {
  const note = await notesService.create(uid(req), req.body);
  res.status(201).json(new ApiResponse(201, note, "Note created"));
});

export const getNote = handle(async (req, res) => {
  const note = await notesService.getById(pid(req), uid(req));
  res.json(new ApiResponse(200, note, "Note fetched"));
});

export const updateNote = handle(async (req, res) => {
  const note = await notesService.update(pid(req), uid(req), req.body);
  res.json(new ApiResponse(200, note, "Note updated"));
});

export const deleteNote = handle(async (req, res) => {
  await notesService.delete(pid(req), uid(req));
  res.json(new ApiResponse(200, null, "Note deleted"));
});

export const toggleStarNote = handle(async (req, res) => {
  const result = await notesService.toggleStar(pid(req), uid(req));
  res.json(new ApiResponse(200, result, "Star toggled"));
});

export const setNoteSharing = handle(async (req, res) => {
  const { isShared } = req.body;
  const result = await notesService.setSharing(pid(req), uid(req), !!isShared);
  res.json(new ApiResponse(200, result, "Sharing updated"));
});
