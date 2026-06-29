import { Router } from "express";
import type { IRouter } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  listSpaces, createSpace, getSpace, updateSpace, deleteSpace,
} from "../controllers/notes.controller.js";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/",    listSpaces);
router.post("/",   createSpace);
router.get("/:id", getSpace);
router.put("/:id", updateSpace);
router.delete("/:id", deleteSpace);

export { router as spacesRouter };
