import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "@operium/db";
import { ApiError } from "../utils/ApiError.js";
import { JWT_SECRET } from "../utils/jwtSecret.js";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Blocked-user lookups are cached briefly so requireAuth doesn't add a DB
// round-trip to every request; a block still takes effect within a minute.
const BLOCK_CACHE_TTL_MS = 60_000;
const blockCache = new Map<string, { blocked: boolean; at: number }>();

async function isBlocked(userId: string): Promise<boolean> {
  const hit = blockCache.get(userId);
  if (hit && Date.now() - hit.at < BLOCK_CACHE_TTL_MS) return hit.blocked;
  const user = await User.findById(userId).select("isBlocked").lean() as any;
  const blocked = !user || !!user.isBlocked;
  blockCache.set(userId, { blocked, at: Date.now() });
  return blocked;
}

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    let token = req.cookies["auth-token"];

    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      throw new ApiError(401, "Authentication required");
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Browser tokens live for 30 days, but a blocked (or deleted) user loses
    // REST access immediately on the next request, same as the MCP path.
    if (await isBlocked(decoded.userId)) {
      throw new ApiError(401, "Account is blocked");
    }

    req.user = decoded;
    next();
  } catch (error: any) {
    next(error instanceof ApiError ? error : new ApiError(401, "Invalid or expired token"));
  }
};
