import { Router, IRouter } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Task, CoworkSession, Note, WorkHistory, User } from "@operium/db";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/stats", async (req: any, res: any) => {
  const userId = req.user.userId as string;

  try {
    // Parallel aggregation — all at once
    const [
      tasks,
      coworkCount,
      noteCount,
      recentHistory,
      user,
    ] = await Promise.all([
      Task.find({ userId }).select("status").lean(),
      CoworkSession.countDocuments({ userId }),
      Note.countDocuments({ userId }),
      WorkHistory.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("category title summary createdAt source isMilestone isBlocker")
        .lean(),
      User.findById(userId).select("+githubToken +azureDevOpsToken +geminiApiKey githubLastSync azureLastSync").lean() as any,
    ]);

    // Task counts
    const taskCounts = { todo: 0, in_progress: 0, done: 0, cancelled: 0, total: tasks.length };
    for (const t of tasks) {
      const s = (t as any).status as string;
      (taskCounts as any)[s] = ((taskCounts as any)[s] ?? 0) + 1;
    }

    const integrations = {
      github:    !!user?.githubToken,
      azure:     !!user?.azureDevOpsToken,
      gemini:    !!user?.geminiApiKey,
      mcp:       true,
      githubLastSync: user?.githubLastSync ?? null,
      azureLastSync:  user?.azureLastSync  ?? null,
    };

    res.json(new ApiResponse(200, {
      tasks: taskCounts,
      coworkSessions: coworkCount,
      notes: noteCount,
      recentHistory,
      integrations,
    }, "Dashboard stats"));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export { router as dashboardRouter };
