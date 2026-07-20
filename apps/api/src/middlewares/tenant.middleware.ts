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

/**
 * Gate a route to specific org roles. Must run AFTER requireTenantAccess,
 * which resolves req.membership. Example:
 *   router.delete("/members/:id", requireTenantAccess, requireRole("owner", "admin"), handler)
 */
export const requireRole = (...roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const role = req.membership?.role;
    if (!role || !roles.includes(role)) {
      next(new ApiError(403, "You do not have permission to perform this action"));
      return;
    }
    next();
  };
