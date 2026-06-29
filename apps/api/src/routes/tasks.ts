import { Router, IRouter } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { listTasks, createTask, updateTask, deleteTask, getStats } from "../controllers/tasks.controller.js";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/stats", getStats);
router.get("/",      listTasks);
router.post("/",     createTask);
router.put("/:id",   updateTask);
router.delete("/:id", deleteTask);

export { router as tasksRouter };
