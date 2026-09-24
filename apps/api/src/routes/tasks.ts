import { Router, IRouter } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess } from "../middlewares/tenant.middleware.js";
import { listTasks, createTask, updateTask, deleteTask, getStats } from "../controllers/tasks.controller.js";

const router: IRouter = Router();

router.use(requireAuth);
// My Tasks works without an organization. If one is selected, membership
// must still be checked before the personal task scope is applied.
router.use((req, res, next) => req.headers["x-org-id"] ? requireTenantAccess(req, res, next) : next());

router.get("/stats", getStats);
router.get("/",      listTasks);
router.post("/",     createTask);
router.put("/:id",   updateTask);
router.delete("/:id", deleteTask);

export { router as tasksRouter };
