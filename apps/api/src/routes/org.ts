import { Router } from "express";
import rateLimit from "express-rate-limit";
import { orgController } from "../controllers/org.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess, requireRole } from "../middlewares/tenant.middleware.js";

export const orgRouter: Router = Router();

// Invite codes gate an org's shared memory — throttle guessing hard
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, message: "Too many join attempts, try again later", success: false, data: null, errors: [] },
});

// All org routes require authentication
orgRouter.use(requireAuth);

orgRouter.post("/", orgController.createOrg.bind(orgController));
orgRouter.post("/join", joinLimiter, orgController.joinOrg.bind(orgController));
orgRouter.get("/me", orgController.getMyOrgs.bind(orgController));
orgRouter.get("/members", requireTenantAccess, orgController.getMembers.bind(orgController));

// ── Org management (owner/admin) ──
orgRouter.post("/invite-code/rotate", requireTenantAccess, requireRole("owner", "admin"), orgController.rotateInviteCode.bind(orgController));
orgRouter.delete("/members/:userId", requireTenantAccess, requireRole("owner", "admin"), orgController.removeMember.bind(orgController));

// ── Self-service ──
orgRouter.post("/leave", requireTenantAccess, orgController.leaveOrg.bind(orgController));
