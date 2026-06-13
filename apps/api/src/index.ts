import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.APP_URL ?? "http://localhost:3000",
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

// ── Placeholder: API routes will be mounted here in M1 ──────────────────────
// app.use("/api/v1", apiRouter);

// ── Placeholder: MCP HTTP/SSE transport will be mounted here in M1 ──────────
// app.use("/mcp", mcpTransport);

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.API_PORT) || 4000;

app.listen(PORT, () => {
  console.log(`🟢 Operium API listening on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});
