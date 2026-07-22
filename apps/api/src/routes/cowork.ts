import { Router } from "express";
import type { IRouter } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess } from "../middlewares/tenant.middleware.js";
import {
  listSessions, searchSessions, createSession,
  getSession, getRelated, recordFeedback, deleteSession, chatWithSession,
  listRepos, setRepoVisibility,
} from "../controllers/cowork.controller.js";

const router: IRouter = Router();
router.use(requireAuth);
router.use(requireTenantAccess);

router.get("/",             listSessions);
router.get("/search",       searchSessions);
router.get("/repos",        listRepos);
router.put("/repos/visibility", setRepoVisibility);
router.post("/",            createSession);
router.post("/chat",        chatWithSession);
router.get("/:id",          getSession);
router.get("/:id/related",  getRelated);
router.post("/:id/feedback",recordFeedback);
router.delete("/:id",       deleteSession);

export { router as coworkRouter };
