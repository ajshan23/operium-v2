import { Router, IRouter } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  getStatus,
  listProjects,
  listTeams,
  listIterations,
  getMeta,
  listWorkItems,
  updateWorkItem,
  createWorkItem,
  deleteWorkItem,
} from "../controllers/boards.controller.js";

const router: IRouter = Router();

// PAT is per-user, not per-org — requireTenantAccess is intentionally omitted.
router.use(requireAuth);

router.get("/status",   getStatus);
router.get("/projects", listProjects);

router.get("/projects/:project/teams",                 listTeams);
router.get("/projects/:project/teams/:team/iterations", listIterations);
router.get("/projects/:project/meta",                   getMeta);
router.get("/projects/:project/workitems",              listWorkItems);
router.patch("/projects/:project/workitems/:id",        updateWorkItem);
router.post("/projects/:project/workitems",             createWorkItem);
router.delete("/projects/:project/workitems/:id",       deleteWorkItem);

export { router as boardsRouter };
