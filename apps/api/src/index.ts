import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { connectDB } from "@operium/db";

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // In dev, allow common frontend ports. In prod, check against APP_URL strictly.
      const allowedOrigins = [process.env.APP_URL, "http://localhost:3000", "http://localhost:3001", "http://localhost:3002"];
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
import { mcpRouter }     from "./routes/mcp.js";
import { sharedRouter }  from "./routes/shared.js";

app.use("/api/auth",    authRouter);
app.use("/api/orgs",    orgRouter);
app.use("/api/history", historyRouter);
app.use("/api/spaces",  spacesRouter);
app.use("/api/notes",   notesRouter);
app.use("/api/cowork",  coworkRouter);
app.use("/api/tasks",     tasksRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/shared",  sharedRouter);
app.use("/mcp",         mcpRouter);

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.API_PORT) || 4000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🟢 Operium API listening on http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
    });
  })
  .catch((err) => {
    console.error("🔴 Failed to connect to DB, server not started:", err.message);
    process.exit(1);
  });
