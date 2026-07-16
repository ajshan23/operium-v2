import { Router } from "express";
import { orgController } from "../controllers/org.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess } from "../middlewares/tenant.middleware.js";

export const orgRouter: Router = Router();

// All org routes require authentication
orgRouter.use(requireAuth);

orgRouter.post("/", orgController.createOrg.bind(orgController));
orgRouter.post("/join", orgController.joinOrg.bind(orgController));
orgRouter.get("/me", orgController.getMyOrgs.bind(orgController));
orgRouter.get("/members", requireTenantAccess, orgController.getMembers.bind(orgController));
