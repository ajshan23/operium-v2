import { Request, Response } from "express";
import { orgService } from "../services/org.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

export class OrgController {
  async createOrg(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.body;
      const userId = req.user?.userId;

      if (!name) {
        res.status(400).json(new ApiError(400, "Organization name is required"));
        return;
      }
      if (!userId) {
        res.status(401).json(new ApiError(401, "Authentication required"));
        return;
      }

      const org = await orgService.createOrg(userId, name);
      res.status(201).json(new ApiResponse(201, org, "Organization created successfully"));
    } catch (error: any) {
      res.status(500).json(new ApiError(500, error.message));
    }
  }

  async joinOrg(req: Request, res: Response): Promise<void> {
    try {
      const { inviteCode } = req.body;
      const userId = req.user?.userId;

      if (!inviteCode) {
        res.status(400).json(new ApiError(400, "Invite code is required"));
        return;
      }
      if (!userId) {
        res.status(401).json(new ApiError(401, "Authentication required"));
        return;
      }

      const org = await orgService.joinOrg(userId, inviteCode);
      res.status(200).json(new ApiResponse(200, org, "Joined organization successfully"));
    } catch (error: any) {
      const status = error.message === "Invalid invite code" ? 404 : 400;
      res.status(status).json(new ApiError(status, error.message));
    }
  }

  async getMyOrgs(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json(new ApiError(401, "Authentication required"));
        return;
      }

      const memberships = await orgService.getUserOrgs(userId);
      res.status(200).json(new ApiResponse(200, memberships, "Organizations fetched successfully"));
    } catch (error: any) {
      res.status(500).json(new ApiError(500, error.message));
    }
  }

  async getMembers(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.status(400).json(new ApiError(400, "Missing organization context"));
        return;
      }

      const members = await orgService.getOrgMembers(orgId);
      res.status(200).json(new ApiResponse(200, members, "Members fetched successfully"));
    } catch (error: any) {
      res.status(500).json(new ApiError(500, error.message));
    }
  }
}

export const orgController = new OrgController();
