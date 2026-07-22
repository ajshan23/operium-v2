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
      const status = error instanceof ApiError ? error.statusCode : 500;
      res.status(status).json(new ApiError(status, error.message));
    }
  }

  async acceptInvite(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;
      const userId = req.user?.userId;

      if (!token) {
        res.status(400).json(new ApiError(400, "Invite token is required"));
        return;
      }
      if (!userId) {
        res.status(401).json(new ApiError(401, "Authentication required"));
        return;
      }

      const org = await orgService.acceptInvite(userId, String(token));
      res.status(200).json(new ApiResponse(200, org, "Joined organization successfully"));
    } catch (error: any) {
      const status = error instanceof ApiError ? error.statusCode : 500;
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

  async removeMember(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId!;
      const actorRole = req.membership?.role as string;
      const targetUserId = String(req.params["userId"]);

      if (targetUserId === req.user?.userId) {
        res.status(400).json(new ApiError(400, "Use leave to remove yourself"));
        return;
      }

      await orgService.removeMember(orgId, actorRole, targetUserId);
      res.status(200).json(new ApiResponse(200, null, "Member removed"));
    } catch (error: any) {
      const status = error instanceof ApiError ? error.statusCode : 500;
      res.status(status).json(new ApiError(status, error.message));
    }
  }

  async leaveOrg(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId!;
      const userId = req.user?.userId;

      await orgService.leaveOrg(orgId, userId);
      res.status(200).json(new ApiResponse(200, null, "Left organization"));
    } catch (error: any) {
      const status = error instanceof ApiError ? error.statusCode : 500;
      res.status(status).json(new ApiError(status, error.message));
    }
  }

  async createInvite(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId!;
      const inviterUserId = req.user?.userId;
      const actorRole = req.membership?.role as string;
      const { email, role } = req.body;

      if (!email) {
        res.status(400).json(new ApiError(400, "Email is required"));
        return;
      }

      const invite = await orgService.createInvite(orgId, inviterUserId, actorRole, String(email), role === "admin" ? "admin" : "member");
      // Return the token to the owner/admin (route is role-gated) so they can
      // copy the invite link and send it manually. Safe: invites are bound to
      // the invitee's email, so a shared link can't be used by anyone else.
      res.status(201).json(new ApiResponse(201, {
        _id: invite._id, email: invite.email, role: invite.role, status: invite.status, expiresAt: invite.expiresAt, token: invite.token,
      }, "Invite sent"));
    } catch (error: any) {
      const status = error instanceof ApiError ? error.statusCode : 500;
      res.status(status).json(new ApiError(status, error.message));
    }
  }

  async listInvites(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId!;
      const invites = await orgService.listInvites(orgId);
      const safe = invites.map((i: any) => ({
        _id: i._id, email: i.email, role: i.role, status: i.status,
        expiresAt: i.expiresAt, invitedBy: i.invitedBy, createdAt: i.createdAt,
        token: i.token, // owner/admin only (role-gated route) — lets them copy the invite link
      }));
      res.status(200).json(new ApiResponse(200, safe, "Invites fetched"));
    } catch (error: any) {
      const status = error instanceof ApiError ? error.statusCode : 500;
      res.status(status).json(new ApiError(status, error.message));
    }
  }

  async revokeInvite(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId!;
      const inviteId = String(req.params["inviteId"]);
      await orgService.revokeInvite(orgId, inviteId);
      res.status(200).json(new ApiResponse(200, null, "Invite revoked"));
    } catch (error: any) {
      const status = error instanceof ApiError ? error.statusCode : 500;
      res.status(status).json(new ApiError(status, error.message));
    }
  }
}

export const orgController = new OrgController();
