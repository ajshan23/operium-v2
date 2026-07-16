import { Router, IRouter } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { getOverview, syncGit } from "../controllers/git.controller.js";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/overview", getOverview);
router.post("/sync",    syncGit);

export { router as gitRouter };
