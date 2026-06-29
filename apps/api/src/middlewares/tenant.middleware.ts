import { Request, Response, NextFunction } from "express";
import { Membership } from "@operium/db";
import { ApiError } from "../utils/ApiError.js";

declare global {
  namespace Express {
    interface Request {
      orgId?: string;
      membership?: any;
    }
  }
}

export const requireTenantAccess = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const orgId = req.headers["x-org-id"] as string;

    if (!orgId) {
      throw new ApiError(400, "Missing x-org-id header");
    }

    if (!req.user || !req.user.userId) {
      throw new ApiError(401, "Authentication required");
    }

    const membership = await Membership.findOne({
      userId: req.user.userId,
      orgId: orgId,
    });

    if (!membership) {
      throw new ApiError(403, "Access denied to this organization");
    }

    req.orgId = orgId;
    req.membership = membership;
    next();
  } catch (error) {
    next(error);
  }
};
