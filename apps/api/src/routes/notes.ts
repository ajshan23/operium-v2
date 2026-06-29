import { Router } from "express";
import type { IRouter } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  listNotes, createNote, getNote, updateNote, deleteNote,
  toggleStarNote, setNoteSharing,
} from "../controllers/notes.controller.js";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/",    listNotes);
router.post("/",   createNote);
router.get("/:id", getNote);
router.put("/:id", updateNote);
router.delete("/:id", deleteNote);
router.post("/:id/star",    toggleStarNote);
router.post("/:id/sharing", setNoteSharing);

export { router as notesRouter };
