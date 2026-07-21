import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { connectDB } from "@operium/db";
import { ApiError } from "./utils/ApiError.js";
import { startEmbedWorker } from "./lib/embedWorker.js";

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // In dev, allow common frontend ports. In prod, check against APP_URL strictly.
      const allowedOrigins = [process.env.APP_URL];
      if (process.env.NODE_ENV !== "production") {
        allowedOrigins.push("http://localhost:5000", "http://localhost:3000", "http://localhost:3001", "http://localhost:3002");
      }
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "operium-api",
    version: "0.0.0",
    timestamp: new Date().toISOString(),
  });
});

import { authRouter }    from "./routes/auth.js";
import { orgRouter }     from "./routes/org.js";
import { historyRouter } from "./routes/history.js";
import { spacesRouter }  from "./routes/spaces.js";
import { notesRouter }   from "./routes/notes.js";
import { coworkRouter }  from "./routes/cowork.js";
import { tasksRouter }     from "./routes/tasks.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { gitRouter }     from "./routes/git.js";
import { mcpRouter }     from "./routes/mcp.js";
import { sharedRouter }  from "./routes/shared.js";
import { boardsRouter }  from "./routes/boards.js";

app.use("/api/auth",    authRouter);
app.use("/api/orgs",    orgRouter);
app.use("/api/history", historyRouter);
app.use("/api/spaces",  spacesRouter);
app.use("/api/notes",   notesRouter);
app.use("/api/cowork",  coworkRouter);
app.use("/api/tasks",     tasksRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/git",     gitRouter);
app.use("/api/shared",  sharedRouter);
app.use("/api/boards",  boardsRouter);
app.use("/mcp",         mcpRouter);

// ── 404 + error handling ─────────────────────────────────────────────────────
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json(new ApiError(404, `Route not found: ${req.method} ${req.path}`).toJSON());
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json(err.toJSON());
    return;
  }
  if (err?.message === "Not allowed by CORS") {
    res.status(403).json(new ApiError(403, err.message).toJSON());
    return;
  }
  console.error(err);
  res.status(500).json(new ApiError(500, "Internal server error").toJSON());
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.API_PORT) || 4000;

connectDB()
  .then(() => {
    if (process.env.EMBED_WORKER !== "off") {
      startEmbedWorker(Number(process.env.EMBED_WORKER_INTERVAL_MS) || 10_000);
    } else {
      console.log("⚪ EmbedWorker disabled (EMBED_WORKER=off)");
    }
    app.listen(PORT, () => {
      console.log(`🟢 Operium API listening on http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
    });
  })
  .catch((err) => {
    console.error("🔴 Failed to connect to DB, server not started:", err.message);
    process.exit(1);
  });
