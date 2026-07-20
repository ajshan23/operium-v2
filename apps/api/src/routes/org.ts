import { Router } from "express";
import rateLimit from "express-rate-limit";
import { orgController } from "../controllers/org.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess, requireRole } from "../middlewares/tenant.middleware.js";

export const orgRouter: Router = Router();

// Accepting an invite consumes a 256-bit token — throttle to blunt any
// brute-force attempt regardless.
const acceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, message: "Too many attempts, try again later", success: false, data: null, errors: [] },
});

// All org routes require authentication
orgRouter.use(requireAuth);

orgRouter.post("/", orgController.createOrg.bind(orgController));
orgRouter.get("/me", orgController.getMyOrgs.bind(orgController));
orgRouter.get("/members", requireTenantAccess, orgController.getMembers.bind(orgController));

// ── Invites (per-email, tokenized) ──
orgRouter.post("/invites/accept", acceptLimiter, orgController.acceptInvite.bind(orgController));
orgRouter.post("/invites", requireTenantAccess, requireRole("owner", "admin"), orgController.createInvite.bind(orgController));
orgRouter.get("/invites", requireTenantAccess, requireRole("owner", "admin"), orgController.listInvites.bind(orgController));
orgRouter.delete("/invites/:inviteId", requireTenantAccess, requireRole("owner", "admin"), orgController.revokeInvite.bind(orgController));

// ── Member management (owner/admin) ──
orgRouter.delete("/members/:userId", requireTenantAccess, requireRole("owner", "admin"), orgController.removeMember.bind(orgController));

// ── Self-service ──
orgRouter.post("/leave", requireTenantAccess, orgController.leaveOrg.bind(orgController));
