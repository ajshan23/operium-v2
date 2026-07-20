import { Router, IRouter } from "express";
import { Note, NoteBlock } from "@operium/db";
import { ApiResponse } from "../utils/ApiResponse.js";

const router: IRouter = Router();

router.get("/notes/:shareId", async (req: any, res: any) => {
  const shareId = String(req.params["shareId"]);

  try {
    // Public endpoint — expose only presentation fields, never owner ids
    const note = await Note.findOne({ shareId, isShared: true })
      .select("title tags type preview createdAt updatedAt").lean();
    if (!note) {
      res.status(404).json({ statusCode: 404, message: "Note not found or sharing disabled" });
      return;
    }

    const blocks = await NoteBlock.find({ noteId: note._id }).sort({ order: 1 }).select("content").lean();
    const content = blocks.map(b => b.content).join("\n\n");

    res.json(new ApiResponse(200, { note, content }, "Shared note"));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export { router as sharedRouter };
