import { Request, Response } from "express";
import { historyService } from "../services/history.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

export class HistoryController {
  getHistory = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const q           = req.query.q as string | undefined;
      const category    = req.query.category as string | undefined;
      const source      = req.query.source as string | undefined;
      const startDate   = req.query.startDate as string | undefined;
      const endDate     = req.query.endDate as string | undefined;
      const isMilestone = req.query.isMilestone === "true";
      const isBlocker   = req.query.isBlocker   === "true";
      const isImportant = req.query.isImportant  === "true";
      const result = await historyService.getHistory(userId, {
        page:  Number(req.query.page) || 1,
        limit: Math.min(Number(req.query.limit) || 20, 100),
        q, category, isMilestone, isBlocker, isImportant, source, startDate, endDate,
      });
      res.json(new ApiResponse(200, result, "History fetched"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json(err instanceof ApiError ? err.toJSON() : { message: err.message });
    }
  };

  createEntry = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const entry = await historyService.createEntry(userId, req.body);
      res.status(201).json(new ApiResponse(201, entry, "Entry created"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json(err instanceof ApiError ? err.toJSON() : { message: err.message });
    }
  };

  updateEntry = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId as string;
      const entry = await historyService.updateEntry(String(req.params.id), userId, req.body);
      res.json(new ApiResponse(200, entry, "Entry updated"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json(err instanceof ApiError ? err.toJSON() : { message: err.message });
    }
  };

  deleteEntry = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId as string;
      await historyService.deleteEntry(String(req.params.id), userId);
      res.json(new ApiResponse(200, null, "Entry deleted"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json(err instanceof ApiError ? err.toJSON() : { message: err.message });
    }
  };

  getStats = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const tz = Number(req.query.tz) || 0;
      const stats = await historyService.getStats(userId, tz);
      res.json(new ApiResponse(200, stats, "Stats fetched"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  };

  getLiveItems = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const items = await historyService.getLiveItems(userId);
      res.json(new ApiResponse(200, items, "Live items fetched"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  };

  syncGithub = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const days   = req.query.days === "full" ? 90 : Number(req.query.days) || 3;
      const result = await historyService.syncGithub(userId, days);
      res.json(new ApiResponse(200, result, "GitHub sync completed"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json(err instanceof ApiError ? err.toJSON() : { message: err.message });
    }
  };

  syncAzure = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const days   = req.query.days === "full" ? 3650 : Number(req.query.days) || 2;
      const result = await historyService.syncAzure(userId, days);
      res.json(new ApiResponse(200, result, "Azure DevOps sync completed"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json(err instanceof ApiError ? err.toJSON() : { message: err.message });
    }
  };

  resetAzure = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const result = await historyService.resetAzure(userId);
      res.json(new ApiResponse(200, result, "Azure history reset"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  };

  resetGithub = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const result = await historyService.resetGithub(userId);
      res.json(new ApiResponse(200, result, "GitHub history reset"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  };

  getIntegrations = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const data = await historyService.getIntegrations(userId);
      res.json(new ApiResponse(200, data, "Integrations fetched"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  };

  updateIntegrations = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      await historyService.updateIntegrations(userId, req.body);
      res.json(new ApiResponse(200, null, "Integrations updated"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  };

  getCustomIntegrations = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const data = await historyService.getCustomIntegrations(userId);
      res.json(new ApiResponse(200, data, "Custom integrations fetched"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  };

  saveCustomIntegrations = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      await historyService.saveCustomIntegrations(userId, req.body.integrations || []);
      res.json(new ApiResponse(200, null, "Custom integrations saved"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  };

  syncCustom = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const result = await historyService.syncCustom(userId);
      res.json(new ApiResponse(200, result, "Custom sync completed"));
    } catch (err: any) {
      res.status(err.statusCode || 500).json(err instanceof ApiError ? err.toJSON() : { message: err.message });
    }
  };
}

export const historyController = new HistoryController();
