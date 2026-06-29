import { Router, IRouter } from "express";
import { historyController } from "../controllers/history.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router: IRouter = Router();

router.use(requireAuth);

// ── Named routes MUST come before /:id ──────────────────────────────────────
router.get("/stats",       historyController.getStats);
router.get("/live",        historyController.getLiveItems);

router.post("/sync",       historyController.syncGithub);
router.post("/sync-azure", historyController.syncAzure);
router.post("/reset-azure", historyController.resetAzure);
router.post("/sync-custom", historyController.syncCustom);

router.get("/integrations",   historyController.getIntegrations);
router.patch("/integrations",  historyController.updateIntegrations);

router.get("/custom-integrations",  historyController.getCustomIntegrations);
router.put("/custom-integrations",  historyController.saveCustomIntegrations);

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.get("/",       historyController.getHistory);
router.post("/",      historyController.createEntry);
router.patch("/:id",  historyController.updateEntry);
router.delete("/:id", historyController.deleteEntry);

export { router as historyRouter };
